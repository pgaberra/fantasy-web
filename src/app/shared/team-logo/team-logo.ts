import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { nhlTeamKey } from '../../models/nhl-team';

/** Where the NHL publishes each club's crest, under the club's own abbreviation. */
export const NHL_LOGO_BASE = 'https://assets.nhle.com/logos/nhl/svg/';

/** The NHL's crest for a club in any source's spelling, or nothing for no club at all. */
export function teamLogoUrl(team: string | null | undefined): string | undefined {
  const key = nhlTeamKey(team);
  return key ? `${NHL_LOGO_BASE}${key}_light.svg` : undefined;
}

/**
 * A club's crest: the NHL's own drawing, read from its CDN rather than copied here, with the
 * abbreviation in a badge where there is no crest to draw (no club, or a picture that failed to
 * load). Decorative unless told otherwise: where the abbreviation is written beside it, a screen
 * reader would read the club twice; where the crest stands alone, pass `alt`.
 */
@Component({
  selector: 'app-team-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (showImage()) {
      <img [src]="src()" [alt]="alt()" loading="lazy" decoding="async" (error)="failed.set(true)" />
    } @else {
      <span class="badge" [attr.aria-hidden]="alt() ? null : 'true'">{{ key() }}</span>
    }`,
  styleUrl: './team-logo.css',
})
export class TeamLogoComponent {
  readonly team = input<string | null | undefined>(undefined);
  /** What the crest stands for, where the club is not written beside it. */
  readonly alt = input<string>('');

  protected readonly key = computed(() => nhlTeamKey(this.team()) ?? '');
  protected readonly src = computed(() => teamLogoUrl(this.team()));

  // Resets when the club does: these are recycled down a long table, and a row whose crest once
  // failed must not keep showing a badge for the next club it draws.
  protected readonly failed = linkedSignal<string | undefined, boolean>({
    source: this.src,
    computation: () => false,
  });

  protected readonly showImage = computed(() => !!this.src() && !this.failed());
}
