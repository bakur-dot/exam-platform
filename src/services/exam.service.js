'use strict';

const { prisma } = require('../lib/prisma');
const { STATUS } = require('../constants/question.constants');
const { checkExamEligibility } = require('./candidate.service');

// ─── Error type ───────────────────────────────────────────────────────────────

class ExamError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ExamError';
    this.statusCode = statusCode;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeAuditLog({ userId = null, action, tableName = 'CandidateAttempt', recordId, oldData = null, newData = null }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        tableName,
        recordId: String(recordId),
        oldData: oldData ? JSON.stringify(oldData) : null,
        newData: newData ? JSON.stringify(newData) : null,
      },
    });
  } catch (err) {
    console.error('[AuditLog] write failed:', err.message);
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Selects `count` questions from `pool`, capping overlap with `historyIds` at
 * `maxOverlapPct` (default 20%).
 *
 * Decision tree:
 *   A. fresh >= count          → take all from fresh; 0 repeats; cap enforced.
 *   B. fresh + capped_repeats  → take all fresh + just enough repeats to reach
 *        >= count                count, staying ≤ 20%; cap enforced.
 *   C. fresh + capped_repeats  → cap would leave the exam short; override and
 *        < count, but            take extra repeats to fill to `count`; cap
 *        fresh + all_repeats    NOT enforced — logged as a warning.
 *        >= count
 *   D. fresh + all_repeats     → pool genuinely too small; take everything
 *        < count                available; cap not enforced; isPoolLimited=true.
 *
 * The cap is NEVER silently violated. Every override is surfaced in the return
 * value so the caller can log or alert an administrator.
 *
 * @param {object[]} pool       All APPROVED+active questions (already include answers w/o isCorrect)
 * @param {Set<number>} historyIds  Question IDs from the candidate's last 3 attempts
 * @param {number} count        Required question count from the exam profile
 * @param {number} maxOverlapPct  Maximum fraction of repeat questions (default 0.20)
 * @returns {{ selected, overlapCount, overlapPct, capEnforced, isPoolLimited }}
 */
function selectWithOverlapCap(pool, historyIds, count, maxOverlapPct = 0.20) {
  const maxAllowedRepeats = Math.floor(count * maxOverlapPct);

  const fresh   = shuffle(pool.filter(q => !historyIds.has(q.id)));
  const repeats = shuffle(pool.filter(q =>  historyIds.has(q.id)));

  // ── Case A: enough fresh questions, no repeats needed ────────────────────
  if (fresh.length >= count) {
    return {
      selected:      fresh.slice(0, count),
      overlapCount:  0,
      overlapPct:    0,
      capEnforced:   true,
      isPoolLimited: false,
    };
  }

  const repeatsNeeded   = count - fresh.length;
  const cappedAvailable = Math.min(maxAllowedRepeats, repeats.length);

  let fromRepeats;
  let capEnforced;

  if (fresh.length + cappedAvailable >= count) {
    // ── Case B: cap respected, exam fills to `count` ──────────────────────
    fromRepeats = repeats.slice(0, repeatsNeeded);
    capEnforced = true;
  } else {
    // ── Cases C & D: override cap to maximise questions ───────────────────
    fromRepeats = repeats.slice(0, Math.min(repeatsNeeded, repeats.length));
    capEnforced = false;
  }

  const selected      = shuffle([...fresh, ...fromRepeats]);
  const totalSelected = selected.length;

  return {
    selected,
    overlapCount:  fromRepeats.length,
    overlapPct:    totalSelected > 0 ? fromRepeats.length / totalSelected : 0,
    capEnforced,
    isPoolLimited: totalSelected < count,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates a new exam attempt for a candidate.
 *
 * 1. Guards against concurrent active attempts on the same profile.
 * 2. Builds a history set from the candidate's last 3 completed attempts.
 * 3. Selects questions from the APPROVED pool with ≤20% overlap (see selectWithOverlapCap).
 * 4. Creates the CandidateAttempt and pre-seeds one AttemptAnswer row per
 *    assigned question (selectedAnswerId = null) — preserving the exact question
 *    set the candidate was given for ISO 17024 auditability.
 * 5. Returns attempt metadata + questions (answers WITHOUT isCorrect).
 */
async function generateExam(userId, profileId, sessionId) {
  // ── Guard: document eligibility (ISO 17024 pre-condition) ────────────────
  const eligible = await checkExamEligibility(userId);
  if (!eligible) {
    throw new ExamError(
      'You cannot start an exam until all 4 required documents ' +
      '(DIPLOMA, EXPERIENCE, ID_CARD, PHOTO) have been approved by an administrator.',
      403
    );
  }

  // ── Guard: session authorization (ISO 17024 pre-exam protocol) ───────────
  const seat = await prisma.sessionCandidate.findUnique({
    where:   { sessionId_candidateId: { sessionId, candidateId: userId } },
    include: { session: { select: { examProfileId: true } } },
  });
  if (!seat) {
    throw new ExamError('You are not registered in the specified exam session.', 403);
  }
  if (seat.session.examProfileId !== profileId) {
    throw new ExamError('This session is configured for a different exam profile.', 400);
  }
  if (seat.startStatus !== 'AUTHORIZED') {
    throw new ExamError(
      'The examiner has not yet authorized you to start. ' +
      'Ensure the pre-exam protocol is complete and the examiner has granted authorization.',
      403
    );
  }

  // ── Guard: one active attempt per profile ─────────────────────────────────
  const active = await prisma.candidateAttempt.findFirst({
    where: { userId, examProfileId: profileId, status: 'IN_PROGRESS' },
  });
  if (active) {
    throw new ExamError(
      `You already have an active attempt (id=${active.id}) for this exam. Resume or submit it first.`,
      409
    );
  }

  // ── Load exam profile ─────────────────────────────────────────────────────
  const profile = await prisma.examProfile.findUniqueOrThrow({
    where: { id: profileId },
    include: {
      specialization: {
        include: { chapters: { select: { id: true } } },
      },
    },
  });

  // ── History: last 3 completed attempts ───────────────────────────────────
  const pastAttempts = await prisma.candidateAttempt.findMany({
    where: {
      userId,
      examProfileId: profileId,
      status: { in: ['SUBMITTED', 'TIMED_OUT'] },
    },
    orderBy: { endTime: 'desc' },
    take: 3,
    include: {
      answers:          { select: { questionId: true } },
      assignedProjects: { select: { projectId: true } },
    },
  });

  const historyIds = new Set(
    pastAttempts.flatMap(a => a.answers.map(aa => aa.questionId))
  );

  // ── Fetch APPROVED pool (answers without isCorrect) ───────────────────────
  const chapterIds = profile.specialization.chapters.map(c => c.id);

  const pool = await prisma.question.findMany({
    where: { chapterId: { in: chapterIds }, status: STATUS.APPROVED, isActive: true },
    include: {
      answers: { select: { id: true, content: true } },   // isCorrect intentionally excluded
      chapter: { select: { id: true, name: true } },
    },
  });

  if (pool.length === 0) {
    throw new ExamError(
      'No approved questions are available for this exam profile. Contact an administrator.',
      503
    );
  }

  // ── Question selection with overlap cap ───────────────────────────────────
  const selection = selectWithOverlapCap(pool, historyIds, profile.questionCount);

  if (!selection.capEnforced) {
    console.warn(
      `[generateExam] 20% overlap cap overridden — ` +
      `userId=${userId} profileId=${profileId} ` +
      `pool=${pool.length} fresh=${pool.length - historyIds.size} ` +
      `overlap=${(selection.overlapPct * 100).toFixed(1)}%`
    );
  }
  if (selection.isPoolLimited) {
    console.warn(
      `[generateExam] Pool-limited: needed ${profile.questionCount}, ` +
      `selected ${selection.selected.length}.`
    );
  }

  // ── Project selection (when requiresProjects) ─────────────────────────────
  let selectedProjects = [];
  let projectSelection = null;

  if (profile.requiresProjects) {
    const projectPool = await prisma.project.findMany({
      where: { specializationId: profile.specializationId, isActive: true },
      include: { mistakes: { select: { id: true, description: true, penaltyPoints: true } } },
    });

    const projectHistoryIds = new Set(
      pastAttempts.flatMap(a => a.assignedProjects.map(ap => ap.projectId))
    );

    projectSelection = selectWithOverlapCap(projectPool, projectHistoryIds, 2);
    selectedProjects = projectSelection.selected;

    if (!projectSelection.capEnforced) {
      console.warn(
        `[generateExam] Project 20% overlap cap overridden — ` +
        `userId=${userId} profileId=${profileId} ` +
        `projectPool=${projectPool.length} overlap=${(projectSelection.overlapPct * 100).toFixed(1)}%`
      );
    }
    if (projectSelection.isPoolLimited) {
      console.warn(
        `[generateExam] Project pool-limited: needed 2, selected ${selectedProjects.length}.`
      );
    }
  }

  // ── Atomically create attempt + pre-seed AttemptAnswer + AttemptProject rows ──
  const now = new Date();
  const attempt = await prisma.$transaction(async (tx) => {
    const a = await tx.candidateAttempt.create({
      data: { userId, examProfileId: profileId, sessionId, startTime: now, status: 'IN_PROGRESS' },
    });
    await tx.attemptAnswer.createMany({
      data: selection.selected.map(q => ({
        attemptId:        a.id,
        questionId:       q.id,
        selectedAnswerId: null,
      })),
    });
    if (selectedProjects.length > 0) {
      await tx.attemptProject.createMany({
        data: selectedProjects.map(p => ({
          attemptId: a.id,
          projectId: p.id,
        })),
      });
    }
    return a;
  });

  await writeAuditLog({
    userId,
    action:    'EXAM_STARTED',
    recordId:  attempt.id,
    newData: {
      profileId,
      sessionId,
      assignedCount:  selection.selected.length,
      overlapCount:   selection.overlapCount,
      overlapPct:     parseFloat((selection.overlapPct * 100).toFixed(1)),
      capEnforced:    selection.capEnforced,
      historyDepth:   pastAttempts.length,
      projectCount:   selectedProjects.length,
    },
  });

  return {
    attempt: {
      id:        attempt.id,
      sessionId,
      startTime: attempt.startTime,
      expiresAt: new Date(now.getTime() + profile.durationMinutes * 60 * 1000),
      status:    attempt.status,
    },
    exam: {
      profileId:          profile.id,
      specializationName: profile.specialization.name,
      durationMinutes:    profile.durationMinutes,
      questionCount:      profile.questionCount,
      passingScore:       profile.passingScore,
      isExpert:           profile.isExpert,
      requiresProjects:   profile.requiresProjects,
    },
    questions: selection.selected,
    projects:  selectedProjects,
    meta: {
      assignedCount:  selection.selected.length,
      overlapCount:   selection.overlapCount,
      overlapPct:     parseFloat((selection.overlapPct * 100).toFixed(1)),
      capEnforced:    selection.capEnforced,
      isPoolLimited:  selection.isPoolLimited,
      historyDepth:   pastAttempts.length,
      projectCount:   selectedProjects.length,
    },
  };
}

/**
 * Idempotent auto-save for a single answer. Called on every answer selection.
 *
 * Guards:
 *  - Attempt must be IN_PROGRESS.
 *  - Server-side time check: auto-closes as TIMED_OUT if deadline passed.
 *  - Question must be part of this attempt's assigned set.
 *  - selectedAnswerId (if provided) must belong to the given question.
 *
 * Uses upsert on the (attemptId, questionId) unique key so repeated calls
 * for the same question overwrite the previous answer safely.
 */
async function saveAnswer(attemptId, questionId, selectedAnswerId) {
  // ── Load attempt ──────────────────────────────────────────────────────────
  const attempt = await prisma.candidateAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { examProfile: true },
  });

  if (attempt.status !== 'IN_PROGRESS') {
    const reason =
      attempt.status === 'SUBMITTED' ? 'This exam has already been submitted.' :
      attempt.status === 'TIMED_OUT' ? 'Exam time has expired.'                :
      `Attempt is not active (status: ${attempt.status}).`;
    throw new ExamError(reason, 409);
  }

  // ── Server-side time guard ────────────────────────────────────────────────
  const expiresAt = new Date(
    attempt.startTime.getTime() + attempt.examProfile.durationMinutes * 60 * 1000
  );
  if (new Date() > expiresAt) {
    await prisma.candidateAttempt.update({
      where: { id: attemptId },
      data:  { status: 'TIMED_OUT', endTime: expiresAt },
    });
    await writeAuditLog({
      userId:   attempt.userId,
      action:   'EXAM_TIMED_OUT',
      recordId: attemptId,
      newData:  { autoClosedBy: 'saveAnswer', expiredAt: expiresAt },
    });
    throw new ExamError(
      'Exam time has expired. Your attempt has been automatically closed.',
      410
    );
  }

  // ── Verify question was assigned to this attempt ──────────────────────────
  const assignedRow = await prisma.attemptAnswer.findUnique({
    where: { attemptId_questionId: { attemptId, questionId } },
  });
  if (!assignedRow) {
    throw new ExamError('This question was not assigned to your exam.', 400);
  }

  // ── Validate answer belongs to the question ───────────────────────────────
  if (selectedAnswerId !== null && selectedAnswerId !== undefined) {
    const answer = await prisma.answer.findUnique({ where: { id: selectedAnswerId } });
    if (!answer || answer.questionId !== questionId) {
      throw new ExamError('Selected answer does not belong to this question.', 400);
    }
  }

  // ── Upsert (idempotent) ───────────────────────────────────────────────────
  return prisma.attemptAnswer.upsert({
    where:  { attemptId_questionId: { attemptId, questionId } },
    update: { selectedAnswerId: selectedAnswerId ?? null },
    create: { attemptId, questionId, selectedAnswerId: selectedAnswerId ?? null },
  });
}

/**
 * Syncs mistake marks for one assigned project (examiner evaluation).
 *
 * Replaces the entire AttemptProjectMistake set for this AttemptProject with
 * the supplied mistakeIds — pass an empty array to clear all marks.
 *
 * Guards:
 *  - Attempt must be IN_PROGRESS.
 *  - AttemptProject must belong to this attempt.
 *  - All mistakeIds must belong to the given project.
 */
async function saveProjectMistakes(attemptId, projectId, mistakeIds) {
  const attempt = await prisma.candidateAttempt.findUniqueOrThrow({
    where: { id: attemptId },
  });

  if (attempt.status !== 'IN_PROGRESS') {
    const reason =
      attempt.status === 'SUBMITTED' ? 'This exam has already been submitted.' :
      attempt.status === 'TIMED_OUT' ? 'Exam time has expired.'                :
      `Attempt is not active (status: ${attempt.status}).`;
    throw new ExamError(reason, 409);
  }

  const attemptProject = await prisma.attemptProject.findUnique({
    where:   { attemptId_projectId: { attemptId, projectId } },
    include: { project: { include: { mistakes: { select: { id: true } } } } },
  });
  if (!attemptProject) {
    throw new ExamError('This project was not assigned to your exam.', 400);
  }

  const validMistakeIds = new Set(attemptProject.project.mistakes.map(m => m.id));
  const invalid = mistakeIds.filter(id => !validMistakeIds.has(id));
  if (invalid.length > 0) {
    throw new ExamError(
      `Mistake ID(s) [${invalid.join(', ')}] do not belong to this project.`,
      400
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.attemptProjectMistake.deleteMany({
      where: { attemptProjectId: attemptProject.id },
    });
    if (mistakeIds.length > 0) {
      await tx.attemptProjectMistake.createMany({
        data: mistakeIds.map(mistakeId => ({
          attemptProjectId: attemptProject.id,
          mistakeId,
        })),
      });
    }
  });

  return { attemptProjectId: attemptProject.id, markedCount: mistakeIds.length };
}

/**
 * Scores and closes a candidate's attempt.
 *
 * Accepts both IN_PROGRESS and TIMED_OUT attempts (TIMED_OUT means the server
 * already closed it via saveAnswer's time guard; we still need to grade it).
 *
 * Scoring:
 *  - Denominator = questions assigned to the attempt (AttemptAnswer row count).
 *  - Unanswered questions count as wrong (selectedAnswerId = null → 0 marks).
 *  - finalScore = (correct / totalAssigned) * 100, rounded to 2 dp.
 *  - Passed if finalScore >= profile.passingScore.
 */
async function finishExam(attemptId) {
  const attempt = await prisma.candidateAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { examProfile: true },
  });

  if (attempt.status === 'SUBMITTED') {
    throw new ExamError('This exam has already been submitted.', 409);
  }
  if (attempt.status !== 'IN_PROGRESS' && attempt.status !== 'TIMED_OUT') {
    throw new ExamError(`Cannot grade an attempt with status: ${attempt.status}.`, 400);
  }

  const now       = new Date();
  const expiresAt = new Date(
    attempt.startTime.getTime() + attempt.examProfile.durationMinutes * 60 * 1000
  );
  const isTimedOut   = attempt.status === 'TIMED_OUT' || now > expiresAt;
  const finalStatus  = isTimedOut ? 'TIMED_OUT' : 'SUBMITTED';

  // ── MCQ scoring ───────────────────────────────────────────────────────────
  const attemptAnswers = await prisma.attemptAnswer.findMany({
    where:   { attemptId },
    include: { selectedAnswer: { select: { isCorrect: true } } },
  });

  const totalAssigned = attemptAnswers.length;
  const answeredCount = attemptAnswers.filter(aa => aa.selectedAnswerId !== null).length;
  const correctCount  = attemptAnswers.filter(aa => aa.selectedAnswer?.isCorrect === true).length;

  // Unanswered questions count as wrong (denominator = totalAssigned)
  const finalScore = totalAssigned > 0
    ? parseFloat(((correctCount / totalAssigned) * 100).toFixed(2))
    : 0;

  const passed = finalScore >= attempt.examProfile.passingScore;

  // ── Project scoring: score = max(0, 100 - sum(penaltyPoints)) ────────────
  const attemptProjects = await prisma.attemptProject.findMany({
    where:   { attemptId },
    include: {
      mistakes: { include: { mistake: { select: { penaltyPoints: true } } } },
    },
  });

  const projectScores = [];
  for (const ap of attemptProjects) {
    const totalPenalty = ap.mistakes.reduce((sum, m) => sum + m.mistake.penaltyPoints, 0);
    const score = parseFloat(Math.max(0, 100 - totalPenalty).toFixed(2));
    await prisma.attemptProject.update({ where: { id: ap.id }, data: { score } });
    projectScores.push({ projectId: ap.projectId, score });
  }

  const avgProjectScore = projectScores.length > 0
    ? parseFloat((projectScores.reduce((s, p) => s + p.score, 0) / projectScores.length).toFixed(2))
    : null;

  // ── Persist attempt result ────────────────────────────────────────────────
  await prisma.candidateAttempt.update({
    where: { id: attemptId },
    data:  {
      status:     finalStatus,
      finalScore,
      endTime:    isTimedOut ? expiresAt : now,
    },
  });

  await writeAuditLog({
    userId:   attempt.userId,
    action:   isTimedOut ? 'EXAM_TIMED_OUT' : 'EXAM_SUBMITTED',
    recordId: attemptId,
    newData:  {
      finalScore,
      passingScore:    attempt.examProfile.passingScore,
      passed,
      correctCount,
      answeredCount,
      totalAssigned,
      avgProjectScore,
      projectScores,
    },
  });

  return {
    attemptId,
    status:          finalStatus,
    finalScore,
    passingScore:    attempt.examProfile.passingScore,
    passed,
    correctCount,
    answeredCount,
    totalAssigned,
    avgProjectScore,
    projectScores,
  };
}

module.exports = { ExamError, generateExam, saveAnswer, saveProjectMistakes, finishExam };
