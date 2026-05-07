'use strict';

const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const { uploadAppealDocument } = require('../middleware/upload.middleware');
const ctrl = require('../controllers/appeal.controller');

const router = Router();

// File an appeal — Candidate, multipart/form-data with `document` file field
router.post(
  '/',
  requireAuth, requireRole('Candidate'),
  uploadAppealDocument,
  ctrl.createAppeal
);

// Review an appeal — Admin / SuperAdmin, JSON body
router.post(
  '/:id/review',
  requireAuth, requireRole('Admin', 'SuperAdmin'),
  ctrl.reviewAppeal
);

module.exports = router;
