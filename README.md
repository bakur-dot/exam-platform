# Exam Platform — ISO 17024 Compliant

A full-stack examination platform built to ISO 17024 certification body standards.

**Stack:** Node.js · Express 5 · Prisma 5 · SQLite (WAL) · React 18 · Vite · TypeScript · Tailwind CSS

---

## Features

- **Candidate portal** — document submission, session lobby, timed exam engine, project evaluation, results, appeals
- **Examiner dashboard** — question bank management, session management, live project assessment grading
- **Admin dashboard** — document review, session reports, thematic analytics, appeals review with score override
- **Module A** — Reporting, analytics, PDF/Excel export
- **Module B** — Examiner project assessment with real-time mistake syncing
- **Module C** — ISO 17024 appeals workflow (file → review → optional score override)

---

## Docker Setup

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)

### 1. Create your environment file

Copy the example and fill in real secret values:

```bash
cp .env.example .env
```

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run it three times — once for `JWT_ACCESS_SECRET`, once for `JWT_REFRESH_SECRET`, once for `TOTP_ENCRYPTION_KEY`.

### 2. Build and start all containers

```bash
docker-compose up --build
```

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost           |
| Backend  | http://localhost:3000/api  |

The frontend nginx container proxies all `/api` and `/uploads` traffic to the backend container — no CORS configuration needed.

### 3. Subsequent starts (no rebuild)

```bash
docker-compose up
```

### 4. Stop containers

```bash
docker-compose down
```

### Data persistence

Two named Docker volumes are created automatically:

| Volume        | Contents                              |
|---------------|---------------------------------------|
| `db-data`     | SQLite database (`prisma/dev.db`)     |
| `uploads-data`| All user-uploaded files               |

Data survives `docker-compose down`. To wipe data completely:

```bash
docker-compose down -v
```

---

## Local Development (without Docker)

### Backend

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# (Optional) Seed the database
npm run seed

# Start the API server
npm start
# → http://localhost:3000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

The Vite dev server proxies `/api` and `/uploads` to `http://localhost:3000` automatically.

---

## Environment Variables

See [`.env.example`](.env.example) for the full list of required variables.
