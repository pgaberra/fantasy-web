import {
  Component,
  computed,
  ElementRef,
  input,
  linkedSignal,
  OnInit,
  inject,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DraftState } from '../../api/models/draft-state';
import { DraftTeam } from '../../api/models/draft-team';
import { DraftSettings } from '../../api/models/draft-settings';
import { RosterSlots } from '../../api/models/roster-slots';
import { ScoringStatKey } from '../../models/stat-key.model';
import { RosterSlotsEditorComponent } from '../../shared/roster-slots-editor/roster-slots-editor';
import { IconComponent } from '../../shared/icon/icon';
import { HelpTipComponent } from '../../shared/help-tip/help-tip';
import { NoticeComponent } from '../../shared/notice/notice';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';
import {
  draftSettingsOf,
  LeagueSettings,
  leagueSettingsFromDraft,
  withEspnImport,
  withYahooImport,
} from '../../shared/league-settings/league-settings';
import { FULL_SEASON_GAMES } from '../../draft-projection/projection-defaults';
import { LeagueSettingsControlsComponent } from '../../shared/league-settings-controls/league-settings-controls';
import { StatWeightsEditorComponent } from '../../shared/stat-weights-editor/stat-weights-editor';
import { ToggleSwitchComponent } from '../../draft-projection/projection-settings-section/toggle-switch/toggle-switch';
import { LeagueSyncComponent } from '../../draft-projection/projection-settings-section/league-sync/league-sync';
import { YahooSyncResult } from '../../draft-projection/projection-settings-section/yahoo-league-sync/yahoo-league-sync';
import { EspnSyncResult } from '../../draft-projection/projection-settings-section/espn-league-sync/espn-league-sync';
import { DraftSyncCheck, FollowedLeague } from '../league-draft-follow';
import { SyncWarningDialogComponent } from '../../draft-projection/sync-warning-dialog/sync-warning-dialog';
import { ProjectionSyncService } from '../../services/projection-sync.service';

interface SetupRow {
  id: string;
  name: string;
  mine: boolean;
}

export interface DraftSetupResult {
  draft: DraftState;
  /** The league the draft is ranked by, its size the number of teams set up. */
  league: DraftSettings;
  /** The name typed for a draft that does not exist yet; absent where the setup asked none. */
  name?: string;
  /**
   * Whether the draft follows its league's draft from here. The league then sets the teams and
   * the order, so `draft` is not what the board is made from.
   */
  follow: boolean;
}

const MIN_TEAMS = 2;
const MAX_TEAMS = 32;
const MINE_ID = 'team-me';

/**
 * A draft's settings: the league it is played in, how that league scores, and its size, the
 * user's own seat and the roster slots.
 *
 * <p>The league is one import, from Yahoo or ESPN, drawn in the settings themselves rather than
 * behind a button, and it sets the scoring. Where the league's
 * draft can be followed as well, the import switches on syncing picks, and once the league has
 * answered for its draft the teams, the seat and the roster are the league's: shown, not set.
 * Where it cannot (ESPN today, or a league that refused), or with the switch off, or with no
 * league at all, those three are set by hand.
 *
 * <p>The league is set here rather than on the page that picks what to draft against: it belongs
 * to the draft, not to the board it is played against, and here it stays within reach for as long
 * as the draft runs. Nothing is kept until the setup is confirmed, so Cancel leaves the draft as
 * it was. What Cancel leads to is the page's call: back to the board, or off the page where there
 * is no board to play yet.
 */
@Component({
  selector: 'app-draft-setup',
  imports: [
    RosterSlotsEditorComponent,
    IconComponent,
    HelpTipComponent,
    LoadingIndicatorComponent,
    NoticeComponent,
    LeagueSettingsControlsComponent,
    LeagueSyncComponent,
    StatWeightsEditorComponent,
    ToggleSwitchComponent,
    SyncWarningDialogComponent,
  ],
  templateUrl: './draft-setup.html',
  styleUrl: './draft-setup.css',
})
export class DraftSetupComponent implements OnInit {
  private readonly projectionSync = inject(ProjectionSyncService);

