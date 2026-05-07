'use strict';

const reportService = require('../services/report.service');
const exportService = require('../services/export.service');
const asyncHandler  = require('../lib/asyncHandler');

// GET /api/reports/history  — Candidate sees their own history
const getCandidateHistory = asyncHandler(async (req, res) => {
  const history = await reportService.getCandidateHistory(req.user.sub);
  res.json(history);
});

// GET /api/reports/attempts/:attemptId
// Candidate: ownership-checked. Admin / SuperAdmin: bypass ownership check.
const getAttemptDetails = asyncHandler(async (req, res) => {
  const attemptId   = Number(req.params.attemptId);
  const isCandidate = req.user.roleName === 'Candidate';
  const requesterId = isCandidate ? req.user.sub : null;

  const details = await reportService.getAttemptDetails(attemptId, requesterId);
  res.json(details);
});

// GET /api/reports/sessions/:sessionId — aggregate session results
const getSessionReport = asyncHandler(async (req, res) => {
  const report = await reportService.getSessionReport(Number(req.params.sessionId));
  res.json(report);
});

// GET /api/reports/thematic/:profileId — chapter difficulty analysis
const getThematicStats = asyncHandler(async (req, res) => {
  const stats = await reportService.getThematicStats(Number(req.params.profileId));
  res.json(stats);
});

// GET /api/reports/attempts/:attemptId/export/pdf
const exportAttemptPdf = asyncHandler(async (req, res) => {
  const attemptId   = Number(req.params.attemptId);
  const isCandidate = req.user.roleName === 'Candidate';
  const requesterId = isCandidate ? req.user.sub : null;

  const details = await reportService.getAttemptDetails(attemptId, requesterId);
  const buffer  = await exportService.exportToPdf(buildPdfData(details), 'Candidate Exam Result');

  res.set({
    'Content-Type':        'application/pdf',
    'Content-Disposition': `attachment; filename="attempt-${attemptId}.pdf"`,
    'Content-Length':      buffer.length,
  });
  res.end(buffer);
});

// GET /api/reports/attempts/:attemptId/export/excel
const exportAttemptExcel = asyncHandler(async (req, res) => {
  const attemptId   = Number(req.params.attemptId);
  const isCandidate = req.user.roleName === 'Candidate';
  const requesterId = isCandidate ? req.user.sub : null;

  const details = await reportService.getAttemptDetails(attemptId, requesterId);
  const buffer  = await exportService.exportToExcel(buildExcelData(details));

  res.set({
    'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="attempt-${attemptId}.xlsx"`,
    'Content-Length':      buffer.length,
  });
  res.end(buffer);
});

// ── Data-shaping helpers ──────────────────────────────────────────────────────
// These live in the controller because they are presentation-layer concerns:
// they translate service output into the flat structure the export service expects.

function buildPdfData(d) {
  const result = {
    attemptId:      d.attemptId,
    candidateId:    d.userId,
    specialization: d.examProfile.specializationName,
    status:         d.status,
    result:         d.passed === true ? 'PASSED' : d.passed === false ? 'FAILED' : 'PENDING',
    finalScore:     d.finalScore !== null ? `${d.finalScore}%` : '—',
    passingScore:   `${d.passingScore}%`,
    startTime:      d.startTime,
    endTime:        d.endTime ?? '—',
    questions: d.questions.map(q => ({
      chapter:        q.chapterName,
      question:       q.content.slice(0, 80),
      selectedAnswer: q.selectedAnswer?.content?.slice(0, 60) ?? '(unanswered)',
      correct:        q.wasCorrect ? 'Yes' : 'No',
    })),
    chapterScores: d.chapterScores.map(ch => ({
      chapter:  ch.chapterName,
      correct:  ch.correctAnswers,
      total:    ch.totalQuestions,
      score:    `${ch.score}%`,
    })),
  };

  if (d.projects.length > 0) {
    result.projects = d.projects.map(p => ({
      project: p.title,
      score:   p.score !== null ? `${p.score}%` : '—',
    }));
  }

  return result;
}

function buildExcelData(d) {
  const data = {
    summary: [{
      attemptId:      d.attemptId,
      candidateId:    d.userId,
      specialization: d.examProfile.specializationName,
      status:         d.status,
      result:         d.passed === true ? 'PASSED' : d.passed === false ? 'FAILED' : 'PENDING',
      finalScore:     d.finalScore,
      passingScore:   d.passingScore,
      startTime:      d.startTime,
      endTime:        d.endTime,
    }],
    questions: d.questions.map(q => ({
      questionId:     q.questionId,
      chapter:        q.chapterName,
      question:       q.content,
      selectedAnswer: q.selectedAnswer?.content ?? '(unanswered)',
      correct:        q.wasCorrect ? 'Yes' : 'No',
    })),
    chapterScores: d.chapterScores.map(ch => ({
      chapter:        ch.chapterName,
      totalQuestions: ch.totalQuestions,
      correctAnswers: ch.correctAnswers,
      score:          ch.score,
    })),
  };

  if (d.projects.length > 0) {
    data.projects = d.projects.map(p => ({
      project: p.title,
      score:   p.score,
    }));
  }

  return data;
}

module.exports = {
  getCandidateHistory,
  getAttemptDetails,
  getSessionReport,
  getThematicStats,
  exportAttemptPdf,
  exportAttemptExcel,
};
