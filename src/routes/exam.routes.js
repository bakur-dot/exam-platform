'use strict';

const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/exam.controller');

const router = Router();

// All exam endpoints are Candidate-only
router.use(requireAuth, requireRole('Candidate'));

router.post('/generate',                       ctrl.generateExam);
router.post('/:attemptId/answers',             ctrl.saveAnswer);
router.post('/:attemptId/projects/mistakes',   ctrl.saveProjectMistakes);
router.post('/:attemptId/finish',              ctrl.finishExam);

module.exports = router;
