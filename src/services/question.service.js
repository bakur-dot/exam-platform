'use strict';

const { prisma } = require('../lib/prisma');
const { STATUS, EDITABLE_IN_PLACE, LOCKED, TRANSITIONS } = require('../constants/question.constants');

// ─── Error type ───────────────────────────────────────────────────────────────

class QuestionError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'QuestionError';
    this.statusCode = statusCode;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeAuditLog({ userId = null, action, tableName = 'Question', recordId, oldData = null, newData = null }) {
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

function assertTransition(current, target) {
  if (!TRANSITIONS[current]?.includes(target)) {
    throw new QuestionError(
      `Invalid status transition: ${current} → ${target}. Allowed: ${(TRANSITIONS[current] || []).join(', ') || 'none'}.`
    );
  }
}

// Fisher-Yates shuffle — used by getExamQuestions to randomize question pool
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Creates a new question at version 1 with status DRAFT.
 * The questionGroupId is set to the question's own id after insert (self-referential),
 * tying it as the origin of a new version lineage.
 *
 * @param {{ chapterId, content, imageUrl?, answers: [{content, isCorrect}] }} data
 * @param {number} creatorId
 */
async function createDraft({ chapterId, content, imageUrl = null, answers = [] }, creatorId) {
  const question = await prisma.$transaction(async (tx) => {
    // Insert with placeholder groupId (0 is safe — not a FK)
    const q = await tx.question.create({
      data: {
        questionGroupId: 0,
        chapterId,
        content,
        imageUrl,
        version: 1,
        isActive: true,
        status: STATUS.DRAFT,
        answers: {
          create: answers.map(({ content: c, isCorrect = false }) => ({ content: c, isCorrect })),
        },
      },
      include: { answers: true },
    });

    // Self-reference: this question is the root of its own group
    return tx.question.update({
      where: { id: q.id },
      data: { questionGroupId: q.id },
      include: { answers: true, chapter: { include: { specialization: true } } },
    });
  });

  await writeAuditLog({
    userId: creatorId,
    action: 'QUESTION_CREATED',
    recordId: question.id,
    newData: { status: STATUS.DRAFT, version: 1, questionGroupId: question.id },
  });

  return question;
}

/**
 * Moves a DRAFT question to PENDING (submitted for admin review).
 */
async function submitForApproval(questionId, submitterId) {
  const question = await prisma.question.findUniqueOrThrow({ where: { id: questionId } });
  assertTransition(question.status, STATUS.PENDING);

  const updated = await prisma.question.update({
    where: { id: questionId },
    data: { status: STATUS.PENDING },
  });

  await writeAuditLog({
    userId: submitterId,
    action: 'QUESTION_SUBMITTED',
    recordId: questionId,
    oldData: { status: STATUS.DRAFT },
    newData: { status: STATUS.PENDING },
  });

  return updated;
}

/**
 * Admin approves a PENDING question. Makes it eligible for exam selection.
 */
async function approveQuestion(questionId, adminId) {
  const question = await prisma.question.findUniqueOrThrow({ where: { id: questionId } });
  assertTransition(question.status, STATUS.APPROVED);

  const updated = await prisma.question.update({
    where: { id: questionId },
    data: { status: STATUS.APPROVED, isActive: true },
  });

  await writeAuditLog({
    userId: adminId,
    action: 'QUESTION_APPROVED',
    recordId: questionId,
    oldData: { status: STATUS.PENDING },
    newData: { status: STATUS.APPROVED },
  });

  return updated;
}

/**
 * Admin rejects a PENDING question (returns it for revision).
 */
async function rejectQuestion(questionId, adminId, reason = null) {
  const question = await prisma.question.findUniqueOrThrow({ where: { id: questionId } });
  assertTransition(question.status, STATUS.REJECTED);

  const updated = await prisma.question.update({
    where: { id: questionId },
    data: { status: STATUS.REJECTED },
  });

  await writeAuditLog({
    userId: adminId,
    action: 'QUESTION_REJECTED',
    recordId: questionId,
    oldData: { status: STATUS.PENDING },
    newData: { status: STATUS.REJECTED, reason },
  });

  return updated;
}

/**
 * Edits a question. Two paths depending on current status:
 *
 * DRAFT / REJECTED → in-place update (no new version created).
 *   Answers are fully replaced if provided.
 *
 * APPROVED → immutable versioning (ISO 17024):
 *   1. Current row: status → ARCHIVED, isActive → false  (permanent record)
 *   2. New row:     same questionGroupId, version + 1, status = DRAFT, isActive = true
 *   3. Answers are carried forward from the old version unless newData.answers is provided.
 *
 * PENDING / ARCHIVED → blocked (throws QuestionError).
 *
 * @param {number} questionId
 * @param {{ content?, imageUrl?, chapterId?, answers?: [{content, isCorrect}] }} newData
 * @param {number} editorId
 */
async function editQuestion(questionId, newData, editorId) {
  const question = await prisma.question.findUniqueOrThrow({
    where: { id: questionId },
    include: { answers: true },
  });

  if (LOCKED.has(question.status)) {
    throw new QuestionError(
      question.status === STATUS.PENDING
        ? 'Cannot edit a question while it is under review. Wait for approval or rejection.'
        : 'Cannot edit an archived question. Find the active version in the same question group.'
    );
  }

  // ── Path A: in-place update (DRAFT or REJECTED) ───────────────────────────
  if (EDITABLE_IN_PLACE.has(question.status)) {
    const updated = await prisma.$transaction(async (tx) => {
      const q = await tx.question.update({
        where: { id: questionId },
        data: {
          ...(newData.content    !== undefined && { content:   newData.content }),
          ...(newData.imageUrl   !== undefined && { imageUrl:  newData.imageUrl }),
          ...(newData.chapterId  !== undefined && { chapterId: newData.chapterId }),
        },
      });

      if (newData.answers) {
        await tx.answer.deleteMany({ where: { questionId } });
        await tx.answer.createMany({
          data: newData.answers.map(({ content: c, isCorrect = false }) => ({
            questionId, content: c, isCorrect,
          })),
        });
      }

      return tx.question.findUnique({ where: { id: q.id }, include: { answers: true } });
    });

    await writeAuditLog({
      userId: editorId,
      action: 'QUESTION_EDITED',
      recordId: questionId,
      oldData: { content: question.content, status: question.status },
      newData: { content: updated.content },
    });

    return updated;
  }

  // ── Path B: versioned edit (APPROVED) — ISO 17024 immutability ───────────
  //
  // The APPROVED row is NEVER mutated. It is archived to preserve the exact
  // content that was used in past exams. A fresh DRAFT inherits the lineage.

  const newQuestion = await prisma.$transaction(async (tx) => {
    // 1. Freeze the approved version
    await tx.question.update({
      where: { id: questionId },
      data: { status: STATUS.ARCHIVED, isActive: false },
    });

    // 2. Create new DRAFT version in the same group
    const q = await tx.question.create({
      data: {
        questionGroupId: question.questionGroupId,
        chapterId:  newData.chapterId  ?? question.chapterId,
        content:    newData.content    ?? question.content,
        imageUrl:   newData.imageUrl   !== undefined ? newData.imageUrl : question.imageUrl,
        version:    question.version + 1,
        isActive:   true,
        status:     STATUS.DRAFT,
      },
    });

    // 3. Carry forward answers (edited or inherited from the archived version)
    const answersToWrite = newData.answers
      ? newData.answers.map(({ content: c, isCorrect = false }) => ({ questionId: q.id, content: c, isCorrect }))
      : question.answers.map(({ content: c, isCorrect }) => ({ questionId: q.id, content: c, isCorrect }));

    await tx.answer.createMany({ data: answersToWrite });

    return tx.question.findUnique({ where: { id: q.id }, include: { answers: true } });
  });

  await writeAuditLog({
    userId: editorId,
    action: 'QUESTION_VERSION_CREATED',
    recordId: newQuestion.id,
    oldData: { id: questionId, version: question.version, status: STATUS.APPROVED },
    newData: { id: newQuestion.id, version: newQuestion.version, status: STATUS.DRAFT, questionGroupId: newQuestion.questionGroupId },
  });

  // Separate audit entry for the archival of the old version
  await writeAuditLog({
    userId: editorId,
    action: 'QUESTION_ARCHIVED',
    recordId: questionId,
    oldData: { status: STATUS.APPROVED },
    newData: { status: STATUS.ARCHIVED, replacedById: newQuestion.id },
  });

  return newQuestion;
}

/**
 * Returns a randomised set of `profile.questionCount` APPROVED+active questions
 * for the given exam profile's specialization.
 *
 * Answers are included but isCorrect is stripped — the correct answers are only
 * exposed during grading, not during the exam itself.
 */
async function getExamQuestions(profileId) {
  const profile = await prisma.examProfile.findUniqueOrThrow({
    where: { id: profileId },
    include: {
      specialization: {
        include: { chapters: { select: { id: true } } },
      },
    },
  });

  const chapterIds = profile.specialization.chapters.map((c) => c.id);

  const pool = await prisma.question.findMany({
    where: { chapterId: { in: chapterIds }, status: STATUS.APPROVED, isActive: true },
    include: {
      answers: { select: { id: true, content: true } }, // isCorrect intentionally excluded
      chapter: { select: { id: true, name: true } },
    },
  });

  const selected = shuffle(pool).slice(0, profile.questionCount);

  return {
    profileId: profile.id,
    specializationName: profile.specialization.name,
    requestedCount:  profile.questionCount,
    availableCount:  pool.length,
    selectedCount:   selected.length,
    questions:       selected,
  };
}

/**
 * Returns all versions of a question group, ordered by version ascending.
 * Useful for admin audit view and ISO 17024 traceability.
 */
async function getQuestionHistory(questionGroupId) {
  return prisma.question.findMany({
    where: { questionGroupId },
    orderBy: { version: 'asc' },
    include: { answers: true, chapter: { include: { specialization: true } } },
  });
}

async function getAllChapters() {
  return prisma.chapter.findMany({
    include: { specialization: true },
    orderBy: [{ specialization: { name: 'asc' } }, { name: 'asc' }],
  });
}

async function getQuestions() {
  return prisma.question.findMany({
    where:   { isActive: true },
    include: { chapter: { include: { specialization: true } }, answers: true },
    orderBy: { createdAt: 'desc' },
  });
}

module.exports = {
  QuestionError,
  createDraft,
  submitForApproval,
  approveQuestion,
  rejectQuestion,
  editQuestion,
  getExamQuestions,
  getQuestionHistory,
  getAllChapters,
  getQuestions,
};
