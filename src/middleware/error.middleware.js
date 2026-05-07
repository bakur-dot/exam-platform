'use strict';

// Domain error names that carry a meaningful statusCode from the service layer
const DOMAIN_ERRORS = new Set([
  'AuthError',
  'QuestionError',
  'ExamError',
  'AppealError',
  'ReportError',
  'CandidateError',
  'SessionError',
]);

// Prisma error codes we handle explicitly
const PRISMA_NOT_FOUND   = 'P2025';
const PRISMA_UNIQUE_FAIL = 'P2002';

/**
 * Centralized error handler — must be registered LAST in the Express middleware chain.
 *
 * Policy:
 *  - Domain errors: expose err.message, use err.statusCode.
 *  - Prisma P2025 (record not found): 404 with a safe message.
 *  - Prisma P2002 (unique constraint): 409 with a safe message.
 *  - Everything else: log internally, return generic 500 — no stack traces leak to clients.
 */
// eslint-disable-next-line no-unused-vars
function errorMiddleware(err, req, res, next) {
  if (DOMAIN_ERRORS.has(err.name) && err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  if (err.code === PRISMA_NOT_FOUND) {
    return res.status(404).json({ error: 'Record not found.' });
  }

  if (err.code === PRISMA_UNIQUE_FAIL) {
    return res.status(409).json({ error: 'A record with this value already exists.' });
  }

  console.error(`[ERROR] ${req.method} ${req.path}`, err);
  return res.status(500).json({ error: 'An unexpected error occurred.' });
}

module.exports = { errorMiddleware };
