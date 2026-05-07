# ISO 17024 Exam Platform — Development Progress

## Project State

A Node.js (CommonJS) REST API for an ISO 17024-compliant examination platform.
The backend is feature-complete through the Pre-Exam Protocol layer (Tasks 1–9).
The server boots cleanly with `npm start` and all schema changes are committed.

**Git:** Initial commit `c42a2b2` on branch `main` — 38 files, 5 234 insertions.
**Entry point:** `index.js` → `src/app.js` → Express 5, listening on `PORT` (default 3000).
**Database:** SQLite (`dev.db`) managed by Prisma 5.22.0 in WAL mode.
**Seed:** `npm run seed` → 4 roles (SuperAdmin, Admin, Examiner, Candidate) + SuperAdmin user `admin@exam.local / admin123`.

---

## Completed Tasks

- [x] **TASK 1 — Schema Initialization**
  Prisma 5 + SQLite schema. Models: Role, User, Specialization, Chapter, Question,
  Answer, ExamProfile, CandidateAttempt, AttemptAnswer, AuditLog.
  WAL mode + `foreign_keys=ON` enabled at runtime in `src/lib/prisma.js → connectDB()`.

- [x] **TASK 2 — Authentication & 2FA**
  `src/services/auth.service.js`. bcryptjs (cost=12) password hashing. JWT access
  tokens (15 min) + refresh tokens (7 days). TOTP 2FA for Admin/SuperAdmin via
  otplib@12.0.1 (pinned — v13 breaks the API). Secrets encrypted with AES-256-GCM
  (`src/lib/crypto.js`), stored as `iv:authTag:ciphertext`. Two-step login:
  `login()` returns `tempToken` (5 min) for 2FA users; `verifyTotpLogin()` exchanges
  it for full tokens. Auth middleware in `src/middleware/auth.middleware.js`:
  `requireAuth` (Bearer JWT) + `requireRole(...roleNames)`.

- [x] **TASK 3 — Question Bank & Versioning**
  `src/services/question.service.js`. Immutable versioning: editing an APPROVED
  question archives the old row (`isActive=false, status=ARCHIVED`) and creates a
  new DRAFT with `version+1` and the same `questionGroupId`. In-place edit allowed
  only for DRAFT/REJECTED. `AttemptAnswer` references the exact question row ID seen
  by the candidate — ISO 17024 auditability. `getExamQuestions()` strips `isCorrect`
  from answers (anti-cheat). Question image uploads via `uploadQuestionImage`
  middleware → `public/uploads/questions/`.

- [x] **TASK 4 — Exam Engine**
  `src/services/exam.service.js`. `generateExam` pre-seeds one `AttemptAnswer` row
  per assigned question (`selectedAnswerId=null`) so the exact question set is
  auditable even if the candidate abandons the exam. `saveAnswer` upserts on
  `(attemptId, questionId)` — idempotent auto-save. `finishExam` denominator =
  total assigned (unanswered = wrong). Overlap logic (`selectWithOverlapCap`):
  cap = `floor(count × 0.20)`; 4 cases handled; override logged as warning when
  pool is too small to enforce the cap.

- [x] **TASK 5 — Project Checking Module**
  Schema: `Project`, `ProjectMistake`, `AttemptProject`, `AttemptProjectMistake`.
  `ExamProfile.requiresProjects Boolean`. When true, `generateExam` selects 2
  projects via the same overlap-cap logic and pre-seeds `AttemptProject` rows in
  the same transaction. `saveProjectMistakes` — delete-then-createMany (idempotent
  sync). `finishExam` scores each project as `max(0, 100 − Σ penaltyPoints)`,
  persists to `AttemptProject.score`, returns `projectScores[]` + `avgProjectScore`.
  PDF upload: `uploadProjectFile` (20 MB) → `public/uploads/projects/`.

- [x] **TASK 6 — Candidate History, Appeals & Reporting**
  Schema: `Appeal` (`attemptId @unique` — one appeal per attempt at DB level).
  `src/services/appeal.service.js`: `createAppeal` guards ownership + SUBMITTED
  status + no existing appeal. `reviewAppeal` — atomic transaction (appeal update +
  optional `finalScore` override); two separate audit entries: `APPEAL_REVIEWED`
  and `SCORE_OVERRIDE`.
  `src/services/report.service.js`: `getCandidateHistory` — all attempts with appeal
  status. `getAttemptDetails` — per-question outcome (`wasCorrect` bool; `isCorrect`
  never returned), per-chapter score breakdown (group by `chapterId`, score =
  `(correct/total)×100`), project scores. `requesterId=null` bypasses ownership for
  admin access. Appeal document upload: `uploadAppealDocument` (PDF/JPEG/PNG, 10 MB)
  → `public/uploads/appeals/`.

- [x] **TASK 7 — REST API with RBAC**
  Express 5. Entry: `index.js → src/app.js`. `src/lib/asyncHandler.js` wraps every
  controller — zero try/catch in route handlers. `src/middleware/error.middleware.js`
  centralizes error handling: domain errors (named + `statusCode`) → their status;
  Prisma P2025 → 404; P2002 → 409; unknown → 500 (stack never leaks to client).
  Static uploads served at `/uploads/*`. 6 route files, 6 controller files.
  Ownership guard on exam endpoints: `findFirst({ where: { id, userId } })` returns
  404 (not 403) for foreign attempt IDs — prevents enumeration attacks.

