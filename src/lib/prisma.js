'use strict';

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';

const prisma = new PrismaClient({
  datasourceUrl: DATABASE_URL,
});

/**
 * Call once at application startup.
 * WAL mode persists in the .db file after the first set, but re-applying is safe.
 * foreign_keys must be re-enabled per connection — SQLite does not persist it.
 */
async function connectDB() {
  await prisma.$connect();
  // PRAGMA journal_mode returns the active mode — must use $queryRawUnsafe
  await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
  // foreign_keys does not return rows — $executeRawUnsafe is correct
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys=ON;');
}

async function disconnectDB() {
  await prisma.$disconnect();
}

module.exports = { prisma, connectDB, disconnectDB };