  readonly initial = input<DraftState | null>(null);
  /**
   * Whether the user's seat in `initial` is one somebody chose. False for a board whose order is
   * only the league's team list, taken before the league set its draft order: the seat is asked
   * for again, and there is no going back to a board that would be played on a guess.
   */
  readonly positionKnown = input<boolean>(true);
  readonly seedName = input<string>('My Team');
  /** The league the draft is ranked by as it stands: the draft's own, or what it starts from. */
  readonly league = input.required<DraftSettings>();
  /** The platforms whose drafts can be followed here. A league on any other is scored from only. */
  readonly syncPlatforms = input<readonly FollowedLeague['platform'][]>([]);
  /** Whether the board follows its league's draft as the settings open. */
  readonly following = input<boolean>(false);
  /** What the linked league answered when asked for its draft, which the page does the asking of. */
  readonly syncCheck = input<DraftSyncCheck>({ state: 'idle' });
  /** Whether a Yahoo connect started in the import has just come back, so it opens on Yahoo. */
  readonly openImport = input<boolean>(false);
  /**
   * The name a draft not saved yet will be created under, to be changed here. The setup covers
   * the page's heading, where a saved draft is renamed, so a new one is named in the setup. Null
   * for a saved draft.
   */
  readonly draftName = input<string | null>(null);
  /**
   * The league whose draft the board in `initial` is, pick for pick, or null. Its teams and its
   * order are the league's then, and changing either makes the board the user's own.
   */
  readonly boardSyncedFrom = input<FollowedLeague | null>(null);

  readonly confirmed = output<DraftSetupResult>();
  readonly cancelled = output<void>();
  /** Asks the page whether this league's draft can be followed; `syncCheck` is the answer. */
  readonly syncCheckRequested = output<FollowedLeague>();

  readonly rows = signal<SetupRow[]>([]);
  // Whether the seat below was actually named: by the user picking one, or by a saved setup that
  // already carries one. A fresh setup starts without, since nothing has told this page the seat,
  // and a draft built on the wrong seat is wrong all the way down.
  readonly draftPositionKnown = signal(false);
  // Whether the number of teams was actually named: by the user choosing it, by a league imported
  // here or before, or by a saved setup. A fresh setup with no league starts without, for the
  // seat's reason: a guessed league size ranks the whole board for a league that is not this one.
  readonly teamCountKnown = signal(false);
  // Set when Start is pressed with the teams or the seat not chosen: the button stays enabled so
  // the user learns what is missing from the field itself, instead of guessing at why a disabled
  // button won't go.
  readonly startAttempted = signal(false);
  // The league as edited here, kept apart from the draft's until the setup is confirmed. Its size
  // is not edited as a number: it is the teams below, and is read off them on the way out.
  readonly editableLeague = linkedSignal<LeagueSettings>(() =>
    leagueSettingsFromDraft(this.league()),
  );
  readonly scoresByPoints = computed(() => this.editableLeague().scoringType === 'points');

  /** The league the settings were imported from, which is the one a draft can follow. */
  readonly linked = computed<FollowedLeague | null>(() => {
    const { yahooSync, espnSync } = this.editableLeague();
    if (yahooSync) {
      return { platform: 'Yahoo', id: yahooSync.leagueKey, name: yahooSync.leagueName };
    }
    if (espnSync?.leagueId) {
      return {
        platform: 'ESPN',
        id: espnSync.leagueId,
        name: espnSync.leagueName ?? espnSync.leagueId,
      };
    }
    return null;
  });
  /** Whether the linked league's draft can be followed here, so the switch has something to do. */
  readonly syncOffered = computed(() => {
    const league = this.linked();
    return !!league && this.syncPlatforms().includes(league.platform);
  });
  // The switch as the user left it. A league that refused its draft shows it off without moving
  // it, so switching it on again asks the league once more.
  private readonly syncWanted = linkedSignal(() => this.following());
  readonly syncOn = computed(
    () => this.syncOffered() && this.syncWanted() && this.syncCheck().state !== 'failed',
  );
  readonly syncChecking = computed(() => this.syncOn() && this.syncCheck().state === 'checking');
  /** Why the league's draft cannot be followed, once it has said so. */
  readonly syncNotice = computed(() => {
    const check = this.syncCheck();
    return this.syncOffered() && check.state === 'failed' ? check.notice : null;
  });
  /**
   * The league's draft as it answered, while picks are synced from it: what the teams, the seat
   * and the roster are read from instead of set. Null until the league has answered, so nothing
   * is locked on a league nobody has heard from.
   */
  readonly leagueDraft = computed(() => {
    const check = this.syncCheck();
    return this.syncOn() && check.state === 'ok' ? check.league : null;
  });
  readonly locked = computed(() => this.leagueDraft() !== null);
  /** The user's seat in the league's draft, or null while the league has not set its order. */
  readonly leaguePosition = computed(() => {
    const league = this.leagueDraft();
    if (!league?.orderKnown) {
      return null;
    }
    const seat = league.teams.findIndex((team) => team.mine) + 1;
    return seat > 0 ? seat : null;
  });
  // The name as typed. The page's proposal can arrive after the setup opens (it is numbered once
  // the user's drafts are read), and it replaces the field only until the user has typed in it.
  private readonly nameTyped = signal(false);
  readonly nameValue = linkedSignal<string | null, string>({
    source: () => this.draftName(),
    computation: (proposed, previous) =>
      previous && untracked(this.nameTyped) ? previous.value : (proposed ?? ''),
  });

