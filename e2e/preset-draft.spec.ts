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
 * the test does not discard one, so it asserts on where the flow ends up rather than on the
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
    await expect(page).toHaveURL(/\/home/, { timeout: 15_000 });

    // 1) Reach Draft mode through the nav menu rather than by URL, so the menu is covered too.
    await page.getByRole('button', { name: /^draft$/i }).click();
    await page.getByRole('menuitem', { name: /draft mode/i }).click();
    await expect(page).toHaveURL(/\/draft\/?$/);

    // The picker keeps a preset that has been drafted against out of the rows below, so which
    // of the two the preset shows up in says whether this run is the first on the account. The
    // "Start a new draft" section renders once the sources have loaded, so waiting for it is
    // waiting for the answer; count() itself does not wait.
    //
    // This used to wait for the Start button, which stopped rendering once the AI projection was
    // locked to Premium: with this preset already drafted, the locked AI projection is the only
    // preset left, it is picked by default, and the page's one action becomes "Unlock with
    // Premium". The section is there whatever is picked.
    const startDraft = page.getByRole('button', { name: /^start draft$/i });
    await expect(page.getByRole('region', { name: /start a new draft/i })).toBeVisible({
      timeout: 15_000,
    });
    const presetRow = page.locator('li.row').filter({ hasText: PRESET_NAME });
    const presetDraft = page.locator('li.draft').filter({ hasText: PRESET_NAME });
    const startedAlready = (await presetDraft.count()) > 0;

    // 2) Open the preset draft. A later run resumes the one already stored: the draft card is
    //    itself the button. A first run picks the preset's radio row (the page opens on the
    //    presets, so no tile to press) and presses the page's one Start button, which opens the
    //    setup at /draft/new/<preset> with nothing saved yet. The board is created only when the
    //    setup is confirmed, which moves the page to the board's own URL; seeding its player rows
    //    server-side takes a moment.
    //
    //    The staging reset empties this account every night, so the first-run branch is the one
    //    the scheduled run takes. It went unexercised for as long as a board was left over, and
    //    kept expecting Start to create the board after that stopped being true.
    if (startedAlready) {
      await presetDraft.getByRole('button', { name: /resume draft|view summary/i }).click();
    } else {
      await expect(presetRow).toBeVisible();
      await presetRow.getByRole('radio').check();
      await startDraft.click();
      await expect(page).toHaveURL(/\/draft\/new\/[a-z_]+$/i);
      await expect(page.locator('app-draft-setup')).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: /^start draft$/i }).click();
    }
    await expect(page).toHaveURL(/\/projections\/[0-9a-f-]+\/draft$/i, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: PRESET_NAME })).toBeVisible({
      timeout: 30_000,
    });

    // 3) The board is past its setup either way: a first run just confirmed it, and a stored
    // board is only ever created with its draft in it.
    // `exact` matters: a loose match would also hit "Exit draft mode" and trip strict mode.
    await expect(page.getByText('Draft Mode', { exact: true })).toBeVisible();

    // 4) Leaving the board returns to the source picker, not to a projection that isn't theirs.
    await page.getByRole('link', { name: /exit draft mode/i }).click();
    await expect(page).toHaveURL(/\/draft\/?$/);
    // The draft now exists, so the preset has moved out of the list below and into "Your drafts".
    await expect(presetDraft).toBeVisible();
    await expect(presetRow).toHaveCount(0);

    // 5) The preset draft is not the user's own work, so it is absent from My projections.
    await page.getByRole('button', { name: /^draft$/i }).click();
    await page.getByRole('menuitem', { name: /my projections/i }).click();
    await expect(page).toHaveURL(/\/projections\/?$/);
    await expect(page.getByRole('heading', { name: 'My Projections' })).toBeVisible();
    await expect(page.locator('li').filter({ hasText: PRESET_NAME })).toHaveCount(0);
  });
});
