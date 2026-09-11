import { environment } from '../../../environments/environment';

/** One thing Premium adds. */
export interface PremiumPerk {
  readonly title: string;
  /** Absent where the title says the whole thing on its own. */
  readonly description?: string;
}

/**
 * What Premium includes, in the order it is worth saying.
 *
 * It follows what the environment serves: without the AI projection (the BFF's answer,
 * `FeatureService.aiProjection`) or Who's hot (a build flag) it must not sell them, since a perk
 * nobody can reach is a refund request.
 */
export function premiumPerks(aiProjectionServed: boolean): readonly PremiumPerk[] {
  const perks: PremiumPerk[] = [];
  if (aiProjectionServed) {
    perks.push({
      title: 'AI projection',
      description: 'Every player projected for the 2026-27 season.',
    });
  }
  if (environment.whosHotEnabled) {
    perks.push({ title: "Custom range on Who's Hot" });
  }
  perks.push({
    title: 'New features first',
    description: 'Get new Premium features as they are released.',
  });
  return perks;
}

/** What the free app already includes, so the Premium page can say what Premium is on top of. */
export function freeFeatures(): readonly string[] {
  const features = [
    "Projections tailored to your league's scoring",
    'Draft mode and post-draft team rankings',
    environment.espnLeaguesEnabled
      ? 'Import league settings from Yahoo or ESPN'
      : 'Import league settings from Yahoo',
    'Share projections',
  ];
  if (environment.whosHotEnabled) {
    features.splice(2, 0, "Who's Hot");
  }
  return features;
}
