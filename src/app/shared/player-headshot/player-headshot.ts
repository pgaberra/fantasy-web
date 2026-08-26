import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';

/**
 * A player's picture, or their initials when there isn't one.
 *
 * Two things make the fallback necessary rather than decorative: the platform has no portrait
 * for roughly one player in seven, and an image that is served can still fail to arrive. Both
 * used to render as the browser's broken-image icon.
 */
@Component({
  selector: 'app-player-headshot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (showImage()) {
      <img [src]="src()" [alt]="name()" loading="lazy" (error)="failed.set(true)" />
    } @else {
      <span aria-hidden="true">{{ initials() }}</span>
    }`,
  styleUrl: './player-headshot.css',
})
export class PlayerHeadshotComponent {
  readonly src = input<string | undefined>(undefined);
  readonly name = input<string>('');

  // Resets when the picture does: these components are recycled down a long table, and a row
  // that once failed must not keep showing initials for the next player it draws.
  protected readonly failed = linkedSignal<string | undefined, boolean>({
    source: this.src,
    computation: () => false,
  });

  protected readonly showImage = computed(() => !!this.src() && !this.failed());

  protected readonly initials = computed(() =>
    this.name()
      .split(/\s+/)
      .filter((part) => part.length > 0)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase(),
  );
}
