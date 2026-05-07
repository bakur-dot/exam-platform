'use strict';

const candidateService = require('../services/candidate.service');
const asyncHandler     = require('../lib/asyncHandler');

// POST /api/candidates/documents  — Candidate, multipart/form-data
// Form fields: docType (text), document (file)
const uploadDoc = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const { docType } = req.body;
  if (!docType) {
    return res.status(400).json({ error: 'docType is required.' });
  }

  const fileUrl = `/uploads/candidates/${req.file.filename}`;
  const doc = await candidateService.uploadDocument(req.user.sub, docType, fileUrl);
  res.status(201).json(doc);
});

// POST /api/candidates/documents/:id/review  — Admin / SuperAdmin, JSON body
// Body: { status, reason? }
const reviewDoc = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'status is required.' });
  }

  const doc = await candidateService.reviewDocument(
    Number(req.params.id),
    req.user.sub,
    status,
    reason
  );
  res.json(doc);
});

// POST /api/candidates/import  — Admin / SuperAdmin, multipart/form-data
// Form field: file (CSV). Returns created/skipped/errors summary + initial passwords.
const importCandidates = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No CSV file uploaded.' });
  }

  const result = await candidateService.bulkImportCandidates(req.file.buffer);
  res.status(201).json(result);
});

module.exports = { uploadDoc, reviewDoc, importCandidates };
