'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { parse } = require('csv-parse/sync');
const { prisma } = require('../lib/prisma');

// ─── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPES = Object.freeze(['DIPLOMA', 'EXPERIENCE', 'ID_CARD', 'PHOTO']);
const DOC_TYPE_SET = new Set(DOC_TYPES);

// Statuses an admin may set; PENDING is set only by the candidate upload flow
const REVIEW_STATUSES     = Object.freeze(['APPROVED', 'REJECTED', 'RETURNED']);
const REVIEW_STATUS_SET   = new Set(REVIEW_STATUSES);
// These statuses require a written reason
const REASON_REQUIRED_SET = new Set(['REJECTED', 'RETURNED']);

// ─── Error type ───────────────────────────────────────────────────────────────

class CandidateError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'CandidateError';
    this.statusCode = statusCode;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeAuditLog({ userId = null, action, tableName, recordId, oldData = null, newData = null }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        tableName,
        recordId: String(recordId),
        oldData:  oldData ? JSON.stringify(oldData)  : null,
        newData:  newData ? JSON.stringify(newData)  : null,
      },
    });
  } catch (err) {
    console.error('[AuditLog] write failed:', err.message);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upserts a candidate's document submission for the given type.
 *
 * Re-uploading the same docType resets status to PENDING — the admin must
 * re-review the new file. This is intentional: a previously APPROVED document
 * is replaced by the new submission and cannot be considered approved anymore.
 */
async function uploadDocument(userId, docType, fileUrl) {
  if (!DOC_TYPE_SET.has(docType)) {
    throw new CandidateError(
      `Invalid document type. Must be one of: ${DOC_TYPES.join(', ')}.`,
      400
    );
  }

  const doc = await prisma.candidateDocument.upsert({
    where:  { userId_docType: { userId, docType } },
    update: { documentUrl: fileUrl, status: 'PENDING', rejectionReason: null },
    create: { userId, docType, documentUrl: fileUrl },
  });

  await writeAuditLog({
    userId,
    action:    'DOCUMENT_UPLOADED',
    tableName: 'CandidateDocument',
    recordId:  doc.id,
    newData:   { docType, fileUrl, status: 'PENDING' },
  });

  return doc;
}

/**
 * Admin sets a document's status to APPROVED, REJECTED, or RETURNED.
 * REJECTED / RETURNED require a written reason (ISO 17024 transparency).
 */
async function reviewDocument(documentId, adminId, status, reason) {
  if (!REVIEW_STATUS_SET.has(status)) {
    throw new CandidateError(
      `Invalid status. Must be one of: ${REVIEW_STATUSES.join(', ')}.`,
      400
    );
  }
  if (REASON_REQUIRED_SET.has(status) && !reason?.trim()) {
    throw new CandidateError(
      'A rejection reason is required when status is REJECTED or RETURNED.',
      400
    );
  }

  const doc = await prisma.candidateDocument.findUniqueOrThrow({
    where: { id: documentId },
  });

  const updated = await prisma.candidateDocument.update({
    where: { id: documentId },
    data:  { status, rejectionReason: reason?.trim() ?? null },
  });

  await writeAuditLog({
    userId:    adminId,
    action:    `DOCUMENT_${status}`,
    tableName: 'CandidateDocument',
    recordId:  documentId,
    oldData:   { status: doc.status, rejectionReason: doc.rejectionReason },
    newData:   { status, rejectionReason: reason?.trim() ?? null },
  });

  return updated;
}

/**
 * Returns true only when ALL 4 required document types have status APPROVED.
 *
 * The @@unique([userId, docType]) constraint guarantees at most one record per
 * type per user, so count === 4 unambiguously means every type is covered.
 */
async function checkExamEligibility(userId) {
  const approvedCount = await prisma.candidateDocument.count({
    where: { userId, status: 'APPROVED' },
  });
  return approvedCount >= DOC_TYPES.length;
}

/**
 * Parses a CSV buffer (headers: name, email) and creates Candidate users.
 *
 * Behaviour per row:
 *  - Missing name or email → recorded in errors[], row skipped.
 *  - Email already exists → skipped (idempotent re-import safety).
 *  - New user → created with a random 12-char hex initial password (returned
 *    in the response so the admin can distribute credentials securely).
 *
 * Returns { created, skipped, errors, users[] }.
 * `users` contains initialPassword — shown once; candidates must log in and
 * change it (future feature).
 */
async function bulkImportCandidates(csvBuffer) {
  let records;
  try {
    records = parse(csvBuffer, {
      columns:           true,  // use first row as column names
      skip_empty_lines:  true,
      trim:              true,
      relax_column_count: true,
    });
  } catch (err) {
    throw new CandidateError(`CSV parse error: ${err.message}`, 422);
  }

  const candidateRole = await prisma.role.findUnique({ where: { name: 'Candidate' } });
  if (!candidateRole) {
    throw new CandidateError(
      'Candidate role not found in the database. Run the seed script first.',
      500
    );
  }

  const result = { created: 0, skipped: 0, errors: [], users: [] };

  for (const [index, record] of records.entries()) {
    const name  = record.name?.trim();
    const email = record.email?.trim()?.toLowerCase();

    if (!name || !email) {
      result.errors.push({ row: index + 2, data: record, reason: 'Missing name or email.' });
      continue;
    }

    // Idempotent: skip if email already registered
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      result.skipped++;
      continue;
    }

    // Generate a unique initial password; shown in response exactly once
    const initialPassword = crypto.randomBytes(6).toString('hex'); // 12 hex chars
    const passwordHash    = await bcrypt.hash(initialPassword, 12);

    try {
      const user = await prisma.user.create({
        data: { name, email, passwordHash, roleId: candidateRole.id },
      });

      await writeAuditLog({
        action:    'CANDIDATE_CREATED',
        tableName: 'User',
        recordId:  user.id,
        newData:   { name, email, source: 'bulk_import' },
      });

      result.created++;
      result.users.push({ id: user.id, name, email, initialPassword });
    } catch (err) {
      result.errors.push({ row: index + 2, data: record, reason: err.message });
    }
  }

  return result;
}

async function getMyDocuments(userId) {
  return prisma.candidateDocument.findMany({ where: { userId } });
}

async function getPendingDocuments() {
  return prisma.candidateDocument.findMany({
    where:   { status: 'PENDING' },
    include: { user: { select: { name: true, email: true } } },
  });
}

module.exports = {
  CandidateError,
  uploadDocument,
  reviewDocument,
  checkExamEligibility,
  bulkImportCandidates,
  getMyDocuments,
  getPendingDocuments,
};
