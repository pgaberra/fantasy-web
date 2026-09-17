/**
 * The ways one player's name gets spelled differently from one list to the next.
 *
 * Two kinds of difference cover nearly every miss seen on real sheets. A first name has a short
 * form ("Tommy Novak" for Thomas, "Nick Paul" for Nicholas). And a Russian or Belarusian name
 * reaches English through more than one transliteration ("Yegor" and "Egor", "Dorofyev" and
 * "Dorofeyev", "Sergey" and "Sergei"). The first is a table, since a nickname cannot be derived
 * from the name it stands for. The second follows rules rather than a list of players, so a
 * prospect nobody has written down yet is covered as well; whatever the rules miss is left to a
 * close-spelling comparison, which the dialog shows for the user to confirm.
 */

/** Short and alternative first names, each to the one spelling both sides are compared in. */
const FIRST_NAME_FORMS: Record<string, readonly string[]> = {
  alexander: ['alex', 'alexandre', 'aleksander', 'alexandr', 'aleksandr', 'sasha'],
  andrew: ['andy', 'drew'],
  anthony: ['tony'],
  benjamin: ['ben', 'benny'],
  cameron: ['cam'],
  christopher: ['chris'],
  daniel: ['dan', 'danny'],
  jacob: ['jake'],
  jonathan: ['jon', 'jonny'],
  joseph: ['joe', 'joey'],
  joshua: ['josh'],
  matthew: ['matt', 'matty'],
  michael: ['mike', 'mikey'],
  mitchell: ['mitch'],
  nathan: ['nate'],
  nicholas: ['nick', 'nicky', 'nic', 'nicolas', 'nikolas'],
  patrick: ['pat'],
  robert: ['rob', 'robbie', 'bob', 'bobby'],
  samuel: ['sam', 'sammy'],
  thomas: ['tom', 'tommy'],
  timothy: ['tim'],
  william: ['will', 'willy', 'bill', 'billy'],
  zachary: ['zach', 'zack', 'zac'],
};

const CANONICAL_FIRST_NAME = new Map<string, string>();
for (const [canonical, forms] of Object.entries(FIRST_NAME_FORMS)) {
  CANONICAL_FIRST_NAME.set(canonical, canonical);
  for (const form of forms) {
    CANONICAL_FIRST_NAME.set(form, canonical);
  }
}

/**
 * One word of a name with the letters transliteration disagrees on folded together: "ks" and "x",
 * "kh" and "h", "y", "j" and "i" (Yegor, Iegor; Sergey, Sergei), an "e" written with or without
 * the "y" before it (Dorofyev, Dorofeyev), and doubled letters.
 */
function transliterationKey(word: string): string {
  return word
    .replace(/x/g, 'ks')
    .replace(/kh/g, 'h')
    .replace(/[yj]/g, 'i')
    .replace(/^ie/, 'e')
    .replace(/ei(?=[aeiou])/g, 'i')
    .replace(/ie/g, 'e')
    .replace(/(.)\1+/g, '$1');
}

/**
 * A normalised name (see `nameKey`) as the spelling-insensitive key two lists agree on: the first
 * name in its long form, then every word transliteration-folded.
 */
export function spellingKey(normalisedName: string): string {
  const words = normalisedName.split(' ');
  if (words.length > 1) {
    words[0] = CANONICAL_FIRST_NAME.get(words[0]) ?? words[0];
  }
  return words.map(transliterationKey).join(' ');
}

/**
 * How many single-letter edits (insert, delete, substitute, swap two neighbours) turn one string
 * into the other, giving up once it passes `limit`, since only near misses are of interest.
 */
export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) {
    return limit + 1;
  }
  let beforePrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMinimum = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, beforePrevious[j - 2] + 1);
      }
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > limit) {
      return limit + 1;
    }
    beforePrevious = previous;
    previous = current;
  }
  return previous[b.length];
}
