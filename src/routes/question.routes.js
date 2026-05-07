'use strict';

const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const { uploadQuestionImage } = require('../middleware/upload.middleware');
const ctrl = require('../controllers/question.controller');

const router = Router();

// All question endpoints require Admin or SuperAdmin
router.use(requireAuth, requireRole('Admin', 'SuperAdmin'));

router.post('/',              ctrl.createQuestion);
router.put('/:id',            ctrl.editQuestion);
router.post('/:id/submit',    ctrl.submitQuestion);
router.post('/:id/approve',   ctrl.approveQuestion);
router.post('/:id/upload',    uploadQuestionImage, ctrl.uploadImage);

module.exports = router;
