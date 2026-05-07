'use strict';

const questionService = require('../services/question.service');
const asyncHandler    = require('../lib/asyncHandler');

// POST /api/questions
const createQuestion = asyncHandler(async (req, res) => {
  const { chapterId, content, imageUrl, answers } = req.body;
  if (!chapterId || !content) {
    return res.status(400).json({ error: 'chapterId and content are required.' });
  }
  const question = await questionService.createDraft(
    { chapterId: Number(chapterId), content, imageUrl, answers: answers ?? [] },
    req.user.sub
  );
  res.status(201).json(question);
});

// POST /api/questions/:id/submit
const submitQuestion = asyncHandler(async (req, res) => {
  const question = await questionService.submitForApproval(Number(req.params.id), req.user.sub);
  res.json(question);
});

// POST /api/questions/:id/approve
const approveQuestion = asyncHandler(async (req, res) => {
  const question = await questionService.approveQuestion(Number(req.params.id), req.user.sub);
  res.json(question);
});

// PUT /api/questions/:id  — may trigger versioning for APPROVED questions
const editQuestion = asyncHandler(async (req, res) => {
  const question = await questionService.editQuestion(
    Number(req.params.id),
    req.body,
    req.user.sub
  );
  res.json(question);
});

// POST /api/questions/:id/upload  — multer middleware applied at route level
const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const imageUrl = `/uploads/questions/${req.file.filename}`;
  const question = await questionService.editQuestion(
    Number(req.params.id),
    { imageUrl },
    req.user.sub
  );
  res.json({ imageUrl, question });
});

module.exports = { createQuestion, submitQuestion, approveQuestion, editQuestion, uploadImage };
