import { Component, signal } from '@angular/core';

/**
 * Where to find the espn_s2 and SWID cookies, behind a link that opens it. Shared by every form
 * that asks for them, so the steps are written once.
 */
@Component({
  selector: 'app-espn-cookie-help',
  template: `
    <button type="button" class="espn-help-toggle" (click)="toggle()">
      {{ open() ? 'Hide' : 'How do I find these?' }}
    </button>
    @if (open()) {
      <ol class="espn-help">
        <li>
          Sign in at
          <a href="https://fantasy.espn.com" target="_blank" rel="noopener noreferrer"
            >fantasy.espn.com</a
          >
          in your browser.
        </li>
        <li>
          Open your browser developer tools (F12), then go to Application (or Storage) → Cookies →
          fantasy.espn.com.
        </li>
        <li>
          Copy the <code>espn_s2</code> and <code>SWID</code> values, including SWID's braces, and
          paste them above.
        </li>
      </ol>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .espn-help-toggle {
      align-self: flex-start;
      padding: 0;
      border: none;
      background: none;
      font-size: var(--text-xs);
      color: var(--color-primary);
      text-decoration: underline;
      cursor: pointer;
    }

    .espn-help {
      margin: 0;
      padding-left: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: var(--text-xs);
      color: var(--color-text-muted);
    }

    .espn-help code {
      font-size: var(--text-xs);
    }

    .espn-help a {
      color: var(--color-primary);
    }
  `,
})
export class EspnCookieHelpComponent {
  readonly open = signal(false);

  toggle(): void {
    this.open.update((open) => !open);
  }
}
