'use strict';

const authService = require('../services/auth.service');
const asyncHandler = require('../lib/asyncHandler');

// POST /api/auth/login  — Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required.' });
  }
  const result = await authService.login(email, password);
  res.json(result);
});

// POST /api/auth/totp/setup  — Admin / SuperAdmin (requireAuth applied at route)
const setupTotp = asyncHandler(async (req, res) => {
  const result = await authService.setupTotp(req.user.sub);
  res.json(result);
});

// POST /api/auth/totp/confirm  — Admin / SuperAdmin
const confirmTotp = asyncHandler(async (req, res) => {
  const { totpCode } = req.body;
  if (!totpCode) {
    return res.status(400).json({ error: 'totpCode is required.' });
  }
  const result = await authService.confirmTotpSetup(req.user.sub, totpCode);
  res.json(result);
});

// POST /api/auth/totp/verify  — Public (tempToken comes from login step 1)
const verifyTotp = asyncHandler(async (req, res) => {
  const { tempToken, totpCode } = req.body;
  if (!tempToken || !totpCode) {
    return res.status(400).json({ error: 'tempToken and totpCode are required.' });
  }
  const result = await authService.verifyTotpLogin(tempToken, totpCode);
  res.json(result);
});

// POST /api/auth/refresh  — Public
const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required.' });
  }
  const result = await authService.refreshAccessToken(refreshToken);
  res.json(result);
});

module.exports = { login, setupTotp, confirmTotp, verifyTotp, refresh };
