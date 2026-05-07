'use strict';

const { prisma } = require('../lib/prisma');

// ─── Error type ───────────────────────────────────────────────────────────────

class ReportError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ReportError';
    this.statusCode = statusCode;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns all exam attempts for a candidate, newest first.
 * Each row includes exam profile info and the appeal status (if any).
 */
async function getCandidateHistory(userId) {
  const attempts = await prisma.candidateAttempt.findMany({
    where:   { userId },
    orderBy: { startTime: 'desc' },
    include: {
      examProfile: {
        include: { specialization: { select: { id: true, name: true } } },
      },
      appeal: { select: { id: true, status: true, createdAt: true } },
    },
  });

  return attempts.map(a => ({
    id:         a.id,
    startTime:  a.startTime,
    endTime:    a.endTime,
    status:     a.status,
    finalScore: a.finalScore,
    passed:     a.finalScore !== null
      ? a.finalScore >= a.examProfile.passingScore
      : null,
    examProfile: {
      id:                 a.examProfile.id,
      specializationName: a.examProfile.specialization.name,
      passingScore:       a.examProfile.passingScore,
      durationMinutes:    a.examProfile.durationMinutes,
      isExpert:           a.examProfile.isExpert,
      requiresProjects:   a.examProfile.requiresProjects,
    },
    appeal: a.appeal
      ? { id: a.appeal.id, status: a.appeal.status, createdAt: a.appeal.createdAt }
      : null,
  }));
}

/**
 * Returns a full breakdown of one attempt.
 *
 * Authorization: if requesterId is provided, the attempt must belong to that user.
 * Pass requesterId = null to bypass the check (admin/internal use).
 *
 * Per-chapter score calculation:
 *   AttemptAnswer rows are grouped by question.chapterId. For each chapter we
 *   count total questions assigned from that chapter and how many the candidate
 *   answered correctly (selectedAnswer.isCorrect === true). The chapter score is
 *   (correctAnswers / totalQuestions) * 100, rounded to 2 dp.
 *   Unanswered questions count as wrong — consistent with finishExam's denominator.
 *
 * isCorrect is used internally to compute wasCorrect (per-question outcome) and
 * chapterScores, but is NEVER included in the returned objects — the candidate
 * learns only whether their own choice was right, not which option was correct.
 */
async function getAttemptDetails(attemptId, requesterId) {
  const attempt = await prisma.candidateAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: {
      examProfile: {
        include: { specialization: { select: { id: true, name: true } } },
      },
      appeal: {
        select: {
          id: true,
          status: true,
          decisionNotes: true,
          isScoreChanged: true,
          createdAt: true,
        },
      },
      answers: {
        include: {
          question: {
            select: {
              id:       true,
              content:  true,
              imageUrl: true,
              chapter:  { select: { id: true, name: true } },
            },
          },
          // isCorrect fetched for internal scoring only — stripped before return
          selectedAnswer: { select: { id: true, content: true, isCorrect: true } },
        },
      },
      assignedProjects: {
        include: {
          project: { select: { id: true, title: true, description: true } },
          mistakes: {
            include: {
              mistake: { select: { id: true, description: true, penaltyPoints: true } },
            },
          },
        },
      },
    },
  });

  // Ownership guard — treat unauthorised access as not-found to avoid id enumeration
  if (requesterId !== null && attempt.userId !== requesterId) {
    throw new ReportError('Attempt not found.', 404);
  }

  // ── Per-chapter score breakdown ───────────────────────────────────────────
  // Groups by chapterId; unanswered = wrong (wasCorrect = false).
  const chapterMap = new Map();

  const questions = attempt.answers.map(aa => {
    const wasCorrect = aa.selectedAnswer?.isCorrect === true;
    const ch         = aa.question.chapter;

    if (!chapterMap.has(ch.id)) {
      chapterMap.set(ch.id, { chapterId: ch.id, chapterName: ch.name, total: 0, correct: 0 });
    }
    const entry = chapterMap.get(ch.id);
    entry.total++;
    if (wasCorrect) entry.correct++;

    // Return the candidate's outcome, NOT the answer's isCorrect flag
    return {
      questionId:       aa.question.id,
      content:          aa.question.content,
      imageUrl:         aa.question.imageUrl,
      chapterId:        ch.id,
      chapterName:      ch.name,
      selectedAnswerId: aa.selectedAnswerId,
      selectedAnswer:   aa.selectedAnswer
        ? { id: aa.selectedAnswer.id, content: aa.selectedAnswer.content }
        : null,
      wasCorrect,
    };
  });

  const chapterScores = Array.from(chapterMap.values()).map(ch => ({
    chapterId:      ch.chapterId,
    chapterName:    ch.chapterName,
    totalQuestions: ch.total,
    correctAnswers: ch.correct,
    score: ch.total > 0
      ? parseFloat(((ch.correct / ch.total) * 100).toFixed(2))
      : 0,
  }));

  // ── Project scores ────────────────────────────────────────────────────────
  const projects = attempt.assignedProjects.map(ap => ({
    attemptProjectId: ap.id,
    projectId:        ap.project.id,
    title:            ap.project.title,
    description:      ap.project.description,
    score:            ap.score,
    markedMistakes:   ap.mistakes.map(m => ({
      id:            m.mistake.id,
      description:   m.mistake.description,
      penaltyPoints: m.mistake.penaltyPoints,
    })),
  }));

  const avgProjectScore = projects.length > 0
    ? parseFloat(
        (projects.reduce((s, p) => s + (p.score ?? 0), 0) / projects.length).toFixed(2)
      )
    : null;

  return {
    attemptId:    attempt.id,
    userId:       attempt.userId,
    startTime:    attempt.startTime,
    endTime:      attempt.endTime,
    status:       attempt.status,
    finalScore:   attempt.finalScore,
    passingScore: attempt.examProfile.passingScore,
    passed:       attempt.finalScore !== null
      ? attempt.finalScore >= attempt.examProfile.passingScore
      : null,
    examProfile: {
      id:                 attempt.examProfile.id,
      specializationName: attempt.examProfile.specialization.name,
      passingScore:       attempt.examProfile.passingScore,
      isExpert:           attempt.examProfile.isExpert,
      requiresProjects:   attempt.examProfile.requiresProjects,
    },
    questions,
    chapterScores,
    projects,
    avgProjectScore,
    appeal: attempt.appeal,
  };
}

module.exports = { ReportError, getCandidateHistory, getAttemptDetails };
