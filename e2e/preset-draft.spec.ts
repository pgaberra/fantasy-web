import { test, expect } from './fixtures';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

const PRESET_NAME = "Last Season's Stats";

/**
 * Drafting straight from a preset, without making a projection first. The preset draft is
 * stored as a projection of its own kind, so the thing most worth guarding is that it stays
 * out of the user's own projections — a leak there would let it be edited or deleted as if it
 * were their work.
 *
 * The test tolerates a preset draft left behind by an earlier run: the account is shared and
 * there is no UI to delete one, so it asserts on where the flow ends up rather than on the
 * account starting empty.
 */
test.describe('draft mode from a preset', () => {
  test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD to run the signed-in tests');
  test.setTimeout(120_000);

  test('starts a draft from the preset and keeps it out of My projections', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(email!);
    await page.locator('#password').fill(password!);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/projections/, { timeout: 15_000 });

    // 1) Reach Draft mode through the nav menu rather than by URL, so the menu is covered too.
    await page.getByRole('button', { name: /^draft$/i }).click();
    await page.getByRole('menuitem', { name: /draft mode/i }).click();
    await expect(page).toHaveURL(/\/draft\/?$/);

    const presetCard = page.locator('li.card').filter({ hasText: PRESET_NAME });
    await expect(presetCard).toBeVisible();

    // 2) Open the preset draft. Seeding the player rows server-side takes a moment on a first
    //    run; a later run resumes the one already stored.
    await presetCard.getByRole('button').first().click();
    await expect(page).toHaveURL(/\/projections\/[0-9a-f-]+\/draft$/i, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: PRESET_NAME })).toBeVisible({
      timeout: 30_000,
    });

    // 3) Confirm the team setup if this run started a fresh draft, so it has a state to resume.
    // Wait for the board to settle into one phase or the other first: the check below is a
    // non-waiting isVisible(), so asking before either has rendered would silently skip the
    // setup and leave the draft without a state to resume.
    const confirmSetup = page.getByRole('button', { name: /^start draft$/i });
    await expect(page.locator('app-draft-setup, .draft-toolbar').first()).toBeVisible({
      timeout: 30_000,
    });
    if (await confirmSetup.isVisible().catch(() => false)) {
      await confirmSetup.click();
    }
    // `exact` matters: a loose match would also hit "← Exit draft mode" and trip strict mode.
    await expect(page.getByText('Draft mode', { exact: true })).toBeVisible();

    // 4) Leaving the board returns to the source picker, not to a projection that isn't theirs.
    await page.getByRole('link', { name: /exit draft mode/i }).click();
    await expect(page).toHaveURL(/\/draft\/?$/);
    await expect(presetCard.locator('.card-status')).toBeVisible();

    // 5) The preset draft is not the user's own work, so it is absent from My projections.
    await page.getByRole('button', { name: /^draft$/i }).click();
    await page.getByRole('menuitem', { name: /my projections/i }).click();
    await expect(page).toHaveURL(/\/projections\/?$/);
    await expect(page.getByRole('heading', { name: 'My projections' })).toBeVisible();
    await expect(page.locator('li').filter({ hasText: PRESET_NAME })).toHaveCount(0);
  });
});
