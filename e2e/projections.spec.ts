import { test, expect } from './fixtures';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('signed-in experience', () => {
  test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD to run the signed-in tests');

  test('logs in and reaches the projections page', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(email!);
    await page.locator('#password').fill(password!);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/projections/, { timeout: 15000 });
    // Sign out lives in the account menu behind the avatar, as a menu item, so being signed in
    // reads as that menu opening onto it.
    await page.getByRole('button', { name: /account menu/i }).click();
    await expect(page.getByRole('menuitem', { name: /sign out/i })).toBeVisible();
  });
});
