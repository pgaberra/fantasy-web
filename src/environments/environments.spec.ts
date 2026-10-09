import { describe, expect, it } from 'vitest';
import { environment } from './environment';
import { environment as prod } from './environment.prod';
import { environment as staging } from './environment.staging';

/**
 * The three files stand in for one another (angular.json swaps environment.ts for the prod or
 * staging one), so a field present in one and missing in another compiles in the default build
 * and fails only in the swapped one. `sharedNoticeEnabled` reached environment.ts and
 * environment.prod.ts but not environment.staging.ts, and `npm run start:staging` stopped
 * compiling without any check saying so.
 */
describe('environment files', () => {
  const keys = (env: object) => Object.keys(env).sort((a, b) => a.localeCompare(b));

  it('declare the same fields in prod as in the default file', () => {
    expect(keys(prod)).toEqual(keys(environment));
  });

  it('declare the same fields in staging as in the default file', () => {
    expect(keys(staging)).toEqual(keys(environment));
  });
});
