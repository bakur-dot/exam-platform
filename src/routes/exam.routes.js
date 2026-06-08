'use strict';

const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/exam.controller');

const router = Router();

const EXAMINER_OR_ADMIN = ['Examiner', 'Admin', 'SuperAdmin'];

// These routes are registered BEFORE the Candidate-only blanket guard below so
// Examiners / Admins can reach them. Express processes handlers in registration
// order and stops once a response is sent.
router.get('/profiles', requireAuth, requireRole(...EXAMINER_OR_ADMIN), ctrl.getProfiles);

// Project grading — Examiner / Admin / SuperAdmin
// GET: list IN_PROGRESS attempts in a session that need project evaluation.
// POST: examiner saves mistake marks without the candidate ownership check.
router.get('/sessions/:sessionId/project-grading',
  requireAuth, requireRole(...EXAMINER_OR_ADMIN),
  ctrl.getSessionProjectGrading
);
router.post('/:attemptId/projects/marks',
  requireAuth, requireRole(...EXAMINER_OR_ADMIN),
  ctrl.examinerSaveProjectMistakes
);

// All remaining exam endpoints are Candidate-only
router.use(requireAuth, requireRole('Candidate'));

router.get('/active',                          ctrl.getActiveAttempt);
router.post('/generate',                       ctrl.generateExam);
router.post('/:attemptId/answers',             ctrl.saveAnswer);
router.post('/:attemptId/projects/mistakes',   ctrl.saveProjectMistakes);
router.post('/:attemptId/finish',              ctrl.finishExam);

module.exports = router;
