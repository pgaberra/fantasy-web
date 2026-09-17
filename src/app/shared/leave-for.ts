/**
 * Sends the browser to another site, and calls `onReturn` if the visitor comes back with Back.
 *
 * A button that leaves for Stripe or Yahoo shows a busy state while it waits for the URL, and the
 * page is still in that state when the browser leaves. Back does not reload it: the browser
 * restores the page from its back/forward cache exactly as it was, so the button came back
 * disabled and saying "Opening…" for good. The restore fires `pageshow` with `persisted` set, and
 * that is where `onReturn` puts the page right. A page that is reloaded instead starts fresh and
 * needs nothing.
 */
export function leaveFor(url: string, onReturn: () => void, win: Window = window): void {
  const restored = (event: PageTransitionEvent): void => {
    if (!event.persisted) {
      return;
    }
    win.removeEventListener('pageshow', restored);
    onReturn();
  };
  win.addEventListener('pageshow', restored);
  win.location.href = url;
}
