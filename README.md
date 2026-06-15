# Exam Platform — ISO 17024 Compliant

A production-ready, full-stack examination platform built to **ISO 17024** certification body standards. Supports the complete candidate lifecycle: document submission → examination → project assessment → results → appeals.

[![CI](https://github.com/your-org/exam-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/exam-platform/actions/workflows/ci.yml)

---

## Tech Stack

| Layer       | Technology                                                    |
|-------------|---------------------------------------------------------------|
| Backend API | Node.js 20, Express 5, Prisma 5, SQLite (WAL mode)           |
| Frontend    | React 19, Vite 8, TypeScript, Tailwind CSS 3, Zustand, Sonner |
| Auth        | JWT (access + refresh tokens), bcryptjs, TOTP (otplib)       |
| Exports     | PDFKit (PDF reports), ExcelJS (Excel exports)                 |
| DevOps      | Docker, Docker Compose, nginx reverse proxy, GitHub Actions   |
| Testing     | Playwright E2E (Chromium)                                     |

---

## Features

- **Candidate portal** — document submission, session lobby, timed exam engine, project evaluation, results, appeals workflow
- **Examiner dashboard** — question bank (DRAFT → ACTIVE lifecycle), session management, live project assessment grading with real-time mistake syncing
- **Admin dashboard** — document review, session reports, thematic analytics (chapter difficulty), appeals review with optional score override
- **Global UI polish** — Sonner toast notifications, skeleton loaders, CSS fade/scale animations, smooth tab transitions

---

## Quickstart — Docker (Recommended)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)

### 1. Clone and configure environment

```bash
git clone https://github.com/your-org/exam-platform.git
cd exam-platform

cp .env.example .env
```

Edit `.env` and replace the placeholder secrets with real values. Generate each secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run that command three times — once each for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `TOTP_ENCRYPTION_KEY`.

### 2. Build and start all containers

```bash
docker-compose up --build
```

| Service  | URL                       |
|----------|---------------------------|
| Frontend | http://localhost          |
| Backend  | http://localhost:3000/api |

The nginx container transparently proxies all `/api` and `/uploads` traffic to the backend — no CORS configuration needed.

### 3. Subsequent starts

```bash
docker-compose up
```

### 4. Stop containers

```bash
docker-compose down
```

### Data persistence

Two named Docker volumes survive `docker-compose down`:

| Volume         | Contents                           |
|----------------|------------------------------------|
| `db-data`      | SQLite database (`prisma/dev.db`)  |
| `uploads-data` | All user-uploaded files            |

To wipe everything and start fresh:

```bash
docker-compose down -v
```

---

## Default Credentials

The database seed creates one account automatically:

| Role       | Email               | Password   |
|------------|---------------------|------------|
| SuperAdmin | `admin@exam.local`  | `admin123` |

> **Important:** Change this password before any production deployment.

The SuperAdmin account has no TOTP secret set — login is single-step (email + password only).

---

## Local Development (without Docker)

### Prerequisites

- Node.js ≥ 20
- npm ≥ 10

### 1. Install all dependencies

```bash
# From the repo root:
npm run install:all
# or: make install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in the three secret values
```

### 3. Initialize the database

```bash
# Apply migrations and generate the Prisma client
npx prisma migrate dev

# Seed default roles and the SuperAdmin account
npm run seed
# or: make seed
```

### 4. Run both services

```bash
npm run dev
# or: make dev
```

This starts:
- **Backend API** → `http://localhost:3000` (via `node index.js`)
- **Frontend** → `http://localhost:5173` (via Vite dev server with `/api` proxy)

Both services run concurrently in the same terminal using `concurrently`. Output is color-coded (`cyan` = API, `magenta` = UI).

### Available npm scripts (root)

| Script             | Description                                          |
|--------------------|------------------------------------------------------|
| `npm run dev`      | Start both API and Vite dev server concurrently      |
| `npm run start`    | Start API server only                                |
| `npm run seed`     | Seed the database                                    |
| `npm run db:migrate` | Create and apply a new Prisma migration            |
| `npm run db:studio`  | Open Prisma Studio in the browser                  |
| `npm run docker:up`  | Build and start Docker Compose stack               |
| `npm run docker:down`| Stop Docker Compose containers                     |
| `npm run test:e2e`   | Run Playwright E2E tests (delegates to frontend)   |

---

## E2E Testing (Playwright)

Tests live in `frontend/tests/`. The suite covers:

- **Authentication & Routing** — SuperAdmin login → admin dashboard; unauthenticated routes redirect to `/login`
- **Sonner Toast Notifications** — invalid credentials trigger `[data-sonner-toast][data-type="error"]`
- **Tab Transitions & Layout** — `animate-fade-in` / `animate-modal-in` animations do not block Playwright's actionability checks

### Run locally

Start the backend first, then run the tests in a separate terminal:

```bash
# Terminal 1 — backend
npm run start

# Terminal 2 — E2E tests (Playwright starts the Vite dev server automatically)
npm run test:e2e
# or: make test-e2e
```

### Playwright options

```bash
# Interactive UI mode (see tests run live)
npm run test:e2e:ui --prefix frontend

# Open the last HTML report
npm run test:e2e:report --prefix frontend
```

Traces, screenshots, and videos are captured automatically on failure and saved to `frontend/playwright-report/`.

---

## CI/CD — GitHub Actions

The pipeline (`.github/workflows/ci.yml`) runs on every push and pull request to `main`:

1. Install backend dependencies → generate Prisma client → apply migrations → seed DB
2. Start the API server in the background
3. Install frontend dependencies → build (TypeScript check + Vite bundle)
4. Install Playwright Chromium browser
5. Wait for the backend to accept connections on port 3000
6. Run Playwright E2E tests (`CI=true` — Playwright manages the Vite dev server)
7. Upload `playwright-report/` as an artifact on failure (7-day retention)

### Optional: GitHub repository secrets

The workflow includes fallback test-only secrets so CI passes on a fresh fork. For a real deployment, add these as **Repository Secrets** (`Settings → Secrets and variables → Actions`):

| Secret name           | Description                    |
|-----------------------|--------------------------------|
| `JWT_ACCESS_SECRET`   | 64-char hex string             |
| `JWT_REFRESH_SECRET`  | 64-char hex string (different) |
| `TOTP_ENCRYPTION_KEY` | 64-char hex string             |

---

## Environment Variables

See [`.env.example`](.env.example) for the full list and descriptions.

---

## Project Structure

```
exam-platform/
├── src/                  # Express API (routes, middleware, services)
├── prisma/               # Schema, migrations, seed script
├── public/uploads/       # Runtime file uploads (gitignored)
├── frontend/             # React + Vite frontend
│   ├── src/
│   │   ├── pages/        # Admin, Examiner, Candidate dashboards + Login
│   │   ├── components/   # Shared UI components (Skeleton, etc.)
│   │   ├── store/        # Zustand auth store
│   │   └── utils/        # axiosMsg, api service
│   └── tests/            # Playwright E2E tests
├── .github/workflows/    # GitHub Actions CI pipeline
├── docker-compose.yml    # Multi-container Docker setup
├── Dockerfile            # Backend container image
└── Makefile              # Management shortcuts (Linux / macOS / CI)
```
