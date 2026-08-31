/**
 * A name nothing the user keeps is using yet: `My Projection`, or the first number after it that
 * is free.
 *
 * <p>Names are unique per user across everything they name — their own projections and the
 * boards they imported, which are listed together and read by name — so a second one saved under
 * a name already taken is rejected outright. Both places that name a projection for the user —
 * the new projection page and the list page, saving work carried over from the demo — pick from
 * here so that neither can suggest a name the server will refuse. Feed it every board the user
 * can open, not only their own: an imported one takes a name just as surely.
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
