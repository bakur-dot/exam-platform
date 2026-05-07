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

// Session aggregate report — Examiner / Admin / SuperAdmin
router.get(
  '/sessions/:sessionId',
  requireAuth, requireRole('Examiner', 'Admin', 'SuperAdmin'),
  ctrl.getSessionReport
);

// Thematic / chapter difficulty analysis — Admin / SuperAdmin only
router.get(
  '/thematic/:profileId',
  requireAuth, requireRole('Admin', 'SuperAdmin'),
  ctrl.getThematicStats
);

// Attempt export as PDF — Candidate (own) or Admin / SuperAdmin (any)
router.get(
  '/attempts/:attemptId/export/pdf',
  requireAuth, requireRole('Candidate', 'Admin', 'SuperAdmin'),
  ctrl.exportAttemptPdf
);

// Attempt export as Excel — Candidate (own) or Admin / SuperAdmin (any)
router.get(
  '/attempts/:attemptId/export/excel',
  requireAuth, requireRole('Candidate', 'Admin', 'SuperAdmin'),
  ctrl.exportAttemptExcel
);

module.exports = router;
