'use strict';

const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const { uploadCandidateDoc, uploadCsv } = require('../middleware/upload.middleware');
const ctrl = require('../controllers/candidate.controller');

const router = Router();

// Examiner / Admin list all candidates (for session add-candidate dropdown)
router.get(
  '/list',
  requireAuth, requireRole('Examiner', 'Admin', 'SuperAdmin'),
  ctrl.getCandidateList
);

// Candidate retrieves their own submitted documents — placed before /:id routes
router.get(
  '/documents',
  requireAuth, requireRole('Candidate'),
  ctrl.getMyDocuments
);

// Candidate checks their own exam eligibility (all 4 docs APPROVED)
router.get(
  '/eligibility',
  requireAuth, requireRole('Candidate'),
  ctrl.getMyEligibility
);

// Admin / SuperAdmin fetches all PENDING documents for review queue
router.get(
  '/pending-documents',
  requireAuth, requireRole('Admin', 'SuperAdmin'),
  ctrl.getPendingDocuments
);

// Candidate uploads one of their 4 required registration documents
router.post(
  '/documents',
  requireAuth, requireRole('Candidate'),
  uploadCandidateDoc,
  ctrl.uploadDoc
);

// Admin / SuperAdmin approves, rejects, or returns a document for revision
// Registered as both POST (legacy) and PATCH (REST-correct)
router.post(
  '/documents/:id/review',
  requireAuth, requireRole('Admin', 'SuperAdmin'),
  ctrl.reviewDoc
);
router.patch(
  '/documents/:id/review',
  requireAuth, requireRole('Admin', 'SuperAdmin'),
  ctrl.reviewDoc
);

// Admin / SuperAdmin bulk-imports candidates from a CSV file
router.post(
  '/import',
  requireAuth, requireRole('Admin', 'SuperAdmin'),
  uploadCsv,
  ctrl.importCandidates
);

module.exports = router;
