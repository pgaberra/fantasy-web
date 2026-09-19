import { NavigationExtras } from '@angular/router';

/**
 * The key under which "open this projection ready to be renamed" travels to the editor.
 *
 * <p>It rides in the navigation's state rather than in a query parameter for the reason
 * `pending-copy.ts` gives about the press on a shared projection: a URL must not be able to
 * assert it. `/projections/<id>?rename=1` pasted to somebody would open their editor mid-rename,
 * and a reload or a shared link would keep doing it. State is set by the code that navigated,
 * is not in the address bar, and the editor spends it on arrival.
 */
export const RENAME_ON_OPEN = 'renameOnOpen';

/** The extras that open the editor with its rename waiting, so the two callers cannot differ. */
export const renameOnOpenExtras: NavigationExtras = { state: { [RENAME_ON_OPEN]: true } };

/** Whether a navigation's state asked for the rename. Anything but `true` is a no. */
export function wantsRenameOnOpen(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as Record<string, unknown>)[RENAME_ON_OPEN] === true
  );
}
