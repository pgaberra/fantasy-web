import { test, expect } from './fixtures';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

const PRESET_NAME = "Last Season's Stats";

/**
 * Drafting straight from a preset, without making a projection first. A draft is a row of its
 * own, so the thing most worth guarding is that it stays out of the user's own projections — a
 * leak there would let it be edited or deleted as if it were their work.
 *
 * The account is shared and the test discards nothing, so it does not assume it starts empty.
 * It does not have to: a preset can be drafted against any number of times, so the flow is the
 * same on the first run and on the fiftieth.
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

    // The "Start a new draft" section renders once the sources have loaded, so waiting for it is
    // waiting for the page to be ready; count() itself does not wait.
    await expect(page.getByRole('region', { name: /start a new draft/i })).toBeVisible({
      timeout: 15_000,
    });
    const startDraft = page.getByRole('button', { name: /^start draft$/i });
    const presetRow = page.locator('li.row').filter({ hasText: PRESET_NAME });
    const draftsBefore = await page.locator('li.draft').count();

    // 2) Pick the preset's radio row (the page opens on the presets, so there is no tile to
    //    press) and press the page's one Start button. That opens the setup at
    //    /draft/new/preset/<preset> with nothing saved yet; the draft is created only once the
    //    setup is confirmed, which moves the page to the draft's own URL. Seeding its player
    //    rows server-side takes a moment.
    await expect(presetRow).toBeVisible();
    await presetRow.getByRole('radio').check();
    await startDraft.click();
    await expect(page).toHaveURL(/\/draft\/new\/preset\/[a-z_]+$/i);
    await expect(page.locator('app-draft-setup')).toBeVisible({ timeout: 30_000 });
    // A preset carries no league, so nothing names a draft position: the setup opens on a
    // disabled "Select" and Start is disabled until a seat is chosen. Seat 1 is always offered.
    await page.locator('#draft-position').selectOption('1');
    await expect(startDraft).toBeEnabled();
    await startDraft.click();

    await expect(page).toHaveURL(/\/drafts\/[0-9a-f-]+$/i, { timeout: 30_000 });
    // The draft is named after what it was started from, numbered where this account already
    // holds that name — which it does from the second run onwards.
    await expect(page.getByRole('heading').filter({ hasText: PRESET_NAME })).toBeVisible({
      timeout: 30_000,
    });

    // 3) The board is past its setup: it was confirmed a moment ago.
    // `exact` matters: a loose match would also hit "Exit draft mode" and trip strict mode.
    await expect(page.getByText('Draft Mode', { exact: true })).toBeVisible();

    // 4) Leaving the board returns to the drafts, not to a projection that isn't theirs.
    await page.getByRole('link', { name: /exit draft mode/i }).click();
    await expect(page).toHaveURL(/\/draft\/?$/);
    // The draft joins the list above, and the preset stays on offer below: a preset is never
    // used up by the draft played against it.
    await expect(page.locator('li.draft')).toHaveCount(draftsBefore + 1);
    await expect(presetRow).toBeVisible();

    // 5) A draft is not the user's own work, so it is absent from My projections.
    await page.getByRole('button', { name: /^draft$/i }).click();
    await page.getByRole('menuitem', { name: /my projections/i }).click();
    await expect(page).toHaveURL(/\/projections\/?$/);
    await expect(page.getByRole('heading', { name: 'My Projections' })).toBeVisible();
    await expect(page.locator('li').filter({ hasText: PRESET_NAME })).toHaveCount(0);
  });
});
