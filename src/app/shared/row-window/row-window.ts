import {
  afterEveryRender,
  afterNextRender,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Signal,
  signal,
} from '@angular/core';

/** A row's height before one has been measured: a compact row with a headshot. */
const ESTIMATED_ROW_PX = 45;

/**
 * Rows drawn beyond each edge of the screen, so a scroll uncovers rows that are already there.
 * Kept small: a jump past it redraws the whole window, and at 4x CPU throttle 20 rows a side
 * made a fast scroll hitch for up to 160 ms where 10 kept it near 100.
 */
const OVERSCAN_ROWS = 10;

/**
 * The window's edges move in steps of this many rows. It keeps a slow scroll from redrawing on
 * every event, and it is even, so the drawn rows keep the stripes `:nth-child(even)` gives them.
 */
const EDGE_STEP_ROWS = 10;

/** Rows drawn before anything has been measured — the top of the list, about a screen and more. */
const INITIAL_ROWS = 60;

export interface RowWindow<T> {
  /** The rows to draw, a slice of the whole list. */
  readonly rows: Signal<readonly T[]>;
  /** Index in the whole list of the first drawn row. */
  readonly start: Signal<number>;
  /** Height in px standing in for the rows above the slice. */
  readonly before: Signal<number>;
  /** Height in px standing in for the rows below it. */
  readonly after: Signal<number>;
}

/**
 * Draws only the rows of a long, page-scrolled table that are on or near the screen.
 *
 * A table is laid out whole: every row added to it makes the browser measure all of them again,
 * so 1600 rows of a dozen or more cells held the page still for 1.5 s on a laptop and some 9 s on
 * a phone-speed CPU, and adding them a batch at a time only paid that bill once per batch. Kept to
 * the rows in view, the table is the same size whatever the list is.
 *
 * The rows scrolled past are stood in for by two spacers, one above the drawn rows and one below,
 * each its own `<tbody>` so the drawn rows keep their stripes. The table keeps its full height, so
 * the page's scrollbar, the pinned header and the sideways scroll bar all see the table they
 * always did. The window is read off the drawn rows' own `<tbody>` (`body`) against the window's
 * viewport, since these tables scroll the page, not a box of their own.
 *
 * Columns size to the rows that are drawn, and names differ in length, so each header cell keeps
 * the widest it has been as a floor: a column may widen once when a longer name scrolls in, but
 * does not jump back and forth as rows come and go. Must be called in an injection context.
 */
export function rowWindow<T>(
  list: Signal<readonly T[]>,
  body: Signal<ElementRef<HTMLElement> | undefined>,
): RowWindow<T> {
  const destroyRef = inject(DestroyRef);
  const rowHeight = signal(ESTIMATED_ROW_PX);
  const range = signal({ start: 0, end: INITIAL_ROWS });

  const start = computed(() => Math.min(range().start, list().length));
  const end = computed(() => Math.min(Math.max(range().end, start()), list().length));
  const rows = computed(() => list().slice(start(), end()));
  const before = computed(() => start() * rowHeight());
  const after = computed(() => (list().length - end()) * rowHeight());

  const place = (): void => {
    const element = body()?.nativeElement;
    if (!element) {
      return;
    }
    // Where row 0 would sit: the drawn rows' top, less the spacer standing in above them.
    const top = element.getBoundingClientRect().top - before();
    const height = rowHeight();
    const first = Math.floor(-top / height) - OVERSCAN_ROWS;
    const last = Math.ceil((window.innerHeight - top) / height) + OVERSCAN_ROWS;
    const next = {
      start: Math.max(Math.floor(first / EDGE_STEP_ROWS) * EDGE_STEP_ROWS, 0),
      end: Math.max(Math.ceil(last / EDGE_STEP_ROWS) * EDGE_STEP_ROWS, 0),
    };
    const current = range();
    if (next.start !== current.start || next.end !== current.end) {
      range.set(next);
    }
  };

  let frame = 0;
  const schedule = (): void => {
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        place();
      });
    }
  };

  let floorCells: readonly HTMLTableCellElement[] = [];
  let floors: number[] = [];
  afterEveryRender({
    // Reads only: how tall the drawn rows are, and how wide each column came out.
    earlyRead: () => {
      const element = body()?.nativeElement;
      const drawn = element?.children.length ?? 0;
      const measured = drawn ? element!.getBoundingClientRect().height / drawn : 0;
      const cells = element?.closest('table')?.tHead?.rows[0]?.cells;
      const widths = cells ? Array.from(cells, (cell) => cell.getBoundingClientRect().width) : [];
      return { measured, cells, widths };
    },
    write: ({ measured, cells, widths }) => {
      if (cells) {
        // Other header cells than last time: a column was added, dropped or swapped, and the old
        // floors belong to columns that are gone.
        const current = Array.from(cells);
        if (current.length !== floorCells.length || current.some((c, i) => c !== floorCells[i])) {
          floorCells.forEach((cell) => (cell.style.minWidth = ''));
          floorCells = current;
          floors = current.map(() => 0);
        }
        widths.forEach((width, index) => {
          if (width > floors[index] + 0.5) {
            floors[index] = width;
            current[index].style.minWidth = `${width}px`;
          }
        });
      }
      // jsdom lays nothing out; a zero is no measurement.
      if (measured > 0 && Math.abs(measured - rowHeight()) > 0.5) {
        rowHeight.set(measured);
      }
      // The list may have grown or shrunk under the window (a step, a filter), or the rows turned
      // out another height than assumed: either can leave the window short of the screen.
      schedule();
    },
  });

  afterNextRender(() => {
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    destroyRef.onDestroy(() => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    });
  });

  return { rows, start, before, after };
}
