import { environment } from '../../../environments/environment';

/** One thing Premium adds, and where a subscriber goes to use it. */
export interface PremiumPerk {
  readonly title: string;
  /** Absent where the title says the whole thing on its own. */
  readonly description?: string;
  /**
   * The page the perk lives on, for the moment straight after checkout when the useful thing to
   * say is where to go. Absent for a promise rather than a page.
   */
  readonly link?: string;
  readonly linkLabel?: string;
}

/**
 * What Premium includes, in the order it is worth saying.
 *
 * One list for the Premium page and the welcome after checkout, so the two cannot drift into
 * promising different things. It follows what the environment serves: without the AI projection
 * (the BFF's answer, `FeatureService.aiProjection`) or Who's hot (a build flag) it must not sell
 * them, since a perk nobody can reach is a refund request.
 */
export function premiumPerks(aiProjectionServed: boolean): readonly PremiumPerk[] {
  const perks: PremiumPerk[] = [];
  if (aiProjectionServed) {
    perks.push({
      title: 'AI projection',
      description: 'Every player projected for the 2026-27 season.',
      link: '/projections/new',
      linkLabel: 'Start an AI projection',
    });
  }
  if (environment.whosHotEnabled) {
    perks.push({
      title: "Custom range on Who's Hot",
      link: '/whos-hot',
      linkLabel: "Pick a range on Who's Hot",
    });
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
