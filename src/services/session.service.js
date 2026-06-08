'use strict';

const { prisma } = require('../lib/prisma');

// ─── Error type ───────────────────────────────────────────────────────────────

class SessionError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'SessionError';
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
        oldData:  oldData ? JSON.stringify(oldData) : null,
        newData:  newData ? JSON.stringify(newData) : null,
      },
    });
  } catch (err) {
    console.error('[AuditLog] write failed:', err.message);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Creates an exam session. The calling user becomes the session's examiner.
 * Validates that the exam profile exists before creating.
 */
async function createSession(examinerId, { examProfileId, scheduledTime, location }) {
  if (!examProfileId || !scheduledTime || !location?.trim()) {
    throw new SessionError('examProfileId, scheduledTime and location are required.', 400);
  }

  await prisma.examProfile.findUniqueOrThrow({ where: { id: examProfileId } });

  const session = await prisma.examSession.create({
    data: {
      examinerId,
      examProfileId,
      scheduledTime: new Date(scheduledTime),
      location:      location.trim(),
    },
    include: {
      examProfile: {
        include: { specialization: { select: { id: true, name: true } } },
      },
      examiner: { select: { id: true, name: true, email: true } },
    },
  });

  await writeAuditLog({
    userId:    examinerId,
    action:    'SESSION_CREATED',
    tableName: 'ExamSession',
    recordId:  session.id,
    newData:   { examProfileId, scheduledTime, location },
  });

  return session;
}

/**
 * Registers a candidate in a session, assigning them a candidate number.
 * candidateNumber must be unique within the session (enforced at DB level).
 * The user must have the Candidate role.
 */
async function addCandidateToSession(sessionId, candidateId, candidateNumber) {
  if (!candidateNumber?.toString().trim()) {
    throw new SessionError('candidateNumber is required.', 400);
  }

  await prisma.examSession.findUniqueOrThrow({ where: { id: sessionId } });

  const user = await prisma.user.findUniqueOrThrow({
    where:   { id: candidateId },
    include: { role: { select: { name: true } } },
  });
  if (user.role.name !== 'Candidate') {
    throw new SessionError(`User ${candidateId} does not have the Candidate role.`, 422);
  }

  // Manual check so the error is specific (Prisma P2002 would be generic)
  const existing = await prisma.sessionCandidate.findUnique({
    where: { sessionId_candidateId: { sessionId, candidateId } },
  });
  if (existing) {
    throw new SessionError('Candidate is already registered in this session.', 409);
  }

  const seat = await prisma.sessionCandidate.create({
    data: {
      sessionId,
      candidateId,
      candidateNumber: String(candidateNumber).trim(),
    },
  });

  await writeAuditLog({
    action:    'CANDIDATE_ADDED_TO_SESSION',
    tableName: 'SessionCandidate',
    recordId:  seat.id,
    newData:   { sessionId, candidateId, candidateNumber },
  });

  return seat;
}

/**
 * Candidate acknowledges the exam rules by signing the pre-exam protocol.
 * Idempotency guard: throws 409 if already signed.
 */
async function signProtocol(sessionId, candidateId) {
  const seat = await prisma.sessionCandidate.findUnique({
    where: { sessionId_candidateId: { sessionId, candidateId } },
  });
  if (!seat) {
    throw new SessionError('You are not registered in this exam session.', 404);
  }
  if (seat.isProtocolSigned) {
    throw new SessionError('The pre-exam protocol has already been signed.', 409);
  }

  const updated = await prisma.sessionCandidate.update({
    where: { sessionId_candidateId: { sessionId, candidateId } },
    data:  { isProtocolSigned: true },
  });

  await writeAuditLog({
    userId:    candidateId,
    action:    'PROTOCOL_SIGNED',
    tableName: 'SessionCandidate',
    recordId:  seat.id,
    newData:   { sessionId, candidateId },
  });

  return updated;
}

/**
 * Examiner grants a candidate permission to start their exam.
 *
 * Guards:
 *  - Candidate must be registered in the session.
 *  - Protocol must already be signed (isProtocolSigned === true).
 *  - Must not already be AUTHORIZED.
 *
 * The authorizing user is recorded in the audit log.
 * Route-level RBAC (Examiner / Admin / SuperAdmin) controls who may call this.
 */
async function authorizeStart(sessionId, candidateId, authorizedBy) {
  const seat = await prisma.sessionCandidate.findUnique({
    where: { sessionId_candidateId: { sessionId, candidateId } },
  });
  if (!seat) {
    throw new SessionError('Candidate is not registered in this session.', 404);
  }
  if (!seat.isProtocolSigned) {
    throw new SessionError(
      'Cannot authorize: the candidate has not signed the pre-exam protocol yet.',
      422
    );
  }
  if (seat.startStatus === 'AUTHORIZED') {
    throw new SessionError('Candidate is already authorized to start this exam.', 409);
  }

  const updated = await prisma.sessionCandidate.update({
    where: { sessionId_candidateId: { sessionId, candidateId } },
    data:  { startStatus: 'AUTHORIZED' },
  });

  await writeAuditLog({
    userId:    authorizedBy,
    action:    'EXAM_START_AUTHORIZED',
    tableName: 'SessionCandidate',
    recordId:  seat.id,
    oldData:   { startStatus: seat.startStatus },
    newData:   { startStatus: 'AUTHORIZED', authorizedBy },
  });

  return updated;
}

async function getMySessions(candidateId) {
  return prisma.sessionCandidate.findMany({
    where: { candidateId },
    include: {
      session: {
        include: {
          examProfile: {
            include: { specialization: { select: { id: true, name: true } } },
          },
          examiner: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { id: 'desc' },
  });
}

async function getSessions() {
  return prisma.examSession.findMany({
    include: {
      examProfile: { include: { specialization: { select: { id: true, name: true } } } },
      examiner:    { select: { id: true, name: true, email: true } },
    },
    orderBy: { scheduledTime: 'desc' },
  });
}

async function getSessionById(sessionId) {
  const session = await prisma.examSession.findUnique({
    where: { id: sessionId },
    include: {
      examProfile: { include: { specialization: { select: { id: true, name: true } } } },
      examiner:    { select: { id: true, name: true, email: true } },
      candidates:  {
        include:  { candidate: { select: { id: true, name: true, email: true } } },
        orderBy:  { candidateNumber: 'asc' },
      },
    },
  });
  if (!session) throw new SessionError('Session not found.', 404);
  return session;
}

module.exports = { SessionError, createSession, addCandidateToSession, signProtocol, authorizeStart, getMySessions, getSessions, getSessionById };
