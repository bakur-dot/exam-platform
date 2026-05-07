'use strict';

const reportService = require('../services/report.service');
const asyncHandler  = require('../lib/asyncHandler');

// GET /api/reports/history  — Candidate sees their own history
const getCandidateHistory = asyncHandler(async (req, res) => {
  const history = await reportService.getCandidateHistory(req.user.sub);
  res.json(history);
});

// GET /api/reports/attempts/:attemptId
// Candidate: ownership-checked (requesterId = their own id).
// Admin / SuperAdmin: bypass ownership check (requesterId = null).
const getAttemptDetails = asyncHandler(async (req, res) => {
  const attemptId   = Number(req.params.attemptId);
  const isCandidate = req.user.roleName === 'Candidate';
  const requesterId = isCandidate ? req.user.sub : null;

  const details = await reportService.getAttemptDetails(attemptId, requesterId);
  res.json(details);
});

module.exports = { getCandidateHistory, getAttemptDetails };
