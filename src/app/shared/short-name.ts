/**
 * "Connor McDavid" as "C. McDavid": the first name cut to its initial, the rest kept as it is.
 * The player tables show it on a phone only, where the name column is too narrow for most full
 * names. Only the first word is shortened, so a surname of several words ("Trevor van Riemsdyk")
 * survives whole.
 *
 * Null when there is nothing to shorten: a single word, or a first name that is already initials
 * ("J.T. Miller").
 */
export function shortName(name: string): string | null {
  const trimmed = name.trim();
  const space = trimmed.indexOf(' ');
  if (space <= 0) {
    return null;
  }
  const first = trimmed.slice(0, space);
  const rest = trimmed.slice(space + 1).trim();
  if (!rest || first.includes('.')) {
    return null;
  }
  return `${first[0]}. ${rest}`;
}

/**
 * The short form of every name in a list, keyed by the full name, leaving out any short form two
 * different names would share: "Jordan Staal" and "Jared Staal" would both be "J. Staal", so both
 * keep their full names rather than one reader's guess standing for either. Two players with the
 * very same name share a short form as they already share the full one, which says no less.
 */
export function shortNames(names: Iterable<string>): Map<string, string> {
  const fullNamesByShort = new Map<string, Set<string>>();
  for (const name of names) {
    const short = shortName(name);
    if (short) {
      const fullNames = fullNamesByShort.get(short) ?? new Set<string>();
      fullNames.add(name);
      fullNamesByShort.set(short, fullNames);
    }
  }
  const result = new Map<string, string>();
  for (const [short, fullNames] of fullNamesByShort) {
    if (fullNames.size === 1) {
      result.set([...fullNames][0], short);
    }
  }
  return result;
}
