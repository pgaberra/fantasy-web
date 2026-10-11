import { test, expect } from './fixtures';

test('landing page renders and links to sign in', async ({ page }) => {
  await page.goto('/');
  // Either landing page, since staging picks one with NEW_LANDING_ENABLED.
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    /Your best lineup|Prepare for the upcoming/,
  );
  await page.getByRole('link', { name: 'Sign In' }).first().click();
  await expect(page).toHaveURL(/\/login/);
});
