import { test as base } from '@playwright/test';

/**
 * Consent is pre-declined before every navigation.
 *
 * Wherever a PostHog key is configured, the consent banner renders on first load and — being
 * fixed to the bottom of the viewport — intercepts clicks underneath it, failing Playwright's
 * actionability checks. Seeding the decision keeps these tests about the app rather than about
 * the banner, and keeps E2E runs out of the analytics data.
 *
 * Deployed staging currently has no key, so today this guards nothing. It is kept because the
 * day one is added is not the day anyone wants to rediscover why every click times out — and
 * because a run pointed at production via E2E_BASE_URL would need it immediately.
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
