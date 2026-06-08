'use strict';

const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/session.controller');

const router = Router();

const ADMIN_OR_EXAMINER = ['Examiner', 'Admin', 'SuperAdmin'];

// Candidate: fetch their own session seats — must be before /:id param route
router.get('/mine', requireAuth, requireRole('Candidate'), ctrl.getMySessions);

// List all sessions + get single session — static before /:id param routes
router.get('/',    requireAuth, requireRole(...ADMIN_OR_EXAMINER), ctrl.getSessions);
router.get('/:id', requireAuth, requireRole(...ADMIN_OR_EXAMINER), ctrl.getSessionById);

// Create an exam session
router.post(
  '/',
  requireAuth, requireRole(...ADMIN_OR_EXAMINER),
  ctrl.createSession
);

// Add a candidate to a session (assign candidate number)
router.post(
  '/:id/candidates',
  requireAuth, requireRole(...ADMIN_OR_EXAMINER),
  ctrl.addCandidate
);

// Candidate acknowledges and signs the pre-exam protocol
router.post(
  '/:id/candidates/:candidateId/sign',
  requireAuth, requireRole('Candidate'),
  ctrl.signProtocol
);

// Examiner grants the candidate authorization to start the exam
router.post(
  '/:id/candidates/:candidateId/authorize',
  requireAuth, requireRole(...ADMIN_OR_EXAMINER),
  ctrl.authorizeStart
);

module.exports = router;
