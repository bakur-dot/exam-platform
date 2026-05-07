'use strict';

const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/report.controller');

const router = Router();

// Candidate history — own data only
router.get(
  '/history',
  requireAuth, requireRole('Candidate'),
  ctrl.getCandidateHistory
);

// Attempt detail — Candidate (own) or Admin / SuperAdmin (any)
router.get(
  '/attempts/:attemptId',
  requireAuth, requireRole('Candidate', 'Admin', 'SuperAdmin'),
  ctrl.getAttemptDetails
);

module.exports = router;
