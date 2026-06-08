# Exam Platform — Backend Reference Documentation

> ISO 17024-compliant examination platform.
> Stack: Node.js (CommonJS) · Express 5 · Prisma 5.22.0 · SQLite (WAL mode)
> Entry point: `index.js → src/app.js` · Default port: `3000`

---

## Table of Contents

1. [Database Schema](#1-database-schema)
2. [REST API Endpoints](#2-rest-api-endpoints)
3. [Authentication Flow](#3-authentication-flow)
4. [Core Exam Engine](#4-core-exam-engine)
5. [Document Eligibility & Pre-Exam Protocol](#5-document-eligibility--pre-exam-protocol)
6. [Scoring & Appeals](#6-scoring--appeals)
7. [Reporting & Export](#7-reporting--export)
8. [Error Handling Contract](#8-error-handling-contract)
9. [Environment Variables](#9-environment-variables)

---

## 1. Database Schema

### Roles & Users

| Model | Key Fields | Notes |
|---|---|---|
| `Role` | `id`, `name` | Seeded: SuperAdmin, Admin, Examiner, Candidate |
| `User` | `id`, `name`, `email`, `passwordHash`, `roleId`, `totpSecret`, `is2faEnabled` | `totpSecret` is AES-256-GCM encrypted; null until TOTP setup |

### Candidate Documents

| Model | Key Fields | Notes |
|---|---|---|
| `CandidateDocument` | `id`, `userId`, `docType`, `documentUrl`, `status`, `rejectionReason` | `@@unique([userId, docType])` — one slot per type per user; re-upload upserts and resets to PENDING |

`docType` values: `DIPLOMA | EXPERIENCE | ID_CARD | PHOTO`
`status` values: `PENDING | APPROVED | REJECTED | RETURNED`

### Content Hierarchy

| Model | Key Fields | Notes |
|---|---|---|
| `Specialization` | `id`, `name` | Root of content tree |
| `Chapter` | `id`, `name`, `specializationId` | `@@unique([specializationId, name])` |
| `Question` | `id`, `questionGroupId`, `chapterId`, `content`, `imageUrl`, `version`, `isActive`, `status` | `@@unique([questionGroupId, version])` — immutable versioning |
| `Answer` | `id`, `questionId`, `content`, `isCorrect` | `isCorrect` is never exposed to candidates |

**Question status lifecycle:**
```
DRAFT → PENDING → APPROVED → ARCHIVED   (APPROVED edit creates new version)
              ↓
           REJECTED → PENDING
```

### Exam Configuration & Sessions

| Model | Key Fields | Notes |
|---|---|---|
| `ExamProfile` | `id`, `specializationId`, `questionCount`, `passingScore`, `durationMinutes`, `isExpert`, `requiresProjects` | `passingScore` is a percentage (0–100) |
| `ExamSession` | `id`, `examinerId`, `examProfileId`, `scheduledTime`, `location` | Examiner schedules sessions per profile |
| `SessionCandidate` | `id`, `sessionId`, `candidateId`, `candidateNumber`, `isProtocolSigned`, `startStatus` | `@@unique([sessionId, candidateId])` + `@@unique([sessionId, candidateNumber])` |

`startStatus` values: `WAITING | AUTHORIZED`

### Attempts & Answers

| Model | Key Fields | Notes |
|---|---|---|
| `CandidateAttempt` | `id`, `userId`, `examProfileId`, `sessionId`, `startTime`, `endTime`, `status`, `finalScore` | `sessionId` is nullable (non-session attempts allowed by schema) |
| `AttemptAnswer` | `id`, `attemptId`, `questionId`, `selectedAnswerId`, `savedAt` | `@@unique([attemptId, questionId])` — upsert key for auto-save; pre-seeded with `selectedAnswerId=null` |

`status` values: `IN_PROGRESS | SUBMITTED | TIMED_OUT`

### Project Checking

| Model | Key Fields | Notes |
|---|---|---|
| `Project` | `id`, `specializationId`, `title`, `description`, `fileUrl`, `isActive` | PDF uploaded to `public/uploads/projects/` |
| `ProjectMistake` | `id`, `projectId`, `description`, `penaltyPoints` | Penalty weight for each checklist item |
| `AttemptProject` | `id`, `attemptId`, `projectId`, `score` | `@@unique([attemptId, projectId])`; `score` set at `finishExam` |
| `AttemptProjectMistake` | `id`, `attemptProjectId`, `mistakeId` | `@@unique([attemptProjectId, mistakeId])` |

### Appeals & Audit

| Model | Key Fields | Notes |
|---|---|---|
| `Appeal` | `id`, `attemptId`, `documentUrl`, `status`, `decisionNotes`, `isScoreChanged` | `attemptId @unique` — one appeal per attempt at DB level |
| `AuditLog` | `id`, `userId?`, `action`, `tableName`, `recordId`, `oldData?`, `newData?` | Append-only; never UPDATE or DELETE |

---

## 2. REST API Endpoints

All routes are prefixed with `/api`. All protected routes require `Authorization: Bearer <accessToken>`.

### `/api/auth`

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/register` | Public | `name, email, password, roleId` | Register a new user |
| POST | `/login` | Public | `email, password` | Returns full tokens OR `{ requiresTwoFactor: true, tempToken }` for 2FA users |
| POST | `/verify-totp` | Public | `tempToken, code` | Exchange temp token + TOTP code for full tokens |
| POST | `/refresh` | Public | `refreshToken` | Rotate refresh token; returns new `accessToken` + `refreshToken` |
| POST | `/setup-totp` | Bearer | — | Generate TOTP secret; returns `qrCodeUrl`, `manualEntryKey` (shown once) |
| POST | `/confirm-totp` | Bearer | `code` | Verify first code to activate 2FA |

### `/api/questions`

| Method | Path | Auth (min role) | Description |
|---|---|---|---|
| GET | `/` | Examiner | List all active (non-archived) questions with chapter and answers |
| GET | `/chapters` | Examiner | Fetch all chapters (with specialization) for question creation dropdown |
| POST | `/` | Examiner | Create question draft with answers (`content`, `chapterId`, `answers[]`) |
| PUT | `/:id` | Examiner | Edit question (in-place for DRAFT/REJECTED; creates new version for APPROVED) |
| POST | `/:id/submit` | Examiner | Submit DRAFT question for admin review (DRAFT → PENDING) |
| POST | `/:id/approve` | Admin | Approve a PENDING question (PENDING → APPROVED) |
| POST | `/:id/upload` | Examiner | Upload question image (`multipart/form-data`, field: `document`) |

### `/api/exams`

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/generate` | Candidate | `profileId, sessionId` | Run all guards then create attempt + pre-seed answers |
| POST | `/:id/answers` | Candidate | `questionId, answerId` | Auto-save answer (idempotent upsert) |
| POST | `/:id/finish` | Candidate | — | Score and close attempt |
| POST | `/:id/projects/:projectId/mistakes` | Examiner | `mistakeIds[]` | Sync mistake marks (delete-then-insert) |

### `/api/reports`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/history` | Candidate | Own attempt history with appeal status |
| GET | `/attempts/:attemptId` | Candidate / Admin | Full attempt breakdown (wasCorrect per question, chapter scores, project scores) |
| GET | `/sessions/:sessionId` | Examiner / Admin | Aggregate session results (pass/fail counts, averages, chapter breakdown) |
| GET | `/thematic/:profileId` | Admin | Chapter difficulty analysis across all completed attempts |
| GET | `/attempts/:attemptId/export/pdf` | Candidate / Admin | Download attempt as `application/pdf` |
| GET | `/attempts/:attemptId/export/excel` | Candidate / Admin | Download attempt as `.xlsx` |

### `/api/appeals`

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/` | Candidate | `attemptId, documentUrl` | Submit appeal (once per attempt, SUBMITTED status required) |
| PATCH | `/:id/review` | Admin | `decisionNotes, isScoreChanged, newFinalScore?` | Review appeal; optionally override final score |

### `/api/candidates`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/documents` | Candidate | List all documents uploaded by the authenticated candidate |
| GET | `/eligibility` | Candidate | Returns `{ eligible: bool }` — true if all 4 doc types are APPROVED |
| GET | `/pending-documents` | Admin/SuperAdmin | Fetch all PENDING documents (with candidate name & email) for the admin review queue |
| POST | `/documents` | Candidate | Upload one document (`multipart/form-data`, fields: `document` + `docType`) |
| POST | `/documents/:id/review` | Admin | Set document status (APPROVED/REJECTED/RETURNED); `reason` required for REJECTED/RETURNED |
| PATCH | `/documents/:id/review` | Admin | Same as POST review — REST-correct alias |
| POST | `/import` | Admin | Bulk-import candidates from CSV (`field: file`); returns `{ created, skipped, errors[], users[{email, initialPassword}] }` |

### `/api/sessions`

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/` | Examiner / Admin | `examProfileId, scheduledTime, location` | Create exam session |
| POST | `/:id/candidates` | Examiner / Admin | `candidateId, candidateNumber` | Add candidate to session |
| POST | `/:id/candidates/:candidateId/sign` | Candidate | — | Sign pre-exam protocol |
| POST | `/:id/candidates/:candidateId/authorize` | Examiner / Admin | — | Authorize candidate to start (requires protocol signed) |

---

## 3. Authentication Flow

### Standard login (Examiner / Candidate)

```
POST /api/auth/login  { email, password }
  → 200 { accessToken, refreshToken, user: { id, name, email, roleName } }
```

`accessToken` TTL: 15 min · `refreshToken` TTL: 7 days

### Two-factor login (Admin / SuperAdmin)

```
Step 1 — POST /api/auth/login  { email, password }
  → 200 { requiresTwoFactor: true, tempToken }
         tempToken TTL: 5 min; scoped to TOTP verification only

Step 2 — POST /api/auth/verify-totp  { tempToken, code }
  → 200 { accessToken, refreshToken, user }
```

If 2FA has never been set up, Step 1 returns full tokens with `mustSetupTotp: true` as a flag.

### TOTP setup (Admin / SuperAdmin — first login)

```
POST /api/auth/setup-totp          (Bearer accessToken)
  → 200 { qrCodeUrl, manualEntryKey }   ← shown once; user scans into authenticator app

POST /api/auth/confirm-totp  { code }   (Bearer accessToken)
  → 200 { message: "2FA enabled" }
```

### Token refresh

```
POST /api/auth/refresh  { refreshToken }
  → 200 { accessToken, refreshToken }   ← old refresh token is invalidated
```

### JWT payload shape

```json
{ "sub": 3, "roleName": "Candidate", "iat": ..., "exp": ... }
```

`req.user.sub` is the user id; `req.user.roleName` is used for RBAC guards.

---

## 4. Core Exam Engine

### `generateExam(userId, profileId, sessionId)` — guard chain

Guards run in this order so the cheapest checks fail fast before expensive DB work:

```
1. Document eligibility   — all 4 CandidateDocument rows must have status=APPROVED
2. Session authorization  — seat exists, examProfileId matches, startStatus=AUTHORIZED
3. Active attempt check   — no IN_PROGRESS attempt for this profile already exists
4. Load ExamProfile       — fetch questionCount, passingScore, requiresProjects
5. Select questions       — selectWithOverlapCap(pool, count, previousAttempts)
6. (if requiresProjects)  — select 2 projects with same overlap logic
7. Create attempt + pre-seed AttemptAnswer rows (all selectedAnswerId=null)
```

All of step 7 runs inside a single `$transaction` — the attempt and its answer rows are atomic.

### `selectWithOverlapCap(pool, count, previousIds)` — 20 % repeat cap

```
cap = floor(count × 0.20)

Case 1: pool ≥ count AND (pool − previousIds) ≥ count
  → pick entirely from unseen questions (0 repeats)

Case 2: pool ≥ count AND (pool − previousIds) < count
  → fill with all unseen questions first, then pad with up to `cap` seen questions
  → if seen questions needed > cap: log WARNING (cap override), use what is available

Case 3: pool < count
  → use entire pool; log WARNING (insufficient questions)

Case 4: previousIds is empty (first attempt)
  → shuffle pool, pick first `count`
```

Fisher-Yates shuffle is applied before selection in all cases.
The cap override is always logged as a `console.warn` — it is never silent.

### `saveAnswer(attemptId, questionId, selectedAnswerId)` — auto-save

Upserts on `@@unique([attemptId, questionId])`. Idempotent — calling it repeatedly with the same answer is safe. Returns the updated `AttemptAnswer` row.

### `finishExam(attemptId)` — scoring

```
questionScore = (correctAnswers / totalAssigned) × 100
  ↑ denominator is totalAssigned, NOT totalAnswered
  ↑ unanswered questions count as wrong (ISO 17024 requirement)

if requiresProjects:
  projectScore[i] = max(0, 100 − Σ penaltyPoints of marked mistakes)
  avgProjectScore  = mean(projectScore[])

finalScore = questionScore   (project scoring stored separately on AttemptProject.score)
```

Sets `status = SUBMITTED`, `endTime = now()`, writes `EXAM_SUBMITTED` audit entry.

---

## 5. Document Eligibility & Pre-Exam Protocol

### Document workflow

```
Candidate uploads doc (docType: DIPLOMA | EXPERIENCE | ID_CARD | PHOTO)
  → upserts CandidateDocument row; always resets status to PENDING
  → Admin reviews: APPROVED | REJECTED (reason required) | RETURNED (reason required)
  → Re-upload of any type resets that doc to PENDING regardless of prior status
```

`checkExamEligibility(userId)` — returns `true` only when `count({ status:'APPROVED' }) >= 4`.
Because `@@unique([userId, docType])` guarantees at most one row per type, a simple
count of 4 APPROVED rows is sufficient — no need to check distinct types.

### Pre-exam protocol sequence

```
1. Examiner creates ExamSession  (POST /api/sessions)
2. Examiner adds candidates      (POST /api/sessions/:id/candidates)
   → Each candidate gets a unique candidateNumber within the session
3. Candidate signs protocol      (POST /api/sessions/:id/candidates/:cid/sign)
   → Sets isProtocolSigned=true; logged to AuditLog as PROTOCOL_SIGNED
4. Examiner authorizes start     (POST /api/sessions/:id/candidates/:cid/authorize)
   → Requires isProtocolSigned=true; sets startStatus=AUTHORIZED
   → Logged to AuditLog as EXAM_START_AUTHORIZED
5. Candidate calls generateExam  (POST /api/exams/generate)
   → Session guard (step 2 of generateExam) validates AUTHORIZED status
```

---

## 6. Scoring & Appeals

### Score override via appeal

```
Candidate submits appeal   POST /api/appeals  { attemptId, documentUrl }
  → Guards: attempt.userId === requesterId, status=SUBMITTED, no existing appeal

Admin reviews              PATCH /api/appeals/:id/review
  → If isScoreChanged=true: updates CandidateAttempt.finalScore
  → Always writes two AuditLog rows:
      APPEAL_REVIEWED  on Appeal
      SCORE_OVERRIDE   on CandidateAttempt  (only when isScoreChanged=true)
```

One appeal per attempt is enforced at the DB level (`Appeal.attemptId @unique`).

### Ownership & enumeration prevention

All per-attempt endpoints use `findFirst({ where: { id, userId } })` rather than `findUnique`.
A foreign attempt ID returns **404**, not 403 — preventing candidates from discovering
valid attempt IDs that belong to other users.

Admin/SuperAdmin controllers pass `requesterId = null` to bypass this check.

---

## 7. Reporting & Export

### `getSessionReport(sessionId)`

Returns aggregate metrics for a single `ExamSession`:
- `totalCandidates` — all registered `SessionCandidate` rows
- `completedAttempts` — SUBMITTED + TIMED_OUT only
- `passed`, `failed`, `averageScore`
- `chapterBreakdown[]` — per-chapter `totalAnswers / correctAnswers / successRate` across all attempts in the session

### `getThematicStats(profileId)`

Cross-session difficulty analysis for all completed attempts under one `ExamProfile`.
Uses a two-step query (fetch completed attempt IDs → query AttemptAnswers) for Prisma 5 + SQLite compatibility with nested-relation filters.
Results are sorted ascending by `successRate` — hardest chapters first.

### PDF export (`exportToPdf(data, title)`)

- Library: `pdfkit` (pure Node.js — no Chromium, no headless browser)
- Logo: loaded from `public/logo.png` via **absolute path** (`path.join(process.cwd(), 'public', 'logo.png')`). Absolute path prevents any cwd-relative rendering failures in production. When the file is absent, a placeholder box is drawn — no crash.
- Layout: scalar fields → key-value summary block; array fields → ruled tables with per-page header repetition on overflow.
- Table rendering uses explicit `(x, y)` coordinates for every cell — cursor is manually advanced after each row. This guarantees correct column alignment regardless of cell content length.

### Excel export (`exportToExcel(data)`)

- Library: `exceljs`
- Structure: each array-valued key in the data object → one worksheet (name = camelCase → Title Case). Scalar fields → "Summary" sheet.
- Styling: navy header row (`#1F4E79`) with white bold text; alternating light-grey shading on even data rows; auto-fit column widths (max 50 chars).

### `isCorrect` policy in reports

`Answer.isCorrect` is fetched internally for scoring but is **never returned** to any client in any endpoint — including export. Only `wasCorrect` (a boolean outcome for the candidate's own answer) is exposed. This is enforced in `getAttemptDetails` and repeated in `buildPdfData` / `buildExcelData` in the controller.

---

## 8. Error Handling Contract

All service layers export a named error class (e.g. `ExamError`, `SessionError`).
These carry a `statusCode` property. The centralized `errorMiddleware` (`src/middleware/error.middleware.js`) maps them as follows:

| Condition | HTTP Status |
|---|---|
| Named domain error with `statusCode` | That status code |
| Prisma `P2025` (record not found) | 404 |
| Prisma `P2002` (unique constraint) | 409 |
| Any other error | 500 (message only; stack never sent to client) |

All controller functions are wrapped in `asyncHandler` (`src/lib/asyncHandler.js`) —
there are zero `try/catch` blocks in route handlers.

---

## 9. Environment Variables

```
DATABASE_URL="file:./dev.db"
JWT_ACCESS_SECRET=<random 64-char string>
JWT_REFRESH_SECRET=<random 64-char string>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
TOTP_ENCRYPTION_KEY=<random 64-char hex string>   # key for AES-256-GCM TOTP secret storage
APP_NAME=ExamPlatform
PORT=3000
```

Copy `.env.example` to `.env` and populate before running `npm start`.
Run `npm run seed` once to create the 4 roles and the default SuperAdmin account (`admin@exam.local / admin123`).

---

## File Structure

```
Exam-Platform/
├── index.js                          # Entry point
├── package.json
├── public/
│   ├── logo.png                      # ICCA logo for PDF export (place here)
│   └── uploads/                      # Runtime file storage (gitignored)
│       ├── questions/
│       ├── projects/
│       ├── appeals/
│       └── candidates/
├── prisma/
│   ├── schema.prisma
│   ├── seed.js
│   └── migrations/
└── src/
    ├── app.js                        # Express app, route mounting, error middleware
    ├── constants/
    │   └── question.constants.js     # Status values, transition rules, locked sets
    ├── controllers/
    │   ├── auth.controller.js
    │   ├── candidate.controller.js
    │   ├── exam.controller.js
    │   ├── question.controller.js
    │   ├── report.controller.js      # Includes buildPdfData / buildExcelData helpers
    │   ├── session.controller.js
    │   └── appeal.controller.js
    ├── lib/
    │   ├── asyncHandler.js           # fn => (req,res,next) => Promise.resolve(fn).catch(next)
    │   ├── crypto.js                 # AES-256-GCM encrypt/decrypt for TOTP secrets
    │   └── prisma.js                 # PrismaClient singleton + connectDB() (WAL + FK pragmas)
    ├── middleware/
    │   ├── auth.middleware.js        # requireAuth, requireRole
    │   ├── error.middleware.js       # Centralized; reads err.name + err.statusCode
    │   └── upload.middleware.js      # multer: questions / projects / appeals / candidates / csv
    ├── routes/
    │   ├── auth.routes.js
    │   ├── candidate.routes.js
    │   ├── exam.routes.js
    │   ├── question.routes.js
    │   ├── report.routes.js
    │   ├── session.routes.js
    │   └── appeal.routes.js
    └── services/
        ├── auth.service.js
        ├── candidate.service.js
        ├── exam.service.js           # generateExam, saveAnswer, finishExam, selectWithOverlapCap
        ├── export.service.js         # exportToPdf (pdfkit), exportToExcel (exceljs)
        ├── question.service.js
        ├── report.service.js         # getCandidateHistory, getAttemptDetails, getSessionReport, getThematicStats
        ├── session.service.js
        └── appeal.service.js
```
