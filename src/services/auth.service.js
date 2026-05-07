'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const { prisma } = require('../lib/prisma');
const { encrypt, decrypt } = require('../lib/crypto');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const APP_NAME = process.env.APP_NAME || 'ExamPlatform';

// Accept one time-step of drift (~30s) in either direction
authenticator.options = { window: 1 };

// Roles that ISO 17024 compliance requires 2FA for
const TWO_FACTOR_ROLES = new Set(['SuperAdmin', 'Admin']);

// ─── Error type ───────────────────────────────────────────────────────────────

class AuthError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeAuditLog({ userId = null, action, tableName, recordId, newData = null }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        tableName,
        recordId: String(recordId),
        newData: newData ? JSON.stringify(newData) : null,
      },
    });
  } catch (err) {
    // Audit failures must never crash the auth flow
    console.error('[AuditLog] write failed:', err.message);
  }
}

function buildTokens(user) {
  if (!ACCESS_SECRET || !REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in .env');
  }
  const accessToken = jwt.sign(
    { sub: user.id, roleId: user.roleId, roleName: user.role.name, type: 'access' },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN }
  );
  const refreshToken = jwt.sign(
    { sub: user.id, type: 'refresh' },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN }
  );
  return { accessToken, refreshToken };
}

function sanitizeUser(user) {
  return { id: user.id, name: user.name, email: user.email, roleName: user.role.name };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Step 1 of the login flow.
 *
 * Returns one of three shapes:
 *   { requiresTwoFactor: true,  tempToken }          — Admin/SuperAdmin with 2FA active
 *   { requiresTwoFactor: false, mustSetupTotp: true,  tokens, user } — Admin/SuperAdmin, 2FA not yet configured
 *   { requiresTwoFactor: false, tokens, user }        — Examiner / Candidate
 *
 * tempToken is a 5-minute JWT passed to verifyTotpLogin().
 */
async function login(email, password) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });

  if (!user) {
    await writeAuditLog({ action: 'LOGIN_FAILURE', tableName: 'User', recordId: email, newData: { reason: 'user_not_found' } });
    throw new AuthError('Invalid credentials');
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    await writeAuditLog({ userId: user.id, action: 'LOGIN_FAILURE', tableName: 'User', recordId: user.id, newData: { reason: 'wrong_password' } });
    throw new AuthError('Invalid credentials');
  }

  const needs2FA = TWO_FACTOR_ROLES.has(user.role.name);

  // Admin/SuperAdmin with 2FA already configured → issue temp token, await TOTP
  if (needs2FA && user.is2faEnabled) {
    const tempToken = jwt.sign(
      { sub: user.id, type: 'pre-2fa' },
      ACCESS_SECRET,
      { expiresIn: '5m' }
    );
    return { requiresTwoFactor: true, tempToken };
  }

  // All other cases → issue full tokens immediately
  const tokens = buildTokens(user);
  await writeAuditLog({ userId: user.id, action: 'LOGIN_SUCCESS', tableName: 'User', recordId: user.id });

  return {
    requiresTwoFactor: false,
    mustSetupTotp: needs2FA && !user.is2faEnabled, // flag telling the client to redirect to /auth/2fa/setup
    tokens,
    user: sanitizeUser(user),
  };
}

/**
 * Generates a new TOTP secret, encrypts it, stores it on the user record,
 * and returns a QR code (data URL) plus the plain secret for manual entry.
 *
 * Does NOT enable 2FA — call confirmTotpSetup() after the user scans and verifies.
 */
async function setupTotp(userId) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { role: true },
  });

  if (!TWO_FACTOR_ROLES.has(user.role.name)) {
    throw new AuthError('2FA setup is only available for Admin and SuperAdmin roles.', 403);
  }

  const secret = authenticator.generateSecret();
  await prisma.user.update({
    where: { id: userId },
    data: { totpSecret: encrypt(secret) },
  });

  const otpAuthUrl = authenticator.keyuri(user.email, APP_NAME, secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

  await writeAuditLog({ userId, action: 'TOTP_SETUP_INITIATED', tableName: 'User', recordId: userId });

  return {
    otpAuthUrl,
    qrCodeDataUrl,     // base64 PNG — render directly in <img src="...">
    manualEntryKey: secret, // shown once; user enters this into their authenticator app manually
  };
}

/**
 * Verifies the first TOTP code after setup, then activates 2FA on the account.
 * Must be called after setupTotp().
 */
async function confirmTotpSetup(userId, totpToken) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (!user.totpSecret) {
    throw new AuthError('No TOTP secret found. Call /auth/2fa/setup first.', 400);
  }

  const isValid = authenticator.verify({ token: totpToken, secret: decrypt(user.totpSecret) });
  if (!isValid) {
    throw new AuthError('Invalid TOTP code. Check your authenticator app and try again.', 400);
  }

  await prisma.user.update({ where: { id: userId }, data: { is2faEnabled: true } });
  await writeAuditLog({ userId, action: 'TOTP_SETUP_CONFIRMED', tableName: 'User', recordId: userId });

  return { success: true };
}

/**
 * Step 2 of login for Admin/SuperAdmin.
 * Validates the tempToken from login() and the TOTP code, then returns full tokens.
 */
async function verifyTotpLogin(tempToken, totpToken) {
  let payload;
  try {
    payload = jwt.verify(tempToken, ACCESS_SECRET);
  } catch {
    throw new AuthError('Session expired or invalid. Please log in again.');
  }

  if (payload.type !== 'pre-2fa') {
    throw new AuthError('Invalid token type.');
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: payload.sub },
    include: { role: true },
  });

  if (!user.totpSecret || !user.is2faEnabled) {
    throw new AuthError('2FA is not configured for this account.', 400);
  }

  const isValid = authenticator.verify({ token: totpToken, secret: decrypt(user.totpSecret) });
  if (!isValid) {
    await writeAuditLog({ userId: user.id, action: 'TOTP_VERIFY_FAILURE', tableName: 'User', recordId: user.id });
    throw new AuthError('Invalid TOTP code.', 400);
  }

  const tokens = buildTokens(user);
  await writeAuditLog({ userId: user.id, action: 'LOGIN_SUCCESS', tableName: 'User', recordId: user.id });

  return { tokens, user: sanitizeUser(user) };
}

/**
 * Issues a new access token using a valid refresh token.
 */
async function refreshAccessToken(refreshToken) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, REFRESH_SECRET);
  } catch {
    throw new AuthError('Invalid or expired refresh token.');
  }

  if (payload.type !== 'refresh') {
    throw new AuthError('Invalid token type.');
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: payload.sub },
    include: { role: true },
  });

  const accessToken = jwt.sign(
    { sub: user.id, roleId: user.roleId, roleName: user.role.name, type: 'access' },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN }
  );

  return { accessToken };
}

module.exports = {
  AuthError,
  login,
  setupTotp,
  confirmTotpSetup,
  verifyTotpLogin,
  refreshAccessToken,
};
