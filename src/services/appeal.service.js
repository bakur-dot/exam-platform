'use strict';

const { prisma } = require('../lib/prisma');

// ─── Error type ───────────────────────────────────────────────────────────────

class AppealError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AppealError';
    this.statusCode = statusCode;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeAuditLog({ userId = null, action, tableName, recordId, oldData = null, newData = null }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        tableName,
        recordId: String(recordId),
        oldData:  oldData  ? JSON.stringify(oldData)  : null,
        newData:  newData  ? JSON.stringify(newData)  : null,
      },
    });
  } catch (err) {
    console.error('[AuditLog] write failed:', err.message);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Files an appeal for a submitted attempt.
 *
 * Guards (all must pass):
 *  - Attempt must belong to the requesting user.
 *  - Attempt status must be SUBMITTED (not TIMED_OUT — those require admin action).
 *  - No appeal must already exist for this attempt (DB unique constraint backs this up).
 *
 * @param {number} attemptId   The attempt being appealed
 * @param {number} userId      The candidate filing the appeal
 * @param {string} documentUrl Path to the uploaded supporting document
 */
async function createAppeal(attemptId, userId, documentUrl) {
  const attempt = await prisma.candidateAttempt.findUniqueOrThrow({
    where:   { id: attemptId },
    include: { appeal: { select: { id: true } } },
  });

  // Treat a foreign attempt as not-found to prevent id enumeration
  if (attempt.userId !== userId) {
    throw new AppealError('Attempt not found.', 404);
  }

  if (attempt.status !== 'SUBMITTED') {
    throw new AppealError(
      `Appeals can only be filed for submitted attempts (current status: ${attempt.status}).`,
      422
    );
  }

  if (attempt.appeal) {
    throw new AppealError('An appeal has already been filed for this attempt.', 409);
  }

  const appeal = await prisma.appeal.create({
    data: { attemptId, documentUrl, status: 'PENDING' },
  });

  await writeAuditLog({
    userId,
    action:    'APPEAL_CREATED',
    tableName: 'Appeal',
    recordId:  appeal.id,
    newData:   { attemptId, documentUrl },
  });

  return appeal;
}

/**
 * Records a commission's review decision on an appeal.
 *
 * If isScoreChanged is true and newFinalScore is provided, the attempt's
 * finalScore is updated inside the same transaction and a separate SCORE_OVERRIDE
 * audit entry is written to maintain a clear audit trail.
 *
 * Guards:
 *  - Appeal must exist.
 *  - Appeal must not already be REVIEWED.
 *  - newFinalScore must be 0–100 when isScoreChanged is true.
 *
 * @param {number}  appealId       The appeal being reviewed
 * @param {number}  adminId        The admin/commission member performing the review
 * @param {string}  decisionNotes  Written justification for the decision
 * @param {boolean} isScoreChanged Whether the commission is overriding the score
 * @param {number|null} newFinalScore  New score (0–100); required when isScoreChanged is true
 */
async function reviewAppeal(appealId, adminId, decisionNotes, isScoreChanged, newFinalScore) {
  const appeal = await prisma.appeal.findUniqueOrThrow({
    where:   { id: appealId },
    include: { attempt: { select: { id: true, finalScore: true, examProfileId: true } } },
  });

  if (appeal.status === 'REVIEWED') {
    throw new AppealError('This appeal has already been reviewed.', 409);
  }

  if (isScoreChanged) {
    if (newFinalScore === undefined || newFinalScore === null) {
      throw new AppealError('newFinalScore is required when isScoreChanged is true.', 400);
    }
    if (typeof newFinalScore !== 'number' || newFinalScore < 0 || newFinalScore > 100) {
      throw new AppealError('newFinalScore must be a number between 0 and 100.', 400);
    }
  }

  const oldScore = appeal.attempt.finalScore;

  // Atomically update the appeal and (optionally) the attempt score
  await prisma.$transaction(async (tx) => {
    await tx.appeal.update({
      where: { id: appealId },
      data:  { status: 'REVIEWED', decisionNotes, isScoreChanged },
    });

    if (isScoreChanged) {
      await tx.candidateAttempt.update({
        where: { id: appeal.attemptId },
        data:  { finalScore: newFinalScore },
      });
    }
  });

  // Separate audit entries: one for the appeal decision, one for the score change
  await writeAuditLog({
    userId:    adminId,
    action:    'APPEAL_REVIEWED',
    tableName: 'Appeal',
    recordId:  appealId,
    oldData:   { status: appeal.status },
    newData:   { status: 'REVIEWED', decisionNotes, isScoreChanged },
  });

  if (isScoreChanged) {
    await writeAuditLog({
      userId:    adminId,
      action:    'SCORE_OVERRIDE',
      tableName: 'CandidateAttempt',
      recordId:  appeal.attemptId,
      oldData:   { finalScore: oldScore },
      newData:   { finalScore: newFinalScore, reason: 'appeal', appealId },
    });
  }

  return {
    appealId,
    status:        'REVIEWED',
    decisionNotes,
    isScoreChanged,
    newFinalScore: isScoreChanged ? newFinalScore : null,
  };
}

module.exports = { AppealError, createAppeal, reviewAppeal };
