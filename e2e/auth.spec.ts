import { test, expect } from '@playwright/test';

test.describe('authentication', () => {
  test('login page renders the form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('shows an error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('no-such-user-e2e@slapstat.com');
    await page.locator('#password').fill('definitely-wrong-123');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('.error-banner')).toBeVisible();
  });
});
