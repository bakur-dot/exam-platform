'use strict';

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL || 'file:./dev.db',
});

async function main() {
  // ── Roles ──────────────────────────────────────────────────────────────────
  console.log('Seeding roles...');
  const roleNames = ['SuperAdmin', 'Admin', 'Examiner', 'Candidate'];
  for (const name of roleNames) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    console.log(`  [${role.id}] ${role.name}`);
  }

  // ── Default SuperAdmin ─────────────────────────────────────────────────────
  console.log('\nSeeding default SuperAdmin...');
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'SuperAdmin' } });
  const passwordHash = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@exam.local' },
    update: {},
    create: {
      name: 'Super Admin',
      email: 'admin@exam.local',
      passwordHash,
      roleId: superAdminRole.id,
    },
  });
  console.log(`  [${admin.id}] ${admin.email}  (role: SuperAdmin)`);
  console.log('\nSeed completed.');
}

main()
  .catch((err) => { console.error('Seed failed:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
