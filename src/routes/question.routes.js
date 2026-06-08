'use strict';

const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const { uploadQuestionImage } = require('../middleware/upload.middleware');
const ctrl = require('../controllers/question.controller');

const router = Router();

// Roles allowed to read / create questions
const canManage = [requireAuth, requireRole('Examiner', 'Admin', 'SuperAdmin')];
// Roles allowed to approve / reject (admin workflow)
const adminOnly = [requireAuth, requireRole('Admin', 'SuperAdmin')];

// Static routes — MUST be registered before /:id param routes
router.get('/chapters', ...canManage, ctrl.getChapters);
router.get('/',         ...canManage, ctrl.getQuestions);
router.post('/',        ...canManage, ctrl.createQuestion);

// Param routes
router.put('/:id',           ...canManage, ctrl.editQuestion);
router.post('/:id/submit',   ...canManage, ctrl.submitQuestion);
router.post('/:id/upload',   ...canManage, uploadQuestionImage, ctrl.uploadImage);
router.post('/:id/approve',  ...adminOnly, ctrl.approveQuestion);

module.exports = router;
