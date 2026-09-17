import { Component, computed, inject, model, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ScoringType } from '../../models/projection.model';
import { ScoringStatKey, UtilityStatKey } from '../../models/stat-key.model';
import { RosterSlots } from '../../api/models/roster-slots';
import {
  LeagueSettings,
  withEspnImport,
  withYahooImport,
} from '../../shared/league-settings/league-settings';
import { PopoverTriggerDirective } from '../../shared/popover/popover-trigger.directive';
import { IconComponent } from '../../shared/icon/icon';
import { LeagueImportButtonComponent } from '../../shared/league-import-button/league-import-button';
import { ColumnsMenuComponent } from '../../draft-projection/player-projections-table/columns-menu/columns-menu';
import { YahooConnectReturnService } from '../../services/yahoo-connect-return.service';
import { LeagueSettingsMenuComponent } from '../../draft-projection/player-projections-table/league-settings-menu/league-settings-menu';
import { LeagueSyncDialogComponent } from '../../draft-projection/league-sync-dialog/league-sync-dialog';
import { LeagueSyncComponent } from '../../draft-projection/projection-settings-section/league-sync/league-sync';
import { YahooSyncResult } from '../../draft-projection/projection-settings-section/yahoo-league-sync/yahoo-league-sync';
import { EspnSyncResult } from '../../draft-projection/projection-settings-section/espn-league-sync/espn-league-sync';

/**
 * The league a draft is ranked by, set before it starts: the editor's league toolbar, over the
 * draft picker's preview. Same controls in the same order — how the league scores, its size and
 * roster, which stats count, and the import that fills all of it in from Yahoo or ESPN. The
 * points weights are not here, for the same reason they are not in the editor's toolbar: they are
 * the preview's weight row, under the columns they weight.
 */
@Component({
  selector: 'app-draft-league-settings',
  imports: [
    PopoverTriggerDirective,
    IconComponent,
    LeagueImportButtonComponent,
    ColumnsMenuComponent,
    LeagueSettingsMenuComponent,
    LeagueSyncDialogComponent,
    LeagueSyncComponent,
  ],
  templateUrl: './draft-league-settings.html',
  styleUrl: './draft-league-settings.css',
})
export class DraftLeagueSettingsComponent {
  readonly settings = model.required<LeagueSettings>();

  /**
   * The import dialog, open from the start when this page is where a Yahoo connect started in it
   * comes back to: the consent reloads the page, and the dialog is where the user was left.
   */
  protected readonly backFromYahoo = inject(YahooConnectReturnService).returnedTo(
    inject(Router).url,
  );
  readonly showSyncDialog = signal(this.backFromYahoo);

  readonly syncedLeagueName = computed(
    () => this.settings().yahooSync?.leagueName ?? this.settings().espnSync?.leagueName ?? null,
  );

  /** A points league with nothing imported has nothing behind League setup — see the editor's. */
  readonly hasLeagueSetup = computed(
    () => this.settings().scoringType === 'category' || !!this.syncedLeagueName(),
  );

  selectScoringType(scoringType: ScoringType): void {
    this.patch({ scoringType });
  }

  setLeagueSize(leagueSize: number): void {
    this.patch({ leagueSize });
  }

  setRosterSlots(rosterSlots: RosterSlots): void {
    this.patch({ rosterSlots });
  }

  setMinGoalieGames(minGoalieGames: number): void {
    this.patch({ minGoalieGames });
  }

  toggleScoringColumn(statKey: ScoringStatKey): void {
    this.patch({ activeScoringColumns: toggled(this.settings().activeScoringColumns, statKey) });
  }

  toggleUtilityColumn(statKey: UtilityStatKey): void {
    const columns = toggled<UtilityStatKey>(this.settings().activeUtilityColumns, statKey);
    this.patch({ activeUtilityColumns: columns });
  }

  applyYahoo(result: YahooSyncResult): void {
    this.settings.update((settings) => withYahooImport(settings, result));
    this.closeSyncDialogUnlessThereIsMoreToSay(result.settings.unsupportedStats);
  }

  applyEspn(result: EspnSyncResult): void {
    this.settings.update((settings) => withEspnImport(settings, result));
    this.closeSyncDialogUnlessThereIsMoreToSay(result.settings.unsupportedStats);
  }

  /**
   * As in the editor: a clean import is finished the moment it lands, and one that could not map
   * every stat keeps the dialog open, since that list is the only place the user is told.
   */
  private closeSyncDialogUnlessThereIsMoreToSay(unsupportedStats: string[]): void {
    if (!unsupportedStats.length) {
      this.showSyncDialog.set(false);
    }
  }

  private patch(change: Partial<LeagueSettings>): void {
    this.settings.update((settings) => ({ ...settings, ...change }));
  }
}

function toggled<T>(members: ReadonlySet<T>, member: T): Set<T> {
  const next = new Set(members);
  if (!next.delete(member)) {
    next.add(member);
  }
  return next;
}
