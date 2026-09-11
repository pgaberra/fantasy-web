import { describe, expect, it } from 'vitest';
import { premiumPerks } from './premium-perks';

describe('premiumPerks', () => {
  it('sells the AI projection where the BFF serves it', () => {
    expect(premiumPerks(true).map((perk) => perk.title)).toContain('AI projection');
  });

  // A perk nobody can reach is a refund request.
  it('does not sell the AI projection where the BFF does not serve it', () => {
    expect(premiumPerks(false).map((perk) => perk.title)).not.toContain('AI projection');
  });
});
