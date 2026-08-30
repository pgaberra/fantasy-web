import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';

@Component({
  selector: 'app-player-avatar',
  host: { '[class]': 'avatarClass()' },
  template: `@if (showImage()) {
      <img
        class="player-headshot"
        [src]="headshot()"
        alt=""
        loading="lazy"
        (error)="failed.set(true)"
      />
    } @else {
      {{ initials() }}
    }`,
  styleUrl: './player-avatar.css',
})
export class PlayerAvatarComponent {
  private readonly lookup = inject(DraftPlayerLookupService);

  readonly playerId = input.required<number>();
  readonly small = input<boolean>(false);

  readonly headshot = computed(() => this.lookup.headshot(this.playerId()));
  // A picture the platform serves can still fail to arrive; fall back to the initials rather
  // than the browser's broken-image icon. Resets when the picture does, since the avatars are
  // recycled as the board scrolls.
  protected readonly failed = linkedSignal<string | undefined, boolean>({
    source: this.headshot,
    computation: () => false,
  });
  protected readonly showImage = computed(() => !!this.headshot() && !this.failed());
  readonly initials = computed(() => this.lookup.initials(this.playerId()));
  readonly avatarClass = computed(
    () =>
      `avatar pos--${this.lookup.primaryPosition(this.playerId())}` +
      (this.small() ? ' avatar-sm' : ''),
  );
}