  /** The number of teams in the draft, or null while nobody has said. */
  readonly numTeams = computed(
    () => this.leagueDraft()?.teams.length ?? (this.teamCountKnown() ? this.rows().length : null),
  );
  /** The sizes on offer: none smaller than the user's team and the teams that have picked. */
  readonly teamCounts = computed(() => {
    const picked = new Set((this.initial()?.picks ?? []).map((pick) => pick.teamId));
    const kept = this.rows().filter((row) => row.mine || picked.has(row.id)).length;
    const smallest = Math.max(MIN_TEAMS, kept);
    return Array.from({ length: MAX_TEAMS - smallest + 1 }, (_, i) => smallest + i);
  });
  readonly canAdd = computed(() => this.rows().length < MAX_TEAMS);
  readonly canRemove = computed(() => this.rows().length > MIN_TEAMS);
  /** Whether this is a league's board whose draft order the league has not set yet. */
  readonly leagueOrderPending = computed(
    () => !this.locked() && this.initial() !== null && !this.positionKnown(),
  );
  /** The user's own seat in the draft order, from 1. The other teams fill the seats around it. */
  readonly myPosition = computed(() => this.rows().findIndex((row) => row.mine) + 1);
  readonly positions = computed(() =>
    Array.from({ length: this.numTeams() ?? 0 }, (_, i) => i + 1),
  );
  readonly canStart = computed(
    () => this.locked() || (this.teamCountKnown() && this.draftPositionKnown()),
  );
  readonly teamsMissing = computed(
    () => this.startAttempted() && !this.locked() && !this.teamCountKnown(),
  );
  // Asked for after the teams: the seats on offer are the teams', so there is none to choose yet.
  readonly positionMissing = computed(
    () =>
      this.startAttempted() &&
      !this.locked() &&
      this.teamCountKnown() &&
      !this.draftPositionKnown(),
  );

  /**
   * The league's settings as they were imported, and the number of teams they came with: the
   * baseline a change in these settings is measured against. Taken as the settings open and again
   * on every import, so a fresh import is never itself a change. Null while no league is linked.
   */
  private readonly syncBaseline = signal<{ signature: string; teams: number } | null>(null);
  /** The warning shown on Save when it would take the draft out of sync, naming the league. */
  readonly syncWarning = signal<FollowedLeague | null>(null);

  /**
   * Whether the scoring, the roster or the number of teams differ from what the linked league
   * set. Saved that way, the settings are no longer the league's, so the link goes with them, as
   * it does in the editor. The teams count only where they are the user's to set: a board locked
   * to its league takes the league's number whatever the rows say.
   */
  readonly settingsDiverged = computed(() => {
    const baseline = this.syncBaseline();
    if (!baseline || !this.linked()) {
      return false;
    }
    const teamsChanged = !this.locked() && this.rows().length !== baseline.teams;
    return teamsChanged || this.signature() !== baseline.signature;
  });
  /** Whether the teams or the user's seat differ from a board that is its league's draft. */
  readonly boardDiverged = computed(() => {
    const initial = this.initial();
    if (!initial || !this.boardSyncedFrom()) {
      return false;
    }
    const order = this.rows().map((row) => row.id);
    return order.length !== initial.order.length || order.some((id, i) => id !== initial.order[i]);
  });

