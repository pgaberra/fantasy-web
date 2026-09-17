import { test, expect } from './fixtures';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

/**
 * Importing a projection from a spreadsheet, end to end on deployed staging: the cells a user
 * pastes out of Excel or Google Sheets, matched against the real player pool, written into a
 * projection, saved, and still there after a reload.
 *
 * The rows are chosen for what they exercise against the live pool: a plain match, a name the
 * pool spells differently (Yegor for Egor Chinakhov), two players of one name on one club told
 * apart by position (Elias Pettersson, a centre and a defenceman), and a name nobody in the pool
 * has. The sheet's own rounding (50.4 + 90.3 is not 140.8) must not leave a warning behind.
 *
 * It runs only where the build turns the import on (SPREADSHEET_IMPORT_ENABLED), and on the shared
 * test account, so it creates a projection of its own and deletes it again.
 */
test.describe('spreadsheet import', () => {
  test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD to run the signed-in tests');
  test.setTimeout(180_000);

  test('imports pasted cells into a projection and keeps them after a reload', async ({ page }) => {
    const projectionName = `E2E Spreadsheet Import ${Date.now()}`;

    await page.goto('/login');
    await page.locator('#email').fill(email!);
    await page.locator('#password').fill(password!);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/home/, { timeout: 15_000 });

    await page.goto('/projections/new');
    await page.locator('#projection-name').fill(projectionName);
    await page.getByRole('button', { name: /^create projection$/i }).click();
    await expect(page).toHaveURL(/\/projections\/[0-9a-f-]+$/i, { timeout: 45_000 });
    const editorUrl = page.url();

    // The editor has rendered once its search box is there; only then does a missing import
    // button mean the build has the import switched off.
    await expect(page.getByPlaceholder('Search player…')).toBeVisible({ timeout: 45_000 });
    const importButton = page.getByRole('button', { name: 'Import spreadsheet' });
    const importOn = (await importButton.count()) > 0;

    try {
      test.skip(!importOn, 'The import is switched off in this build (SPREADSHEET_IMPORT_ENABLED)');
      await importButton.click();
      await page
        .locator('#spreadsheet-paste')
        .fill(
          [
            'Player\tTeam\tPos\tGP\tG\tA\tPTS\tPPP',
            'Connor McDavid\tEDM\tC\t82\t50.4\t90.3\t140.8\t50.2',
            'Yegor Chinakhov\tPIT\tRW\t80\t25\t20\t45\t10',
            'Elias Pettersson\tVAN\tC2\t80\t30\t50\t80\t25',
            'Wayne Gretzky\tEDM\tC\t82\t92\t120\t212\t40',
          ].join('\n'),
        );
      await page.getByRole('button', { name: 'Continue' }).click();

      const summary = page.locator('.summary');
      await expect(summary).toContainText('3 of 4 players found.');
      await expect(summary).toContainText('1 matched by a different spelling');
      await expect(summary).toContainText('1 not found');
      await expect(page.locator('.ambiguous')).toHaveCount(0);

      await page.getByRole('button', { name: /different spelling/ }).click();
      await expect(page.getByLabel('Match for Yegor Chinakhov')).toContainText('Egor Chinakhov');

      await page.getByRole('button', { name: 'Import 3 players' }).click();
      await expect(page.locator('app-spreadsheet-import-dialog')).toHaveCount(0);
      await expect(page.locator('.save-status')).toHaveText(/saved/i, { timeout: 30_000 });

      await page.reload();
      const search = page.getByPlaceholder('Search player…');
      await expect(search).toBeVisible({ timeout: 30_000 });

      await search.fill('McDavid');
      const mcdavid = page.locator('tr', { hasText: 'Connor McDavid' });
      await expect(mcdavid).toHaveCount(1);
      const values = await mcdavid
        .locator('input.stat-input')
        .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
      // GP, goals, assists and power-play points as the sheet gave them. The PPP cell carries no
      // warning although the sheet gave no PPG or PPA: the import split the total between them.
      expect(values).toEqual(expect.arrayContaining(['82', '50.4', '90.3', '50.2']));
      await expect(mcdavid.locator('.has-warning')).toHaveCount(0);

      await search.fill('Chinakhov');
      const chinakhov = page.locator('tr', { hasText: 'Egor Chinakhov' });
      await expect(chinakhov).toHaveCount(1);
      expect(
        await chinakhov
          .locator('input.stat-input')
          .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
      ).toEqual(expect.arrayContaining(['80', '25', '20', '10']));
      await expect(chinakhov.locator('.has-warning')).toHaveCount(0);
    } finally {
      // The shared account keeps nothing from this run.
      await page.goto('/projections');
      const menu = page.getByRole('button', { name: `More actions for ${projectionName}` });
      const listed = await menu
        .waitFor({ timeout: 30_000 })
        .then(() => true)
        .catch(() => false);
      if (listed) {
        await menu.click();
        await page.getByRole('button', { name: /^delete$/i }).click();
        await page.getByRole('button', { name: /yes, delete/i }).click();
        await expect(menu).toHaveCount(0, { timeout: 15_000 });
      } else {
        test.info().annotations.push({ type: 'cleanup', description: `not deleted: ${editorUrl}` });
      }
    }
  });
});
