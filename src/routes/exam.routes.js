'use strict';

const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/exam.controller');

const router = Router();

// GET /profiles is registered BEFORE the Candidate-only blanket guard below.
// Express processes the layer stack in registration order; once this handler
// sends a response, the blanket middleware is never reached for this path.
router.get('/profiles', requireAuth, requireRole('Examiner', 'Admin', 'SuperAdmin'), ctrl.getProfiles);

// All remaining exam endpoints are Candidate-only
router.use(requireAuth, requireRole('Candidate'));

router.post('/generate',                       ctrl.generateExam);
router.post('/:attemptId/answers',             ctrl.saveAnswer);
router.post('/:attemptId/projects/mistakes',   ctrl.saveProjectMistakes);
router.post('/:attemptId/finish',              ctrl.finishExam);

module.exports = router;
