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
    const projectionName = 'E2E Happy Path';

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
    await page.locator('#projection-name').fill(projectionName);
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

    // 4) Remove a scoring stat and switch the league to Category.
    //
    // Both settings used to live in a "Projection settings" panel below the table. They now sit in
    // the table's own toolbar — the league type as a segmented control, the stat columns behind a
    // Stats popover — so this step follows them there rather than to a panel that no longer exists.
    const statsMenu = page.getByRole('button', { name: /^stats$/i });
    await statsMenu.click();
    const checkedStats = page.locator('.add-row[aria-checked="true"]');
    const checkedBefore = await checkedStats.count();
    expect(checkedBefore).toBeGreaterThan(0);
    await checkedStats.first().click();
    await expect(checkedStats).toHaveCount(checkedBefore - 1);
    await page.keyboard.press('Escape');

    const categoryOption = page.locator('.segmented button', { hasText: 'Category' });
    await categoryOption.click();
    await expect(categoryOption).toHaveAttribute('aria-pressed', 'true');

    // Let the editor's debounced autosave flush before leaving the page.
    await page.waitForTimeout(1_500);

    // 5) Enter draft mode. The projections list no longer carries a Draft button — a draft is
    //    started from the Draft menu's source page, which asks what to draft against first.
    await page.getByRole('button', { name: /^draft$/i }).click();
    await page.getByRole('menuitem', { name: /draft mode/i }).click();
    await expect(page).toHaveURL(/\/draft\/?$/, { timeout: 15_000 });

    // The page asks for the kind of source first, and opens on the presets: the projection sits
    // behind the "Your projection" segment, as a radio card, with the page's one Start button
    // below. Scoped to the group: the draft cards above carry "Your projection" in their meta.
    await page
      .getByRole('group', { name: /draft against/i })
      .getByRole('button', { name: /your projection/i })
      .click();
    const sourceRow = page.locator('li.row').filter({ hasText: projectionName });
    await expect(sourceRow).toBeVisible();
    await sourceRow.getByRole('radio').check();
    await page.getByRole('button', { name: /^start draft$/i }).click();
    await expect(page).toHaveURL(/\/projections\/[0-9a-f-]+\/draft$/i, { timeout: 30_000 });

    // 6) Shrink to the smallest league so a full draft stays quick. Wait for the setup phase to
    //    render first — the board seeds its rows on arrival, and reading the stepper before it
    //    exists would take the fallback and remove the wrong number of teams.
    await expect(page.locator('app-draft-setup')).toBeVisible({ timeout: 30_000 });
    const initialTeams = Number(
      (await page.locator('.stepper-value').textContent())?.trim() ?? '12',
    );
    const removeTeam = page.getByRole('button', { name: /remove a team/i });
    for (let i = 0; i < initialTeams - 2; i++) {
      await removeTeam.click();
    }
    await page.getByRole('button', { name: /^start draft$/i }).click();

    // 7) Draft the top available player over and over until the draft is complete.
    // The loop's own guards do not wait, so the first row has to be awaited here: confirming
    // the setup only just switched the board out of its setup phase, and a guard that runs
    // before the list renders reads "no players left" and ends the draft at zero picks.
    const topDraftButton = page
      .locator('.available-row')
      .first()
      .getByRole('button', { name: /draft/i });
    await expect(topDraftButton).toBeVisible({ timeout: 30_000 });

    const draftComplete = page.getByText('Draft complete');
    for (let i = 0; i < 80; i++) {
      const draftButton = page
        .locator('.available-row')
        .first()
        .getByRole('button', { name: /draft/i });

      // Ask the button itself, at the instant it matters. This used to read "Draft complete"
      // first and then click whatever was there, and the two are the same state read twice:
      // the board disables this button exactly when the draft is over
      // (draft-available-panel.html, `[disabled]="isComplete()"`), in the same render that puts
      // the text in the toolbar. A guard taken a moment before that render says "carry on", and
      // the click that follows lands on a button that has since gone disabled — which Playwright
      // retries until the 180s test timeout, failing the run and opening an e2e-red issue.
      // Seen on run 33730624717.
      //
      // The short timeouts bound the last iteration, where the answer is "nothing left to press"
      // and the default would spend the test's whole budget discovering it.
      if (!(await draftButton.isEnabled({ timeout: 5_000 }).catch(() => false))) break;
      try {
        await draftButton.click({ timeout: 15_000 });
      } catch {
        // It went disabled between the check and the press, which from here is what finishing
        // the draft looks like. Step 8 is what decides whether that is what happened.
        break;
      }
    }

    // 8) Every team's roster is filled — the draft is complete.
    await expect(draftComplete).toBeVisible();
  });
});
