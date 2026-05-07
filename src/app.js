'use strict';

require('dotenv').config();
const express = require('express');
const path    = require('path');

const authRoutes      = require('./routes/auth.routes');
const questionRoutes  = require('./routes/question.routes');
const examRoutes      = require('./routes/exam.routes');
const reportRoutes    = require('./routes/report.routes');
const appealRoutes    = require('./routes/appeal.routes');
const candidateRoutes = require('./routes/candidate.routes');
const sessionRoutes   = require('./routes/session.routes');
const { errorMiddleware } = require('./middleware/error.middleware');
const { connectDB }  = require('./lib/prisma');

const app = express();

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json());

// ── Static uploads ────────────────────────────────────────────────────────────
// Serves public/uploads/* as /uploads/* so stored paths like
// /uploads/questions/<file> resolve directly via the browser or API clients.
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/questions',  questionRoutes);
app.use('/api/exams',      examRoutes);
app.use('/api/reports',    reportRoutes);
app.use('/api/appeals',    appealRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/sessions',   sessionRoutes);

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));

// ── Centralized error handler (must be last) ──────────────────────────────────
app.use(errorMiddleware);

// ── DB init (WAL mode + foreign keys — idempotent) ────────────────────────────
connectDB().catch(err => {
  console.error('[DB] Failed to initialise Prisma connection:', err.message);
  process.exit(1);
});

module.exports = app;
