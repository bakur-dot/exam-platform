'use strict';

const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/auth.controller');

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.post('/login',        ctrl.login);
router.post('/totp/verify',  ctrl.verifyTotp);
router.post('/refresh',      ctrl.refresh);

// ── Admin / SuperAdmin only ───────────────────────────────────────────────────
router.post('/totp/setup',   requireAuth, requireRole('Admin', 'SuperAdmin'), ctrl.setupTotp);
router.post('/totp/confirm', requireAuth, requireRole('Admin', 'SuperAdmin'), ctrl.confirmTotp);

module.exports = router;
