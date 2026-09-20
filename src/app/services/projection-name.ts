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

/**
 * The name something would actually be saved under: the preferred one where nothing holds it,
 * and `"<preferred> (2)"`, `" (3)"` and so on where something does.
 *
 * <p>The server settles this for real — it is the only place that can, under a race — and this
 * is what lets a page say up front what the name will be. A draft is created under the name of
 * whatever it was started from, so without this the setup heading reads "AI Projection" while
 * the draft that comes out of it is called "AI Projection (2)".
 *
 * <p>Same shape as `UserProjectionService.freeNameFrom` in db-service, including the truncation:
 * a name is capped at 100 characters, and the suffix has to fit inside that.
 */
export function freeNameFrom(preferred: string, takenNames: Iterable<string>): string {
  const taken = new Set(takenNames);
  const capped =
    preferred.length > NAME_MAX_LENGTH ? preferred.slice(0, NAME_MAX_LENGTH) : preferred;
  if (!taken.has(capped)) {
    return capped;
  }
  for (let suffix = 2; suffix <= MAX_NAME_ATTEMPTS; suffix++) {
    const tail = ` (${suffix})`;
    const room = NAME_MAX_LENGTH - tail.length;
    const candidate = (capped.length > room ? capped.slice(0, room) : capped) + tail;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  return capped;
}

/** What the name column and every request DTO cap a name at. */
const NAME_MAX_LENGTH = 100;

/** How many numbered names to try before giving up and letting the server have the last word. */
const MAX_NAME_ATTEMPTS = 100;
