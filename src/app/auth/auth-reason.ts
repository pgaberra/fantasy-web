/**
 * Why a visitor is standing at the account form when they did not come looking for it.
 *
 * <p>Pressing a button that needs an account now takes them straight to the form rather than
 * explaining first, which is the shorter route but also a silent one: a form that appears on a
 * click reads as the site changing the subject unless it says what the click was for. The reason
 * rides beside `returnUrl` as a query parameter and becomes that line.
 *
 * <p>Only the register form uses it. Someone who turns out to have an account already follows its
 * footer to the sign-in form, where the standing welcome is the right greeting and a line about
 * needing an account would be wrong.
 *
 * <p>An unrecognised value is ignored rather than shown. It arrives on a URL anyone can edit, so
 * this is the one place that decides what the form may say.
 */
export const SHARED_BOARD = 'shared-board';

const SUBTITLES: Readonly<Record<string, string>> = {
  [SHARED_BOARD]: 'You need an account to save a copy of this projection.',
};

export function subtitleForReason(reason: string | null | undefined): string | undefined {
  return reason ? SUBTITLES[reason] : undefined;
}
