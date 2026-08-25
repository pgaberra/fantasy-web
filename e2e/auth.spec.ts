import { test, expect } from './fixtures';

test.describe('authentication', () => {
  test('login page renders the form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  /**
   * The sign-in card is centred in whatever the banners and the header leave, and the page
   * itself has nothing to scroll to. It used to subtract the header's height by hand — a
   * number that was right only when no banner was showing above it, which left every short
   * page with a stub of a scrollbar leading nowhere. Nothing here can catch that but layout
   * in a real browser.
   */
  test('fills the window exactly, with nothing to scroll to', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto('/login');
    await expect(page.locator('.auth-card')).toBeVisible();

    const fit = await page.evaluate(() => {
      const card = document.querySelector('.auth-card')!.getBoundingClientRect();
      return {
        overshoot: document.documentElement.scrollHeight - innerHeight,
        offCentre: Math.abs(card.top + card.height / 2 - innerHeight / 2),
      };
    });

    expect(fit.overshoot).toBeLessThanOrEqual(1);
    // Centred between the chrome above it and the bottom of the window, give or take the
    // header the card is centred below.
    expect(fit.offCentre).toBeLessThan(60);
  });

  test('shows an error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('no-such-user-e2e@slapstat.com');
    await page.locator('#password').fill('definitely-wrong-123');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('.error-banner')).toBeVisible();
  });
});
