'use strict';

const sessionService = require('../services/session.service');
const asyncHandler   = require('../lib/asyncHandler');

// POST /api/sessions  — Examiner / Admin / SuperAdmin
const createSession = asyncHandler(async (req, res) => {
  const { examProfileId, scheduledTime, location } = req.body;
  const session = await sessionService.createSession(req.user.sub, {
    examProfileId: Number(examProfileId),
    scheduledTime,
    location,
  });
  res.status(201).json(session);
});

// POST /api/sessions/:id/candidates  — Examiner / Admin / SuperAdmin
// Body: { candidateId, candidateNumber }
const addCandidate = asyncHandler(async (req, res) => {
  const sessionId = Number(req.params.id);
  const { candidateId, candidateNumber } = req.body;

  if (!candidateId || !candidateNumber) {
    return res.status(400).json({ error: 'candidateId and candidateNumber are required.' });
  }

  const seat = await sessionService.addCandidateToSession(
    sessionId,
    Number(candidateId),
    candidateNumber
  );
  res.status(201).json(seat);
});

// POST /api/sessions/:id/candidates/:candidateId/sign  — Candidate (own record only)
const signProtocol = asyncHandler(async (req, res) => {
  const sessionId   = Number(req.params.id);
  const candidateId = Number(req.params.candidateId);

  // A candidate can only sign their own protocol
  if (candidateId !== req.user.sub) {
    return res.status(403).json({ error: 'You can only sign your own protocol.' });
  }

  const seat = await sessionService.signProtocol(sessionId, req.user.sub);
  res.json(seat);
});

// POST /api/sessions/:id/candidates/:candidateId/authorize  — Examiner / Admin / SuperAdmin
const authorizeStart = asyncHandler(async (req, res) => {
  const sessionId   = Number(req.params.id);
  const candidateId = Number(req.params.candidateId);

  const seat = await sessionService.authorizeStart(sessionId, candidateId, req.user.sub);
  res.json(seat);
});

// GET /api/sessions/mine  — Candidate (their own seats)
const getMySessions = asyncHandler(async (req, res) => {
  const seats = await sessionService.getMySessions(req.user.sub);
  res.json(seats);
});

// GET /api/sessions  — Examiner / Admin / SuperAdmin
const getSessions = asyncHandler(async (req, res) => {
  const sessions = await sessionService.getSessions();
  res.json(sessions);
});

// GET /api/sessions/:id  — Examiner / Admin / SuperAdmin
const getSessionById = asyncHandler(async (req, res) => {
  const session = await sessionService.getSessionById(Number(req.params.id));
  res.json(session);
});

module.exports = { createSession, addCandidate, signProtocol, authorizeStart, getMySessions, getSessions, getSessionById };
