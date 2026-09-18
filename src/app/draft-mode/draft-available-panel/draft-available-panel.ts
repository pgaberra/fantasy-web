import { Component, inject, input, output } from '@angular/core';
import {
  PositionFilter,
  Projection,
  ScoredProjection,
  ScoringType,
} from '../../models/projection.model';
import { GOALIE_STAT_KEYS, ScoringStatKey, SKATER_STAT_KEYS } from '../../models/stat-key.model';
import { StatInfoService } from '../../services/stat-info.service';
import { StatLabelPipe } from '../../pipes/stat-label.pipe';
import { StatTooltipPipe } from '../../pipes/stat-tooltip.pipe';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';
import { TierBadge, TierService } from '../../services/tier.service';
import { TierStripEntry } from '../draft-mode';
import { PlayerAvatarComponent } from '../player-avatar/player-avatar';
import { PlayerPositionChipsComponent } from '../player-position-chips/player-position-chips';

export interface EditingPickInfo {
  overall: number;
  teamName: string;
  mine: boolean;
}

@Component({
  selector: 'app-draft-available-panel',
  imports: [
    StatLabelPipe,
    StatTooltipPipe,
    TooltipDirective,
    PlayerAvatarComponent,
    PlayerPositionChipsComponent,
  ],
  templateUrl: './draft-available-panel.html',
  styleUrl: './draft-available-panel.css',
})
export class DraftAvailablePanelComponent {
  readonly lookup = inject(DraftPlayerLookupService);
  private readonly statInfoService = inject(StatInfoService);
  private readonly tierService = inject(TierService);

  readonly editingInfo = input.required<EditingPickInfo | null>();
  readonly searchTerm = input.required<string>();
  readonly positionFilters = input.required<{ value: PositionFilter; label: string }[]>();
  readonly selectedPositions = input.required<readonly PositionFilter[]>();
  readonly showStats = input.required<boolean>();
  readonly pageSizeOptions = input.required<{ label: string; value: number }[]>();
  readonly pageSize = input.required<number>();
  readonly scoreHeading = input.required<string>();
  readonly visibleAvailable = input.required<ScoredProjection[]>();
  /** Each player's place on the whole board, drafted players counted; see DraftModeComponent. */
  readonly boardRanks = input<ReadonlyMap<number, number>>(new Map());
  readonly availableCount = input.required<number>();
  readonly hasMore = input.required<boolean>();
  readonly isMyPick = input.required<boolean>();
  readonly isComplete = input.required<boolean>();
  readonly locked = input<boolean>(false);
  /** "Draft", or "Draft for <team>" when the pick is another team's. Cut on the button, whole in its tooltip. */
  readonly draftLabel = input.required<string>();
  readonly scoringType = input.required<ScoringType>();
  readonly statColumns = input.required<ScoringStatKey[]>();
  /** Tier chip per player, empty while the tier feature is off. */
  readonly tierBadges = input<ReadonlyMap<number, TierBadge>>(new Map());
  /** The best tier still available per position. Empty while the tier feature is off. */
  readonly tierStrip = input<readonly TierStripEntry[]>([]);

  readonly searchChange = output<string>();
  readonly positionFilterToggle = output<PositionFilter>();
  readonly statsToggle = output<boolean>();
  readonly pageSizeChange = output<number>();
  readonly showMore = output<void>();
  readonly draft = output<number>();
  readonly replace = output<number>();
  readonly cancelEdit = output<void>();

  isPositionSelected(filter: PositionFilter): boolean {
    return this.selectedPositions().includes(filter);
  }

  onSearchInput(event: Event): void {
    this.searchChange.emit((event.target as HTMLInputElement).value);
  }

  onStatsToggle(event: Event): void {
    this.statsToggle.emit((event.target as HTMLInputElement).checked);
  }

  onPageSizeChange(event: Event): void {
    this.pageSizeChange.emit(Number((event.target as HTMLSelectElement).value));
  }

  scoreLabel(scoredProjection: ScoredProjection): string {
    return this.scoringType() === 'points'
      ? scoredProjection.score.fantasyPoints.toFixed(1)
      : scoredProjection.score.zScore.toFixed(2);
  }

  tierStripTooltip(entry: TierStripEntry): string {
    const group = this.tierService.peerGroup(entry.position, entry.remaining);
    const left = `${entry.remaining} ${group} left in tier ${entry.tier}.`;
    return entry.needed ? left : `${left} Your roster has no open slot for one.`;
  }

  statStrip(projection: Projection): { key: ScoringStatKey; value: string }[] {
    const stats = { ...projection.stats.utility, ...projection.stats.scoring } as Record<
      string,
      number
    >;
    const applicable = projection.type === 'skater' ? SKATER_STAT_KEYS : GOALIE_STAT_KEYS;
    return this.statColumns()
      .filter((key) => (applicable as readonly string[]).includes(key))
      .map((key) => {
        const decimals = this.statInfoService.isRateStat(key) ? 2 : 0;
        return { key, value: (stats[key] ?? 0).toFixed(decimals) };
      });
  }
}
