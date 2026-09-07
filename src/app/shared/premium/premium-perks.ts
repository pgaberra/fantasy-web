import { environment } from '../../../environments/environment';

/** One thing Premium adds, and where a subscriber goes to use it. */
export interface PremiumPerk {
  readonly title: string;
  readonly description: string;
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
      title: 'The AI projection',
      description:
        'A model-built line for every player, ready to draft from as it is or to tune into your own.',
      link: '/projections/new',
      linkLabel: 'Start an AI projection',
    });
  }
  if (environment.whosHotEnabled) {
    perks.push({
      title: "Any game range on Who's Hot",
      description:
        'Every preset and the slider, from the last 10 games to the full season. Free accounts see the last 5.',
      link: '/whos-hot',
      linkLabel: "Pick a range on Who's Hot",
    });
  }
  perks.push({
    title: 'New tools first',
    description: 'New premium features land here as they are built, at the price you signed up at.',
  });
  return perks;
}

/** What the free app already includes, so the pricing page can say what Premium is on top of. */
export function freeFeatures(): readonly string[] {
  const features = [
    'Projections tailored to your league, points or categories',
    'The live draft board and post-draft power rankings',
    environment.espnLeaguesEnabled
      ? 'League settings imported from Yahoo or ESPN'
      : 'League settings imported from Yahoo',
    'Share a projection as a link',
  ];
  if (environment.whosHotEnabled) {
    features.splice(2, 0, "Who's Hot over the last 5 games");
  }
  return features;
}
