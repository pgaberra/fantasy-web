import { test, expect } from '@playwright/test';

// Walks the full normal flow through a fresh throwaway account:
// register -> create projection -> edit a player -> edit a setting -> draft.
test.describe('happy path', () => {
  test.setTimeout(90_000);

  test('register, create a projection, edit a player and settings, then draft', async ({
    page,
  }) => {
    const email = `e2e-hp-${Date.now()}@slapstat.com`;
    const password = 'E2e-HappyPath-Ok9!';

    // 1) Register a fresh account and land signed-in on the projections list.
    await page.goto('/register');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('#confirmPassword').fill(password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/projections\/?$/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();

    // 2) Create a projection from last season's stats (the default source).
    await page.getByRole('button', { name: /create new projection/i }).click();
    await expect(page).toHaveURL(/\/projections\/new/);
    await page.locator('#projection-name').fill('E2E Happy Path');
    await page.getByRole('button', { name: /^create projection$/i }).click();
    await expect(page).toHaveURL(/\/projections\/[0-9a-f-]+$/i, { timeout: 20_000 });

    // 3) Edit a player: change the first stat value in the top row.
    const firstPlayerRow = page.locator('tr', { has: page.locator('.player-name-text') }).first();
    const statInput = firstPlayerRow.locator('input.stat-input').first();
    await statInput.fill('99');
    await expect(statInput).toHaveValue('99');

    // 4) Edit a setting: expand Projection Settings and switch scoring to Category.
    await page.getByRole('button', { name: /projection settings/i }).click();
    await expect(page.locator('.settings-section .hint')).toBeVisible();
    const categoryLabel = page.locator('label.radio-label', { hasText: 'Category' });
    if (!(await categoryLabel.isVisible())) {
      await page.getByRole('button', { name: /league settings/i }).click();
    }
    await categoryLabel.click();
    await expect(page.locator('input[name="scoringType"][value="category"]')).toBeChecked();

    // Let the editor's debounced autosave flush before leaving the page.
    await page.waitForTimeout(1_500);

    // 5) Enter draft mode from the projection card.
    await page.goto('/projections');
    await page.getByRole('button', { name: /draft mode/i }).click();
    await expect(page).toHaveURL(/\/draft\/?$/, { timeout: 15_000 });

    // 6) Start the draft with the default teams and order.
    await page.getByRole('button', { name: /start draft/i }).click();

    // 7) Draft the first available player (pick 1 belongs to My Team).
    const firstRow = page.locator('.available-row').first();
    const draftedName = ((await firstRow.locator('.row-name').textContent()) ?? '').trim();
    expect(draftedName).not.toEqual('');
    await firstRow.getByRole('button', { name: /draft/i }).click();

    // 8) The drafted player shows up in my roster.
    await expect(page.locator('.roster-slot.filled', { hasText: draftedName })).toBeVisible();
  });
});