- [x] **TASK 8 — Candidate Registration & Document Workflow**
  Schema: `CandidateDocument` (`@@unique([userId, docType])` — upsert per type;
  re-upload resets to PENDING). Doc types: `DIPLOMA | EXPERIENCE | ID_CARD | PHOTO`.
  `src/services/candidate.service.js`:
  - `uploadDocument` — upserts, always resets status to PENDING on re-upload.
  - `reviewDocument` — sets `APPROVED | REJECTED | RETURNED`; written reason
    required for REJECTED/RETURNED.
  - `checkExamEligibility` — single `count({ status: 'APPROVED' }) >= 4` query.
  - `bulkImportCandidates(csvBuffer)` — `csv-parse/sync` (memory, no disk);
    generates random 12-char hex initial passwords returned in response (shown once);
    idempotent (skips existing emails).
  `generateExam` doc-eligibility guard runs first — throws `ExamError(403)` before
  any other work if documents are not all approved.
  Uploads: `uploadCandidateDoc` (PDF/JPEG/PNG, 5 MB → `public/uploads/candidates/`),
  `uploadCsv` (memory storage, `.csv` only, 2 MB).

- [x] **TASK 10 — Advanced Reporting & Export**
  `src/services/report.service.js` extended with `getSessionReport(sessionId)` and
  `getThematicStats(profileId)`. New `src/services/export.service.js` (`pdfkit` +
  `exceljs`): `exportToPdf(data, title)` renders scalar fields as key-value pairs and
  array fields as ruled tables; `exportToExcel(data)` produces multi-sheet workbooks
  with navy header rows and alternating-row shading. Logo: loaded from `public/logo.png`
  via absolute path; placeholder box drawn when absent (no crash). 4 new routes:
  `GET /api/reports/sessions/:sessionId` (Examiner/Admin), `GET /api/reports/thematic/:profileId`
  (Admin), `GET /api/reports/attempts/:attemptId/export/pdf` (Candidate/Admin),
  `GET /api/reports/attempts/:attemptId/export/excel` (Candidate/Admin).
  Data-shaping helpers `buildPdfData` / `buildExcelData` live in the controller —
  they flatten `getAttemptDetails` output into columns; `isCorrect` is never forwarded.
  `getThematicStats` uses a two-step query (find completed attempt IDs, then aggregate
  AttemptAnswers) for Prisma 5 SQLite compatibility.

- [x] **TASK 9 — Examiner & Pre-Exam Protocol**
  Schema: `ExamSession` (examiner→User, examProfileId, scheduledTime, location),
  `SessionCandidate` (`@@unique([sessionId,candidateId])` +
  `@@unique([sessionId,candidateNumber])`; `isProtocolSigned Boolean @default(false)`;
  `startStatus String @default("WAITING")`). `CandidateAttempt.sessionId Int?` links
  attempt to its session.
  `src/services/session.service.js`:
  - `createSession` — Examiner/Admin creates session for an ExamProfile.
  - `addCandidateToSession` — assigns a unique candidate number; validates Candidate
    role; manual duplicate check for a clear 409 error.
  - `signProtocol` — Candidate acknowledges exam rules; logged to AuditLog.
  - `authorizeStart` — Examiner grants permission; requires `isProtocolSigned=true`;
    sets `startStatus=AUTHORIZED`; logged to AuditLog.
  `generateExam(userId, profileId, sessionId)` — session guard is guard #2 (between
  docs check and active-attempt check): verifies seat exists, examProfileId matches,
  `startStatus=AUTHORIZED`. Attempt is created with `sessionId` FK.

---

## All Tasks Complete — MVP Feature-Complete

Tasks 1–10 are fully implemented. The backend is ready for integration testing.

---

## Key Architectural Decisions

