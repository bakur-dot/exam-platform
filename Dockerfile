# ── Backend — single-stage Node.js Alpine image ───────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install dependencies (prisma CLI is a regular dep, no devDeps to skip)
COPY package.json package-lock.json ./
RUN npm ci

# Copy Prisma schema + migrations + config, then generate the client
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

# Copy application source
COPY index.js ./
COPY src ./src

# Pre-create upload directories so the volume mount does not clobber them
RUN mkdir -p public/uploads/appeals \
             public/uploads/candidates \
             public/uploads/projects \
             public/uploads/questions

EXPOSE 3000

# Apply any pending DB migrations at startup, then launch the server.
# prisma migrate deploy is idempotent — safe to run on every container start.
CMD ["sh", "-c", "npx prisma migrate deploy --schema=prisma/schema.prisma && node index.js"]
