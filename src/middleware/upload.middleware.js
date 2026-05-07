'use strict';

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const QUESTIONS_UPLOAD_DIR  = path.join(process.cwd(), 'public', 'uploads', 'questions');
const PROJECTS_UPLOAD_DIR   = path.join(process.cwd(), 'public', 'uploads', 'projects');
const APPEALS_UPLOAD_DIR    = path.join(process.cwd(), 'public', 'uploads', 'appeals');
const CANDIDATES_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'candidates');

// Legacy alias kept for backward compatibility
const UPLOAD_DIR = QUESTIONS_UPLOAD_DIR;

const MAX_IMAGE_SIZE    = 5  * 1024 * 1024; // 5 MB
const MAX_PDF_SIZE      = 20 * 1024 * 1024; // 20 MB
const MAX_APPEAL_SIZE   = 10 * 1024 * 1024; // 10 MB
const MAX_CANDIDATE_DOC = 5  * 1024 * 1024; // 5 MB
const MAX_CSV_SIZE      = 2  * 1024 * 1024; // 2 MB

// Keep the original name for backwards compat
const MAX_FILE_SIZE = MAX_IMAGE_SIZE;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXT  = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const ALLOWED_PDF_MIME = new Set(['application/pdf']);
const ALLOWED_PDF_EXT  = new Set(['.pdf']);

// Appeals accept scanned documents: PDF or raster images
const ALLOWED_APPEAL_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const ALLOWED_APPEAL_EXT  = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

// Candidate registration documents: same as appeals
const ALLOWED_CANDIDATE_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const ALLOWED_CANDIDATE_EXT  = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

// CSV import: text/csv, application/csv, or text/plain with .csv extension
const ALLOWED_CSV_MIME = new Set(['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel']);
const ALLOWED_CSV_EXT  = new Set(['.csv']);

// Create upload directories once at module load (safe to call multiple times)
fs.mkdirSync(QUESTIONS_UPLOAD_DIR,  { recursive: true });
fs.mkdirSync(PROJECTS_UPLOAD_DIR,   { recursive: true });
fs.mkdirSync(APPEALS_UPLOAD_DIR,    { recursive: true });
fs.mkdirSync(CANDIDATES_UPLOAD_DIR, { recursive: true });

// ── Storage factories ─────────────────────────────────────────────────────────

function makeStorage(destDir) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, destDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      // timestamp + 6 random bytes prevents collisions even under concurrent uploads
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  });
}

// ── Validation ────────────────────────────────────────────────────────────────

function imageFileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(ext)) {
    return cb(Object.assign(new Error('Only JPEG, PNG and WebP images are allowed.'), { code: 'INVALID_FILE_TYPE' }));
  }
  cb(null, true);
}

function pdfFileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_PDF_MIME.has(file.mimetype) || !ALLOWED_PDF_EXT.has(ext)) {
    return cb(Object.assign(new Error('Only PDF files are allowed.'), { code: 'INVALID_FILE_TYPE' }));
  }
  cb(null, true);
}

function appealFileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_APPEAL_MIME.has(file.mimetype) || !ALLOWED_APPEAL_EXT.has(ext)) {
    return cb(Object.assign(new Error('Only PDF, JPEG or PNG files are allowed.'), { code: 'INVALID_FILE_TYPE' }));
  }
  cb(null, true);
}

const uploadImage = multer({
  storage:    makeStorage(QUESTIONS_UPLOAD_DIR),
  limits:     { fileSize: MAX_IMAGE_SIZE },
  fileFilter: imageFileFilter,
});

const uploadPdf = multer({
  storage:    makeStorage(PROJECTS_UPLOAD_DIR),
  limits:     { fileSize: MAX_PDF_SIZE },
  fileFilter: pdfFileFilter,
});

const uploadAppeal = multer({
  storage:    makeStorage(APPEALS_UPLOAD_DIR),
  limits:     { fileSize: MAX_APPEAL_SIZE },
  fileFilter: appealFileFilter,
});

function candidateDocFileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_CANDIDATE_MIME.has(file.mimetype) || !ALLOWED_CANDIDATE_EXT.has(ext)) {
    return cb(Object.assign(new Error('Only PDF, JPEG or PNG files are allowed.'), { code: 'INVALID_FILE_TYPE' }));
  }
  cb(null, true);
}

function csvFileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_CSV_MIME.has(file.mimetype) || !ALLOWED_CSV_EXT.has(ext)) {
    return cb(Object.assign(new Error('Only CSV files are allowed.'), { code: 'INVALID_FILE_TYPE' }));
  }
  cb(null, true);
}

const uploadCandidateDocMulter = multer({
  storage:    makeStorage(CANDIDATES_UPLOAD_DIR),
  limits:     { fileSize: MAX_CANDIDATE_DOC },
  fileFilter: candidateDocFileFilter,
});

// CSV goes to memory (no disk) — req.file.buffer used directly by the service
const uploadCsvMulter = multer({
  storage:    multer.memoryStorage(),
  limits:     { fileSize: MAX_CSV_SIZE },
  fileFilter: csvFileFilter,
});

// ── Wrapped middleware (inline error handling) ────────────────────────────────

/**
 * Drop-in Express middleware for a single question image upload.
 * Expects the field name `image`. Adds `req.file` on success.
 * Responds with 400 JSON on validation errors — no separate error middleware needed.
 */
function uploadQuestionImage(req, res, next) {
  uploadImage.single('image')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 5 MB.' });
    }
    if (err.code === 'INVALID_FILE_TYPE' || err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  });
}

/**
 * Drop-in Express middleware for a single project PDF upload.
 * Expects the field name `file`. Adds `req.file` on success.
 * Responds with 400 JSON on validation errors — no separate error middleware needed.
 */
function uploadProjectFile(req, res, next) {
  uploadPdf.single('file')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 20 MB.' });
    }
    if (err.code === 'INVALID_FILE_TYPE' || err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  });
}

/**
 * Drop-in Express middleware for a single appeal document upload.
 * Accepts PDF, JPEG, or PNG scanned documents up to 10 MB.
 * Expects the field name `document`. Adds `req.file` on success.
 * Responds with 400 JSON on validation errors — no separate error middleware needed.
 */
function uploadAppealDocument(req, res, next) {
  uploadAppeal.single('document')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10 MB.' });
    }
    if (err.code === 'INVALID_FILE_TYPE' || err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  });
}

/**
 * Drop-in Express middleware for a single candidate registration document.
 * Accepts PDF, JPEG or PNG up to 5 MB. Field name: `document`.
 */
function uploadCandidateDoc(req, res, next) {
  uploadCandidateDocMulter.single('document')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 5 MB.' });
    }
    if (err.code === 'INVALID_FILE_TYPE' || err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  });
}

/**
 * Drop-in Express middleware for a CSV bulk-import file.
 * Stores file in memory (req.file.buffer). Field name: `file`. Max 2 MB.
 */
function uploadCsv(req, res, next) {
  uploadCsvMulter.single('file')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'CSV too large. Maximum size is 2 MB.' });
    }
    if (err.code === 'INVALID_FILE_TYPE' || err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  });
}

module.exports = {
  uploadQuestionImage,
  uploadProjectFile,
  uploadAppealDocument,
  uploadCandidateDoc,
  uploadCsv,
  UPLOAD_DIR,
  QUESTIONS_UPLOAD_DIR,
  PROJECTS_UPLOAD_DIR,
  APPEALS_UPLOAD_DIR,
  CANDIDATES_UPLOAD_DIR,
};
