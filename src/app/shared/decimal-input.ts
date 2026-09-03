/**
 * The fields that hold a decimal number are plain text fields, not `<input type="number">`.
 *
 * Chromium writes and reads a number input in the machine's own locale and ignores the document's
 * `lang`, so on a Swedish computer a stat weight of 4.5 shows as `4,5` while the table right
 * beside it prints `4.5`. The app writes a decimal point everywhere, and a text field is the only
 * field whose text is ours to write. Typing a comma still works, because a keyboard may well put
 * it under the thumb.
 *
 * The cost of leaving `type="number"` behind is that the browser no longer parses the field or
 * steps it with the arrow keys, so both live here.
 */

/** What the field holds, with a typed comma read as the decimal point it stands in for. */
export function parseDecimalInput(raw: string): number {
  const text = raw.trim().replace(',', '.');
  const value = Number(text);
  // An empty or half-typed field reads as zero, which is what a number input reported for it.
  return text === '' || !Number.isFinite(value) ? 0 : value;
}

/** How many decimals a step of this size can land on: 0.01 steps to two, 1 steps to none. */
function decimalsIn(step: number): number {
  const [, fraction = ''] = step.toString().split('.');
  return fraction.length;
}

/**
 * The value an arrow key steps the field to, or null for any other key. Up and down move by the
 * smallest amount the field can show, the way they did while the browser owned the stepping.
 */
export function steppedDecimalInput(raw: string, key: string, step: number): number | null {
  if (key !== 'ArrowUp' && key !== 'ArrowDown') {
    return null;
  }
  const stepped = parseDecimalInput(raw) + (key === 'ArrowUp' ? step : -step);
  // Rounded back to the step's own precision: 4.5 + 0.01 is 4.510000000000001 in binary floating
  // point, and the field would print every digit of it.
  return Number(stepped.toFixed(decimalsIn(step)));
}
