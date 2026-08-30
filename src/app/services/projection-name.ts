/**
 * A name no projection of the user's own is using yet: `My Projection`, or the first number
 * after it that is free.
 *
 * <p>Names are unique per user and kind, so a second projection saved under a name already
 * taken is rejected outright. Both places that name a projection for the user — the new
 * projection page and the list page, saving work carried over from the demo — pick from here so
 * that neither can suggest a name the server will refuse.
 */
export function freeProjectionName(takenNames: Iterable<string>): string {
  const taken = new Set(takenNames);
  if (!taken.has('My Projection')) {
    return 'My Projection';
  }
  let suffix = 2;
  while (taken.has(`My Projection ${suffix}`)) {
    suffix++;
  }
  return `My Projection ${suffix}`;
}
