import { test, expect } from './fixtures';

// A realistic run through the editor and draft mode via a fresh throwaway account:
// register -> create -> edit several players -> remove a scoring stat + switch
// scoring type -> draft a small league all the way to completion.
test.describe('happy path', () => {
  test.setTimeout(180_000);

  test('register, edit several players and settings, then draft a league to completion', async ({
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

    // 3) Edit several players: raise some stats, clear another.
    const rows = page.locator('tr', { has: page.locator('.player-name-text') });
    const firstStat = rows.first().locator('input.stat-input').first();
    await firstStat.fill('99');
    await expect(firstStat).toHaveValue('99');
    await rows.nth(1).locator('input.stat-input').first().fill('80');
    await rows.nth(2).locator('input.stat-input').first().fill('0');
    await rows.nth(3).locator('input.stat-input').first().fill('65');

    // 4) Edit settings: expand the panel, remove a scoring stat, switch to Category.
    await page.getByRole('button', { name: /projection settings/i }).click();
    await expect(page.locator('.settings-section .hint')).toBeVisible();
    const categoryLabel = page.locator('label.radio-label', { hasText: 'Category' });
    if (!(await categoryLabel.isVisible())) {
      await page.getByRole('button', { name: /league settings/i }).click();
    }
    const statChips = page.locator('.stat-chip');
    const chipsBefore = await statChips.count();
    await page
      .getByRole('button', { name: /^remove /i })
      .first()
      .click();
    await expect(statChips).toHaveCount(chipsBefore - 1);
    await categoryLabel.click();
    await expect(page.locator('input[name="scoringType"][value="category"]')).toBeChecked();

    // Let the editor's debounced autosave flush before leaving the page.
    await page.waitForTimeout(1_500);

    // 5) Enter draft mode from the projection card.
    await page.goto('/projections');
    await page.getByRole('button', { name: /draft mode/i }).click();
    await expect(page).toHaveURL(/\/draft\/?$/, { timeout: 15_000 });

    // 6) Shrink to the smallest league so a full draft stays quick.
    const initialTeams = Number(
      (await page.locator('.stepper-value').textContent())?.trim() ?? '12',
    );
    const removeTeam = page.getByRole('button', { name: /remove a team/i });
    for (let i = 0; i < initialTeams - 2; i++) {
      await removeTeam.click();
    }
    await page.getByRole('button', { name: /start draft/i }).click();

    // 7) Draft the top available player over and over until the draft is complete.
    const draftComplete = page.getByText('Draft complete');
    for (let i = 0; i < 80; i++) {
      if (await draftComplete.isVisible().catch(() => false)) break;
      const draftButton = page
        .locator('.available-row')
        .first()
        .getByRole('button', { name: /draft/i });
      if (!(await draftButton.isVisible().catch(() => false))) break;
      await draftButton.click();
    }

    // 8) Every team's roster is filled — the draft is complete.
    await expect(draftComplete).toBeVisible();
  });
});
