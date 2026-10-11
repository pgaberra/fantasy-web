import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { rxResource } from '@angular/core/rxjs-interop';
import { PlayerService } from '../services/player.service';
import { Player } from '../models/player.model';

/**
 * The player pool the landing page ranks, read once and shared by the lineup card in the hero and
 * the editor below it. Each of them is a ranking of every player, so each wants the whole pool;
 * loading it twice for one page would double the page's one real request.
 *
 * Only in the browser: prerendered at build time, the page would bake a player table that goes
 * stale with the next sync, or an error for the API it was refused. Prerendered, the pool stays
 * empty and never loading, and both consumers draw their waiting state.
 */
@Injectable({ providedIn: 'root' })
export class LandingPlayersService {
  private readonly playerService = inject(PlayerService);
  private readonly inBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly players = rxResource({
    params: () => (this.inBrowser ? true : undefined),
    stream: () => this.playerService.getPlayers(),
    defaultValue: [] as Player[],
  });

  reload(): void {
    this.players.reload();
  }
}
