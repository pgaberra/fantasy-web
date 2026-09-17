import { Component, inject, input, output } from '@angular/core';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';
import { PlayerAvatarComponent } from '../player-avatar/player-avatar';
import { PlayerPositionChipsComponent } from '../player-position-chips/player-position-chips';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import { IconComponent } from '../../shared/icon/icon';

export interface DraftPickEntry {
  overall: number;
  teamName: string;
  mine: boolean;
  playerId: number;
}

export interface DraftPickRound {
  round: number;
  picks: DraftPickEntry[];
}

@Component({
  selector: 'app-draft-picks-panel',
  imports: [PlayerAvatarComponent, PlayerPositionChipsComponent, TooltipDirective, IconComponent],
  templateUrl: './draft-picks-panel.html',
  styleUrl: './draft-picks-panel.css',
})
export class DraftPicksPanelComponent {
  readonly lookup = inject(DraftPlayerLookupService);

  readonly pickRounds = input.required<DraftPickRound[]>();
  readonly editingPick = input.required<number | null>();
  readonly picksCount = input.required<number>();
  readonly startEdit = output<number>();
  readonly requestRemove = output<number>();
}
