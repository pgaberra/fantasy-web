export type SkaterPosition = 'LW' | 'C' | 'RW' | 'D';

/** Every position a skater can be eligible for, in the order the app lists them. */
export const SKATER_POSITIONS: readonly SkaterPosition[] = ['C', 'LW', 'RW', 'D'];

/** Whether the positions picked are exactly the four skater ones: the "All skaters" shortcut. */
export function isAllSkaters(selected: readonly string[]): boolean {
  return (
    selected.length === SKATER_POSITIONS.length &&
    SKATER_POSITIONS.every((position) => selected.includes(position))
  );
}
