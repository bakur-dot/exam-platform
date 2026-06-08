'use strict';

const appealService = require('../services/appeal.service');
const asyncHandler  = require('../lib/asyncHandler');
const { prisma }    = require('../lib/prisma');

// POST /api/appeals  — Candidate, multipart/form-data (multer applied at route)
// Form fields: attemptId (text), document (file)
const createAppeal = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Appeal document is required.' });
  }
  const { attemptId } = req.body;
  if (!attemptId) {
    return res.status(400).json({ error: 'attemptId is required.' });
  }

  const documentUrl = `/uploads/appeals/${req.file.filename}`;
  const appeal = await appealService.createAppeal(
    Number(attemptId),
    req.user.sub,
    documentUrl
  );
  res.status(201).json(appeal);
});

// POST /api/appeals/:id/review  — Admin / SuperAdmin
const reviewAppeal = asyncHandler(async (req, res) => {
  const { decisionNotes, isScoreChanged, newFinalScore } = req.body;

  if (!decisionNotes) {
    return res.status(400).json({ error: 'decisionNotes is required.' });
  }

  const result = await appealService.reviewAppeal(
    Number(req.params.id),
    req.user.sub,
    String(decisionNotes),
    Boolean(isScoreChanged),
    isScoreChanged ? Number(newFinalScore) : null
  );
  res.json(result);
});

// GET /api/appeals/mine  — Candidate: list own appeals (one per submitted attempt)
const getMyAppeals = asyncHandler(async (req, res) => {
  const appeals = await prisma.appeal.findMany({
    where:   { attempt: { userId: req.user.sub } },
    select: {
      id:            true,
      attemptId:     true,
      status:        true,
      decisionNotes: true,
      isScoreChanged: true,
      createdAt:     true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(appeals);
});

// GET /api/appeals  — Admin / SuperAdmin: list all appeals with candidate + attempt details
const getAppeals = asyncHandler(async (req, res) => {
  const appeals = await prisma.appeal.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      attempt: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          examProfile: {
            select: {
              id:          true,
              passingScore: true,
              specialization: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  res.json(appeals);
});

module.exports = { createAppeal, reviewAppeal, getMyAppeals, getAppeals };
