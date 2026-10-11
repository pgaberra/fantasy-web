import { InjectionToken, Signal, signal } from '@angular/core';

/**
 * How many free agents a page of the planner's list holds, and how that choice is remembered.
 *
 * <p>A phone shows fewer to a page than a desktop, since a row there is taller and the screen
 * shorter, and the reader's own choice is kept for each apart: someone who drops the desktop list
 * to 10 still sees 10 there next time, and the phone keeps its own number. Unlike the categories
 * picked (`planner-focus.ts`), this is not a question of the week, so it is kept until changed.
 */
export const PAGE_SIZES = [10, 25, 50, 100] as const;

export type PlannerLayout = 'phone' | 'desktop';

/** The page each layout opens on until the reader picks another. */
export const DEFAULT_PAGE_SIZE: Readonly<Record<PlannerLayout, number>> = {
  phone: 10,
  desktop: 25,
};

/** Where the planner lays out as a phone: its own narrowest breakpoint. */
const PHONE_QUERY = '(max-width: 640px)';

const STORAGE_KEY = 'slapstat.streamerPlanner.pageSize';

/** Phone or desktop, following the window as it is resized or turned. */
export const PLANNER_LAYOUT = new InjectionToken<Signal<PlannerLayout>>('PLANNER_LAYOUT', {
  providedIn: 'root',
  factory: () => {
    const query = typeof window !== 'undefined' ? window.matchMedia?.(PHONE_QUERY) : undefined;
    const layout = signal<PlannerLayout>(query?.matches ? 'phone' : 'desktop');
    query?.addEventListener('change', (event) => layout.set(event.matches ? 'phone' : 'desktop'));
    return layout.asReadonly();
  },
});

/** The page size picked for a layout, or that layout's default if none was. */
export function readPageSize(layout: PlannerLayout): number {
  const stored = readAll()[layout];
  return isPageSize(stored) ? stored : DEFAULT_PAGE_SIZE[layout];
}

/** The page size picked for a layout. The other layout's choice is left as it was. */
export function writePageSize(layout: PlannerLayout, size: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [layout]: size }));
  } catch {
    // A private window, or storage the browser refuses: the choice still holds for this visit.
  }
}

export function isPageSize(value: unknown): value is number {
  return (PAGE_SIZES as readonly unknown[]).includes(value);
}

function readAll(): Partial<Record<PlannerLayout, unknown>> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}
