import { Component, computed, inject, input } from '@angular/core';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';

@Component({
  selector: 'app-player-avatar',
  host: { '[class]': 'avatarClass()' },
  template: `@if (headshot(); as src) {
      <img [src]="src" alt="" loading="lazy" />
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
  readonly initials = computed(() => this.lookup.initials(this.playerId()));
  readonly avatarClass = computed(
    () =>
      `avatar pos--${this.lookup.primaryPosition(this.playerId())}` +
      (this.small() ? ' avatar-sm' : ''),
  );
}
