import { Directive } from '@angular/core';

/**
 * A field that takes a pasted cookie (ESPN's `espn_s2` and `SWID`): masked on screen, but a text
 * field, never `<input type="password">`, and marked as nothing a password manager should fill.
 *
 * A browser's password manager reads any `type="password"` input as a login form, whatever its
 * `autocomplete` says, and takes the text field just before it for the username. The ESPN form
 * was one: Chrome filled the saved SlapStat sign-in into it, the email into League ID and the
 * password into `espn_s2`, and syncing would have stored that password as an ESPN cookie. It
 * could also have offered to save the cookie over the SlapStat password. With no password field
 * on the form there is no login for it to find, so the manager has nothing to fill or save.
 *
 * The dots come from `-webkit-text-security`, which Chromium and Safari draw; a browser without it
 * shows the cookie as typed, which costs nothing but the look. The `data-*`
 * attributes are the opt-outs the third-party managers read (1Password, LastPass, Bitwarden,
 * Dashlane), since each finds login forms by its own heuristics.
 *
 * Only the sign-in, sign-up and reset pages (`auth/`) may use `type="password"`;
 * `.github/scripts/check-password-fields.sh` holds every other template to that.
 */
@Directive({
  selector: 'input[appCookieField]',
  host: {
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    style: '-webkit-text-security: disc',
    'data-1p-ignore': '',
    'data-lpignore': 'true',
    'data-bwignore': '',
    'data-form-type': 'other',
  },
})
export class CookieFieldDirective {}
