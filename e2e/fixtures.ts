import { test as base } from '@playwright/test';

/**
 * Consent is pre-declined before every navigation.
 *
 * Staging builds ship a real PostHog key, so the consent banner would otherwise render on
 * first load and — being fixed to the bottom of the viewport — intercept clicks underneath
 * it, failing Playwright's actionability checks. Seeding the decision keeps these tests
 * about the app rather than about the banner, and keeps E2E runs out of the analytics data.
 *
 * The key mirrors CONSENT_STORAGE_KEY in src/app/services/analytics.service.ts; '0' is
 * posthog's own encoding for "denied".
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      localStorage.setItem('slapstat_analytics_consent', '0');
    });
    await use(page);
  },
});

export { expect } from '@playwright/test';
