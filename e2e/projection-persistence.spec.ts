import { test, expect } from './fixtures';

/**
 * The regression test for the 2026-08-13 data loss.
 *
 * A user changed a setting on a saved projection. The web left the ~0.5 MB of player rows out of
 * that save, because they had not changed. The BFF's generated request model turned the omission
 * into an empty list. The db-service version in production read an empty list as "replace with
 * nothing", and 1589 rows were gone — with no backups to restore them from.
 *
 * Every service passed its own tests. The failure lived only in the combination, and no
 * environment ran the combination before production did. So this test asserts the one thing none
 * of them could: that after the round trip, through whatever versions are actually deployed, the
 * rows are still there.
 *
 * It registers its own throwaway account rather than using E2E_EMAIL, both so it needs no
 * credentials and so it can never be the thing that empties a shared account's projection.
 */
test.describe('a projection survives a settings-only save', () => {
  test.setTimeout(120_000);

  test('keeps its player rows when a setting changes and the page is reloaded', async ({
    page,
  }) => {
    const email = `e2e-persist-${Date.now()}@slapstat.com`;
    const password = 'E2e-Persistence-Ok9!';

    await page.goto('/register');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('#confirmPassword').fill(password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/projections\/?$/, { timeout: 15_000 });

    await page.getByRole('button', { name: /create new projection/i }).click();
    await page.locator('#projection-name').fill('E2E Persistence');
    await page.getByRole('button', { name: /^create projection$/i }).click();
    // Creating a projection seeds ~1589 rows server-side. 20s was enough on an idle staging and
    // not enough behind another test that had just drafted a league, which showed up as a flake
    // rather than as a failure worth trusting.
    await expect(page).toHaveURL(/\/projections\/[0-9a-f-]+$/i, { timeout: 45_000 });

    // "Showing N of M" — M is the projection's row count, which is what has to survive. The
    // visible rows are paginated, so counting <tr>s would only prove the first page came back.
    const resultCount = page.locator('.result-count');
    await expect(resultCount).toBeVisible({ timeout: 20_000 });
    const before = await resultCount.textContent();
    expect(before).toMatch(/of\s+\d+/);

    // Switching the league type touches settings only. That is precisely the save that omits the
    // player rows, and precisely the one that destroyed a real projection.
    await page.locator('.segmented button', { hasText: 'Category' }).click();
    await expect(page.locator('.segmented button[aria-pressed="true"]')).toHaveText(/category/i);

    // Wait for the save the app itself reports, rather than guessing at the debounce.
    await expect(page.locator('.save-status')).toHaveText(/saved/i, { timeout: 20_000 });

    await page.reload();

    await expect(resultCount).toBeVisible({ timeout: 20_000 });
    expect(await resultCount.textContent()).toEqual(before);
    await expect(page.getByText('This projection has no players.')).toHaveCount(0);
  });
});