  private signature(): string {
    // The size is left to the teams: it is read off them on the way out.
    return this.projectionSync.settingsSignature({ ...this.editableLeague(), leagueSize: 0 });
  }

  private takeSyncBaseline(): void {
    this.syncBaseline.set(
      this.linked() ? { signature: this.signature(), teams: this.rows().length } : null,
    );
  }

  private readonly teamsSelect = viewChild<ElementRef<HTMLSelectElement>>('teamsSelect');
  private readonly positionSelect = viewChild<ElementRef<HTMLSelectElement>>('positionSelect');

  ngOnInit(): void {
    const existing = this.initial();
    if (existing && existing.teams.length >= MIN_TEAMS) {
      this.rows.set(
        existing.order.map((id) => {
          const team = existing.teams.find((candidate) => candidate.id === id) ?? existing.teams[0];
          return { id: team.id, name: team.name, mine: team.mine };
        }),
      );
      this.draftPositionKnown.set(this.positionKnown());
      this.teamCountKnown.set(true);
      this.takeSyncBaseline();
      return;
    }
    this.rows.set([{ id: MINE_ID, name: this.seedName(), mine: true }]);
    // Only a league imported earlier has said how big it is; any other size here is a default.
    if (this.linked()) {
      this.setTeamCount(this.editableLeague().leagueSize);
    }
    this.takeSyncBaseline();
  }

  protected readonly FULL_SEASON_GAMES = FULL_SEASON_GAMES;

