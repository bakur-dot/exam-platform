'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV — NIST recommended size for GCM

function getKey() {
  const hex = process.env.TOTP_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('TOTP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Check your .env file.');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts a plaintext string with AES-256-GCM.
 * Output format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

/**
 * Decrypts a string produced by encrypt().
 * Throws if the auth tag doesn't match (tamper detection).
 */
function decrypt(ciphertext) {
  const key = getKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
