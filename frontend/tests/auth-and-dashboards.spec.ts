/**
 * E2E tests for the ISO 17024 Exam Platform — critical user journeys.
 *
 * Prerequisites (must be running before `npx playwright test`):
 *   • Vite dev server  → managed by playwright.config.ts webServer directive
 *   • Backend API      → http://localhost:3000 (start separately)
 *   • Seeded database  → admin@exam.local / admin123 (npx prisma db seed)
 *
 * Philosophy: read-only flows only. No exam submissions, no DB mutations.
 */

import { test, expect, type Page } from '@playwright/test';

// ── Shared helper ──────────────────────────────────────────────────────────────

/**
 * Log in as the seeded SuperAdmin and wait for the Admin Dashboard to appear.
 * The seed creates `admin@exam.local` without TOTP, so no second step is needed.
 */
async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('admin@exam.local');
  await page.getByLabel('Password').fill('admin123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin', { timeout: 15_000 });
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 1 — Authentication & Routing
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Authentication & Routing', () => {

  test('login page renders ISO 17024 branding', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
    await expect(page.locator('text=ISO 17024 Exam Platform')).toBeVisible();

    // Both form fields exist and are focusable
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  test('SuperAdmin credentials redirect to Admin Dashboard with all tabs', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email address').fill('admin@exam.local');
    await page.getByLabel('Password').fill('admin123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Should land on the admin route
    await page.waitForURL('**/admin', { timeout: 15_000 });

    // Dashboard heading confirms correct role landing
    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible();

    // All three navigation tabs are rendered
    await expect(page.getByRole('button', { name: 'Document Review' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reports & Analytics' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Appeals Review' })).toBeVisible();
  });

  test('unauthenticated visit to /admin redirects to login', async ({ page }) => {
    // Fresh context: localStorage is empty, so isAuthenticated = false.
    // ProtectedRoute immediately issues <Navigate to="/login" replace />.
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

  /**
   * LoginPage now uses toast.error() (via axiosMsg) instead of an inline
   * red banner. This test verifies the sonner toast DOM integration.
   *
   * Sonner renders: <section data-sonner-toaster> > <ol> > <li data-sonner-toast data-type="error">
   *
   * This test works even if the backend is unreachable: axios catches the
   * network error, falls through to the fallback message, and fires toast.error().
   */
  test('invalid credentials fire a Sonner error toast and stay on /login', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email address').fill('nobody@exam.local');
    await page.getByLabel('Password').fill('definitelywrong');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Wait for the Sonner error toast to appear in the DOM
    const errorToast = page.locator('[data-sonner-toast][data-type="error"]');
    await expect(errorToast).toBeVisible({ timeout: 10_000 });

    // Toast message is meaningful
    await expect(errorToast).toContainText(/Login failed|Invalid|credentials|error/i);

    // Confirm the user was NOT redirected — still on the login page
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
  });

  test('Sign in button is disabled while the request is in flight', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill('test@exam.local');
    await page.getByLabel('Password').fill('any');

    // Intercept the auth request so we can inspect the intermediate disabled state
    await page.route('**/auth/login', async (route) => {
      // Delay the response by 300 ms to observe the loading state
      await new Promise((r) => setTimeout(r, 300));
      await route.continue();
    });

    const submitBtn = page.getByRole('button', { name: /Sign in|Signing in/i });
    await submitBtn.click();

    // During the request the button text changes and it becomes disabled
    await expect(page.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// Test 3 — Layout & Polish: Tab Transitions
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Admin Dashboard — Tab Transitions & Layout Polish', () => {

  /**
   * This suite validates that our CSS animations (animate-fade-in, animate-modal-in)
   * do not prevent Playwright from interacting with page elements.
   *
   * Playwright's built-in actionability checks automatically handle CSS transitions:
   * it waits until elements are attached, visible, stable, and enabled before
   * asserting or interacting — no manual sleeps or waitForTimeout() needed.
   */
  test('tabs animate in gracefully — content is immediately actionable', async ({ page }) => {
    await loginAsAdmin(page);

    // ── Document Review (default active tab) ─────────────────────────────────
    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible();

    // The Refresh button is rendered inside the Documents tab content wrapper
    const docRefreshBtn = page.getByRole('button', { name: 'Refresh' });
    await expect(docRefreshBtn).toBeVisible();
    await expect(docRefreshBtn).toBeEnabled();

    // ── Switch to Reports & Analytics ─────────────────────────────────────────
    // Clicking triggers the animate-fade-in (150 ms) CSS animation.
    // Playwright waits for the new content to be stable without extra delays.
    await page.getByRole('button', { name: 'Reports & Analytics' }).click();

    // Sub-tabs are rendered unconditionally (not behind an API gate),
    // so they appear as soon as the tab content mounts.
    await expect(page.getByRole('button', { name: 'Session Reports' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thematic Stats' })).toBeVisible();

    // Verify sub-tab switching also fades gracefully
    await page.getByRole('button', { name: 'Thematic Stats' }).click();
    await expect(page.locator('text=Chapter Difficulty Analysis')).toBeVisible();

    await page.getByRole('button', { name: 'Session Reports' }).click();
    await expect(page.locator('text=Select a Session')).toBeVisible();

    // ── Switch to Appeals Review ──────────────────────────────────────────────
    await page.getByRole('button', { name: 'Appeals Review' }).click();

    // The status text / skeleton / empty-state is always rendered after mount
    await expect(
      page.locator('text=/No appeals filed yet|appeals total|Loading/i').first()
    ).toBeVisible({ timeout: 10_000 });

    // ── Return to Document Review ─────────────────────────────────────────────
    await page.getByRole('button', { name: 'Document Review' }).click();

    // Document tab content is back and the Refresh button is actionable again
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
    await expect(
      page.locator('text=/No pending documents|documents awaiting|Loading/i').first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Review Appeal modal fades and scales in without blocking inputs', async ({ page }) => {
    await loginAsAdmin(page);

    // Navigate to the Appeals tab
    await page.getByRole('button', { name: 'Appeals Review' }).click();

    // Wait for the appeals list to settle (loading → loaded)
    await expect(
      page.locator('text=/No appeals filed yet|appeals total|Loading/i').first()
    ).toBeVisible({ timeout: 10_000 });

    // Only attempt modal test if there is at least one PENDING appeal
    const reviewButton = page.getByRole('button', { name: 'Review' }).first();
    const hasReviewBtn = await reviewButton.isVisible().catch(() => false);

    if (!hasReviewBtn) {
      test.info().annotations.push({
        type: 'skip-reason',
        description: 'No PENDING appeals in the database — modal test skipped.',
      });
      return;
    }

    // Open the modal — it fades in with animate-modal-in (200 ms scale + opacity)
    await reviewButton.click();

    // The modal heading must be immediately actionable despite the animation
    await expect(page.getByRole('heading', { name: 'Review Appeal' })).toBeVisible();

    // Form inputs inside the animated modal must be interactable
    const notesArea = page.getByPlaceholder("Summarize the commission's decision…");
    await expect(notesArea).toBeVisible();
    await expect(notesArea).toBeEnabled();
    await notesArea.fill('Test annotation — E2E check only.');

    // Close the modal without submitting (read-only test)
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Review Appeal' })).not.toBeVisible();
  });

  test('Document Review skeleton disappears after data loads', async ({ page }) => {
    await loginAsAdmin(page);

    // Immediately after mount, loading = true → skeleton table is rendered.
    // After the API call resolves, skeleton is replaced by the real content.
    // We verify the final state: either a real table or the empty-state message.
    await expect(
      page.locator('text=/No pending documents|documents awaiting review|All documents have been reviewed/i').first()
    ).toBeVisible({ timeout: 15_000 });
  });

});