  onMinGoalieGamesInput(event: Event): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(parsed)) {
      const minGoalieGames = Math.min(FULL_SEASON_GAMES, Math.max(0, Math.round(parsed)));
      this.editableLeague.update((league) => ({ ...league, minGoalieGames }));
    }
  }

  /** A change from the league controls, which set how the league scores and never its size. */
  setLeague(next: LeagueSettings): void {
    this.editableLeague.set(next);
  }

  applyYahoo(result: YahooSyncResult): void {
    this.importLeague(withYahooImport(this.editableLeague(), result), result);
  }

  applyEspn(result: EspnSyncResult): void {
    this.importLeague(withEspnImport(this.editableLeague(), result), result);
  }

  /**
   * An import: the league's scoring, size and roster, and with them the league the draft can
   * follow. Where it can, syncing picks comes on with the import, since a league is imported into
   * a draft to draft in it; the league is asked for its draft before anything is locked to it.
   */
  private importLeague(next: LeagueSettings, result: YahooSyncResult | EspnSyncResult): void {
    this.setLeague(next);
    // A league that does not report its size leaves the teams as they were, chosen or not.
    const size = result.settings.leagueSize;
    if (size != null) {
      this.setTeamCount(size);
    }
    this.takeSyncBaseline();
    const name = result.leagueName?.trim();
    if (name && this.draftName() !== null && !this.nameTyped()) {
      this.nameValue.set(name);
    }
    this.syncWanted.set(this.syncOffered());
    this.requestSyncCheck();
  }

  toggleSync(): void {
    if (this.syncOn()) {
      this.syncWanted.set(false);
      return;
    }
    this.syncWanted.set(true);
    this.requestSyncCheck();
  }

  private requestSyncCheck(): void {
    const league = this.linked();
    if (league && this.syncOffered() && this.syncWanted()) {
      this.syncCheckRequested.emit(league);
    }
  }

  setStatWeights(statWeights: Record<ScoringStatKey, number>): void {
    this.editableLeague.update((league) => ({ ...league, statWeights }));
  }

  setRosterSlots(rosterSlots: RosterSlots): void {
    this.editableLeague.update((league) => ({ ...league, rosterSlots }));
  }

  onNameInput(event: Event): void {
    this.nameTyped.set(true);
    this.nameValue.set((event.target as HTMLInputElement).value);
  }

  onTeamsChange(event: Event): void {
    const chosen = (event.target as HTMLSelectElement).value;
    if (!chosen) {
      return;
    }
    // The seat is asked for next, and not as an error: nobody has tried to start without it yet.
    this.startAttempted.set(false);
    this.setTeamCount(Number(chosen));
  }

  /** Sets the number of teams, as chosen here or as a league reported it. */
  setTeamCount(count: number): void {
    this.resizeTo(count);
    this.teamCountKnown.set(true);
  }

  onPositionChange(event: Event): void {
    const chosen = (event.target as HTMLSelectElement).value;
    if (!chosen) {
      return;
    }
    this.setMyPosition(Number(chosen));
  }

  /** Moves the user's own team to the given seat; the other teams keep their order around it. */
  setMyPosition(position: number): void {
    this.draftPositionKnown.set(true);
    this.rows.update((rows) => {
      const mine = rows.find((row) => row.mine);
      if (!mine) {
        return rows;
      }
      const others = rows.filter((row) => !row.mine);
      const seat = Math.max(1, Math.min(position, rows.length));
      return [...others.slice(0, seat - 1), mine, ...others.slice(seat - 1)];
    });
  }

  addTeam(): void {
    if (!this.canAdd()) {
      return;
    }
    this.rows.update((rows) => [...rows, { id: crypto.randomUUID(), name: '', mine: false }]);
  }

  /** Drops the last team that is not the user's and has no picks; none such, and nothing goes. */
  removeTeam(): boolean {
    if (!this.canRemove()) {
      return false;
    }
    const picked = new Set((this.initial()?.picks ?? []).map((pick) => pick.teamId));
    const rows = this.rows();
    for (let index = rows.length - 1; index >= 0; index--) {
      if (!rows[index].mine && !picked.has(rows[index].id)) {
        this.rows.set(rows.filter((_, i) => i !== index));
        return true;
      }
    }
    return false;
  }

  /** Adds or drops teams toward `count`, as far as the bounds and the picks already made allow. */
  private resizeTo(count: number): void {
    const target = Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, count));
    while (this.rows().length < target) {
      this.addTeam();
    }
    while (this.rows().length > target && this.removeTeam()) {
      // Each pass drops one team.
    }
  }

  submit(): void {
    if (this.syncChecking() || this.bouncedIncomplete()) {
      return;
    }
    const settingsDiverged = this.settingsDiverged();
    if (settingsDiverged || this.boardDiverged()) {
      this.syncWarning.set(settingsDiverged ? this.linked() : this.boardSyncedFrom());
      return;
    }
    this.emitConfirmed();
  }

  /**
   * "Save it anyway." Settings that are no longer the league's lose the link to it, as a
   * projection's do; the league's id stays, so the next import starts from it. A board changed by
   * hand needs nothing more: it stops naming the league once it no longer matches its draft.
   */
  confirmSyncBreak(): void {
    this.syncWarning.set(null);
    if (this.settingsDiverged()) {
      this.editableLeague.update((league) => ({ ...league, yahooSync: null, espnSync: null }));
    }
    this.emitConfirmed();
  }

  cancelSyncBreak(): void {
    this.syncWarning.set(null);
  }

  /** Sends the user to what is missing, if anything is. True when something was. */
  private bouncedIncomplete(): boolean {
    if (this.canStart() && this.numTeams() !== null) {
      return false;
    }
    this.startAttempted.set(true);
    const missing = this.teamCountKnown() ? this.positionSelect() : this.teamsSelect();
    missing?.nativeElement.focus();
    return true;
  }

  private emitConfirmed(): void {
    // Asked again: a board that was locked to its league is the user's to set once the link goes.
    const numTeams = this.numTeams();
    if (this.bouncedIncomplete() || numTeams === null) {
      return;
    }
    const rows = this.rows();
    let unnamed = 0;
    const teams: DraftTeam[] = rows.map((row) => ({
      id: row.id,
      name: row.name.trim() || (row.mine ? 'My Team' : `Team ${++unnamed}`),
      mine: row.mine,
    }));
    const order = rows.map((row) => row.id);
    const proposed = this.draftName();
    this.confirmed.emit({
      draft: { teams, order, picks: this.initial()?.picks ?? [] },
      league: draftSettingsOf({ ...this.editableLeague(), leagueSize: numTeams }),
      // A cleared name keeps the proposal, as an unnamed team keeps "Team N".
      ...(proposed === null ? {} : { name: this.nameValue().trim() || proposed }),
      follow: this.locked(),
    });
  }
}