| Decision | Choice | Reason |
|---|---|---|
| PDF library | **pdfkit** (not puppeteer) | Pure Node.js, no Chromium download; logo embedded via absolute `public/logo.png` path with graceful fallback box |
| Excel library | **exceljs** | Multi-sheet workbooks; `writeBuffer()` returns a Node Buffer directly |
| Thematic stats query | Two-step (IDs then answers) | `AttemptAnswer` filtered by `attemptId IN [...]` avoids nested relation filter ambiguity in Prisma 5 + SQLite |
| Export data shaping | Controller helpers (`buildPdfData`, `buildExcelData`) | Presentation-layer flattening kept out of services; `isCorrect` is stripped here too |
| ORM version | Prisma **5.22.0** (pinned) | Prisma 7 requires driver adapters for SQLite — incompatible with a simple binary-engine MVP setup |
| SQLite mode | **WAL** (Write-Ahead Logging) | Enabled at runtime via `PRAGMA journal_mode=WAL` in `connectDB()`; improves concurrent read performance |
| Foreign keys | Enabled at runtime | SQLite does not persist `foreign_keys=ON` across connections; set alongside WAL in `connectDB()` |
| Status fields | Plain `String` (not enum) | Prisma 5 + SQLite does not support enums; valid values enforced at the application layer |
| Question versioning | Immutable rows | Editing APPROVED questions creates a new versioned row; old row is ARCHIVED — `AttemptAnswer` references the exact row a candidate saw (ISO 17024 auditability) |
| Question `questionGroupId` | Self-referential after insert | Set to own `id` in a `$transaction` — ties the row as the root of its version lineage |
| Exam question selection | `selectWithOverlapCap` | Shuffle + Fisher-Yates; 20% repeat cap; 4 explicit cases; cap override logged as warning (never silent) |
| AttemptAnswer pre-seeding | All assigned questions at `null` | Proves exactly what questions were in scope — unanswered rows are part of the audit record, not just answered ones |
| TOTP library | `otplib@12.0.1` | v13 broke the `authenticator` API; must stay on v12 |
| TOTP secret storage | AES-256-GCM, stored as `iv:authTag:ciphertext` | Key from `TOTP_ENCRYPTION_KEY` env (64-char hex); lives in `src/lib/crypto.js` |
| JWT strategy | Access (15 min) + Refresh (7 days) + Temp/pre-2FA (5 min) | Short-lived access; refresh for UX; temp token scoped to TOTP step only |
| Roles | DB table, not hardcoded | PM requirement; seeded via `prisma/seed.js` |
| CSV import | `csv-parse/sync` + `multer.memoryStorage()` | No temp files on disk; buffer goes straight to service; handles quoted fields correctly |
| Error handling | Named domain errors with `statusCode` | Each service exports its own Error class (`ExamError`, `SessionError`, etc.); centralized middleware reads `err.name` + `err.statusCode` |
| Exam ownership guard | `findFirst({ where: { id, userId } })` returning 404 | Returns same response for "not found" and "belongs to someone else" — prevents attempt ID enumeration |
| Admin bypass in reports | `requesterId=null` | `getAttemptDetails(attemptId, null)` skips ownership check; caller (controller) decides based on role |
| Score override audit trail | Two separate `AuditLog` rows | `APPEAL_REVIEWED` on the Appeal table + `SCORE_OVERRIDE` on CandidateAttempt — unambiguous change history |
| `generateExam` guard order | Docs → Session auth → Active attempt → Load profile | Cheapest/most-likely failures first; expensive DB work only after all guards pass |
| Document upsert on re-upload | Resets status to `PENDING` | A replaced document must be re-reviewed; previously APPROVED status cannot persist for a new file |
| Candidate number uniqueness | `@@unique([sessionId, candidateNumber])` | Anonymous identification within an exam room; enforced at DB level |

---

## File Structure (as committed)

```
Exam-Platform/
├── index.js                          # Entry point → src/app.js
├── package.json                      # npm start, npm run seed
├── prisma/
│   ├── schema.prisma                 # Full Prisma 5 schema
│   ├── seed.js                       # Roles + SuperAdmin seed
│   └── migrations/
└── src/
    ├── app.js                        # Express app, routes, error middleware
    ├── constants/
    │   └── question.constants.js     # STATUS enum, TRANSITIONS, LOCKED sets
    ├── controllers/
    │   ├── auth.controller.js
    │   ├── candidate.controller.js
    │   ├── exam.controller.js
    │   ├── question.controller.js
    │   ├── report.controller.js
    │   ├── session.controller.js
    │   └── appeal.controller.js
    ├── lib/
    │   ├── asyncHandler.js           # Wraps async controllers, forwards to next(err)
    │   ├── crypto.js                 # AES-256-GCM encrypt/decrypt for TOTP secrets
    │   └── prisma.js                 # PrismaClient singleton + connectDB() (WAL + FK)
    ├── middleware/
    │   ├── auth.middleware.js        # requireAuth, requireRole
    │   ├── error.middleware.js       # Centralized error handler
    │   └── upload.middleware.js      # multer: questions/projects/appeals/candidates/csv
    ├── routes/
    │   ├── auth.routes.js            # /api/auth
    │   ├── candidate.routes.js       # /api/candidates
    │   ├── exam.routes.js            # /api/exams
    │   ├── question.routes.js        # /api/questions
    │   ├── report.routes.js          # /api/reports
    │   ├── session.routes.js         # /api/sessions
    │   └── appeal.routes.js          # /api/appeals
    └── services/
        ├── auth.service.js
        ├── candidate.service.js
        ├── exam.service.js
        ├── export.service.js             # pdfkit + exceljs; exportToPdf, exportToExcel
        ├── question.service.js
        ├── report.service.js             # + getSessionReport, getThematicStats
        ├── session.service.js
        └── appeal.service.js
```

---

## Environment Variables Required (`.env`)

```
DATABASE_URL="file:./dev.db"
JWT_ACCESS_SECRET=<random 64-char string>
JWT_REFRESH_SECRET=<random 64-char string>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
TOTP_ENCRYPTION_KEY=<random 64-char hex string>
APP_NAME=ExamPlatform
PORT=3000
```
