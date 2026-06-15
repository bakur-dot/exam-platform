'use strict';

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/auth.controller');

const router = Router();

// Rate-limit login attempts to 20 per 15 min per IP.
// Bypassed in CI (process.env.CI === 'true') to prevent test flakiness from
// rapid sequential Playwright calls hitting the limit.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  skip: () => process.env.CI === 'true',
});

// ── Public ────────────────────────────────────────────────────────────────────
router.post('/login',        loginLimiter, ctrl.login);
router.post('/totp/verify',  ctrl.verifyTotp);
router.post('/refresh',      ctrl.refresh);

// ── Admin / SuperAdmin only ───────────────────────────────────────────────────
router.post('/totp/setup',   requireAuth, requireRole('Admin', 'SuperAdmin'), ctrl.setupTotp);
router.post('/totp/confirm', requireAuth, requireRole('Admin', 'SuperAdmin'), ctrl.confirmTotp);

module.exports = router;
