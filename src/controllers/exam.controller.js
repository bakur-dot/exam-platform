'use strict';

const examService  = require('../services/exam.service');
const asyncHandler = require('../lib/asyncHandler');
const { prisma }   = require('../lib/prisma');

// Ownership guard: returns the attempt if it belongs to userId, null otherwise.
// Returns null (not throws) so the caller can return a 404 without leaking IDs.
async function findOwnAttempt(attemptId, userId) {
  return prisma.candidateAttempt.findFirst({ where: { id: attemptId, userId } });
}

// POST /api/exams/generate
const generateExam = asyncHandler(async (req, res) => {
  const { profileId, sessionId } = req.body;
  if (!profileId)  return res.status(400).json({ error: 'profileId is required.' });
  if (!sessionId)  return res.status(400).json({ error: 'sessionId is required.' });
  const result = await examService.generateExam(req.user.sub, Number(profileId), Number(sessionId));
  res.status(201).json(result);
});

// POST /api/exams/:attemptId/answers
const saveAnswer = asyncHandler(async (req, res) => {
  const attemptId = Number(req.params.attemptId);
  const { questionId, selectedAnswerId } = req.body;

  if (!questionId) {
    return res.status(400).json({ error: 'questionId is required.' });
  }
  const owned = await findOwnAttempt(attemptId, req.user.sub);
  if (!owned) {
    return res.status(404).json({ error: 'Attempt not found.' });
  }

  const result = await examService.saveAnswer(
    attemptId,
    Number(questionId),
    selectedAnswerId != null ? Number(selectedAnswerId) : null
  );
  res.json(result);
});

// POST /api/exams/:attemptId/projects/mistakes
const saveProjectMistakes = asyncHandler(async (req, res) => {
  const attemptId = Number(req.params.attemptId);
  const { projectId, mistakeIds } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required.' });
  }
  const owned = await findOwnAttempt(attemptId, req.user.sub);
  if (!owned) {
    return res.status(404).json({ error: 'Attempt not found.' });
  }

  const result = await examService.saveProjectMistakes(
    attemptId,
    Number(projectId),
    Array.isArray(mistakeIds) ? mistakeIds.map(Number) : []
  );
  res.json(result);
});

// POST /api/exams/:attemptId/finish
const finishExam = asyncHandler(async (req, res) => {
  const attemptId = Number(req.params.attemptId);

  const owned = await findOwnAttempt(attemptId, req.user.sub);
  if (!owned) {
    return res.status(404).json({ error: 'Attempt not found.' });
  }

  const result = await examService.finishExam(attemptId);
  res.json(result);
});

// GET /api/exams/active  — Candidate (page-refresh recovery)
const getActiveAttempt = asyncHandler(async (req, res) => {
  const attempt = await prisma.candidateAttempt.findFirst({
    where: { userId: req.user.sub, status: 'IN_PROGRESS' },
    include: {
      examProfile: {
        include: { specialization: { select: { id: true, name: true } } },
      },
      answers: {
        include: {
          question: {
            include: {
              answers: { select: { id: true, content: true } },
              chapter: { select: { id: true, name: true } },
            },
          },
        },
      },
      assignedProjects: {
        include: {
          project: {
            include: {
              mistakes: { select: { id: true, description: true, penaltyPoints: true } },
            },
          },
          mistakes: { select: { mistakeId: true } },
        },
      },
    },
  });

  if (!attempt) {
    return res.status(404).json({ error: 'No active attempt found.' });
  }

  const profile   = attempt.examProfile;
  const expiresAt = new Date(
    attempt.startTime.getTime() + profile.durationMinutes * 60 * 1000
  );

  const savedAnswers = {};
  for (const aa of attempt.answers) {
    savedAnswers[aa.questionId] = aa.selectedAnswerId;
  }

  res.json({
    attempt: {
      id:        attempt.id,
      sessionId: attempt.sessionId,
      startTime: attempt.startTime,
      expiresAt,
      status:    attempt.status,
    },
    exam: {
      profileId:          profile.id,
      specializationName: profile.specialization.name,
      durationMinutes:    profile.durationMinutes,
      questionCount:      profile.questionCount,
      passingScore:       profile.passingScore,
      isExpert:           profile.isExpert,
      requiresProjects:   profile.requiresProjects,
    },
    questions:    attempt.answers.map(aa => aa.question),
    projects:     attempt.assignedProjects.map(ap => ({
      ...ap.project,
      savedMistakeIds: ap.mistakes.map(m => m.mistakeId),
    })),
    savedAnswers,
  });
});

// GET /api/exams/profiles  — Examiner / Admin / SuperAdmin
// Intentionally defined in exam.controller but accessed before the Candidate-only
// blanket router.use() guard in exam.routes.js (see route file for explanation).
const getProfiles = asyncHandler(async (req, res) => {
  const profiles = await prisma.examProfile.findMany({
    include: { specialization: { select: { id: true, name: true } } },
    orderBy: { id: 'asc' },
  });
  res.json(profiles);
});

module.exports = { generateExam, saveAnswer, saveProjectMistakes, finishExam, getProfiles, getActiveAttempt };
