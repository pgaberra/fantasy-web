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
 * One list for the pricing page, the account page and the welcome after checkout, so the three
 * cannot drift into promising three different things. It follows the build flags: a build with
 * the AI projection or Who's hot switched off must not sell them, since a perk nobody can reach is
 * a refund request.
 */
export function premiumPerks(): readonly PremiumPerk[] {
  const perks: PremiumPerk[] = [];
  if (environment.aiProjectionEnabled) {
    perks.push({
      title: 'AI projection',
      description: 'Every player projected for the 2026-27 season with our AI model.',
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
    title: 'More Premium features',
    description: 'New Premium features will be added regularly.',
  });
  return perks;
}

/** What the free app already includes, so the pricing page can say what Premium is on top of. */
export function freeFeatures(): readonly string[] {
  const features = [
    "Projections tailored to your league's scoring",
    'Live draft board and post-draft rankings',
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
