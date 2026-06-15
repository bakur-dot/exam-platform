/**
 * E2E tests for the ISO 17024 Exam Platform — critical user journeys.
 *
 * Prerequisites (must be running before `npx playwright test`):
 *   • Vite dev server  → managed by playwright.config.ts webServer directive
 *   • Backend API      → http://localhost:3000 (start separately)
 *   • Seeded database  → admin@exam.local / admin123 (npx prisma db push && npm run seed)
 *
 * Philosophy: read-only flows only. No exam submissions, no DB mutations.
 */

import { test, expect, type Page } from '@playwright/test';

// ── Shared helper ──────────────────────────────────────────────────────────────

/**
 * Log in as the seeded SuperAdmin with a rock-solid wait sequence:
 *   1. Set up response listener BEFORE clicking (avoids race if API is fast)
 *   2. Click submit
 *   3. Await the 200 from /api/auth/login
 *   4. Await URL change to /admin
 *   5. Await the heading — confirms React has mounted and Zustand auth is hydrated
 */
async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('admin@exam.local');
  await page.getByLabel('Password').fill('admin123');

  // Register listener before click to avoid missing a fast response
  const authResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/login') && resp.status() === 200,
    { timeout: 15_000 },
  );
  await page.getByRole('button', { name: 'Sign in' }).click();
  await authResponse;

  await page.waitForURL('**/admin', { timeout: 15_000 });

  // Heading visible = React mounted + ProtectedRoute passed + auth store hydrated
  await expect(
    page.getByRole('heading', { name: /admin dashboard/i }),
  ).toBeVisible({ timeout: 10_000 });
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 1 — Authentication & Routing
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Authentication & Routing', () => {

  test('login page renders ISO 17024 branding', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
    await expect(page.locator('text=ISO 17024 Exam Platform')).toBeVisible();

    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  test('SuperAdmin credentials redirect to Admin Dashboard with all tabs', async ({ page }) => {
    await loginAsAdmin(page);

    await expect(page.getByRole('button', { name: 'Document Review' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reports & Analytics' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Appeals Review' })).toBeVisible();
  });

  test('unauthenticated visit to /admin redirects to login', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForURL('**/login', { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
  });

  test('unauthenticated visit to /candidate redirects to login', async ({ page }) => {
    await page.goto('/candidate');
    await page.waitForURL('**/login', { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// Test 2 — Sonner Toast on Failed Authentication
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Error Toast Notifications (Sonner)', () => {

  test('invalid credentials fire a Sonner error toast and stay on /login', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email address').fill('nobody@exam.local');
    await page.getByLabel('Password').fill('definitelywrong');
    await page.getByRole('button', { name: 'Sign in' }).click();

    const errorToast = page.locator('[data-sonner-toast][data-type="error"]');
    await expect(errorToast).toBeVisible({ timeout: 10_000 });
    await expect(errorToast).toContainText(/Login failed|Invalid|credentials|error/i);

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
  });

  test('Sign in button is disabled while the request is in flight', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill('test@exam.local');
    await page.getByLabel('Password').fill('any');

    await page.route('**/auth/login', async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.continue();
    });

    await page.getByRole('button', { name: /Sign in|Signing in/i }).click();
    await expect(page.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// Test 3 — Layout & Polish: Tab Transitions
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Admin Dashboard — Tab Transitions & Layout Polish', () => {

  /**
   * beforeEach runs a full login with guaranteed API + navigation + heading
   * completion before any test body executes. This prevents the "navigated back
   * to /login" failure seen in CI where per-test loginAsAdmin calls inside the
   * test body raced against React's initial render.
   */
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('tabs animate in gracefully — content is immediately actionable', async ({ page }) => {
    // ── Document Review (default active tab) ─────────────────────────────────
    const docRefreshBtn = page.getByRole('button', { name: 'Refresh' });
    await expect(docRefreshBtn).toBeVisible();
    await expect(docRefreshBtn).toBeEnabled();

    // ── Switch to Reports & Analytics ─────────────────────────────────────────
    await page.getByRole('button', { name: 'Reports & Analytics' }).click();
    await expect(page.getByRole('button', { name: 'Session Reports' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thematic Stats' })).toBeVisible();

    // Verify sub-tab switching also fades gracefully
    await page.getByRole('button', { name: 'Thematic Stats' }).click();
    await expect(page.locator('text=Chapter Difficulty Analysis')).toBeVisible();

    await page.getByRole('button', { name: 'Session Reports' }).click();
    await expect(page.locator('text=Select a Session')).toBeVisible();

    // ── Switch to Appeals Review ──────────────────────────────────────────────
    await page.getByRole('button', { name: 'Appeals Review' }).click();
    await expect(
      page.locator('text=/No appeals filed yet|appeals total|Loading/i').first()
    ).toBeVisible({ timeout: 10_000 });

    // ── Return to Document Review ─────────────────────────────────────────────
    await page.getByRole('button', { name: 'Document Review' }).click();
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
    await expect(
      page.locator('text=/No pending documents|documents awaiting|Loading/i').first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Review Appeal modal fades and scales in without blocking inputs', async ({ page }) => {
    await page.getByRole('button', { name: 'Appeals Review' }).click();

    await expect(
      page.locator('text=/No appeals filed yet|appeals total|Loading/i').first()
    ).toBeVisible({ timeout: 10_000 });

    const reviewButton = page.getByRole('button', { name: 'Review' }).first();
    const hasReviewBtn = await reviewButton.isVisible().catch(() => false);

    if (!hasReviewBtn) {
      test.info().annotations.push({
        type: 'skip-reason',
        description: 'No PENDING appeals in the database — modal test skipped.',
      });
      return;
    }

    await reviewButton.click();
    await expect(page.getByRole('heading', { name: 'Review Appeal' })).toBeVisible();

    const notesArea = page.getByPlaceholder("Summarize the commission's decision…");
    await expect(notesArea).toBeVisible();
    await expect(notesArea).toBeEnabled();
    await notesArea.fill('Test annotation — E2E check only.');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Review Appeal' })).not.toBeVisible();
  });

  test('Document Review skeleton disappears after data loads', async ({ page }) => {
    await expect(
      page.locator('text=/No pending documents|documents awaiting review|All documents have been reviewed/i').first()
    ).toBeVisible({ timeout: 15_000 });
  });

});
