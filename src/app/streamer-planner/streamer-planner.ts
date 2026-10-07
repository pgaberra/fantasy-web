import {
  Component,
  computed,
  ElementRef,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import { environment } from '../../environments/environment';
import { Api } from '../api/api';
import { streamerPlannerMyTeam } from '../api/fn/streamer-planner/streamer-planner-my-team';
import { streamerPlannerTeams } from '../api/fn/streamer-planner/streamer-planner-teams';
import { streamerPlannerWeeks } from '../api/fn/streamer-planner/streamer-planner-weeks';
import { PlannerWeek } from '../api/models/planner-week';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_SCORING_COLUMNS,
  DEFAULT_STAT_WEIGHTS,
} from '../draft-projection/projection-defaults';
import { Projection, ScoredProjection } from '../models/projection.model';
import { ScoringStatKey } from '../models/stat-key.model';
import { EspnService } from '../services/espn.service';
import { FeatureService } from '../services/feature.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { StreamerPlannerFreeAgentsService } from '../services/streamer-planner-free-agents.service';
import { ChosenLeague, LeagueChoiceService } from '../services/league-choice.service';
import { YahooService } from '../services/yahoo.service';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { HelpTipComponent } from '../shared/help-tip/help-tip';
import { IconComponent } from '../shared/icon/icon';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { isAllSkaters } from '../models/position.model';
import { Platform } from '../shared/platform-tabs/platform-tabs';
import { YahooLeaguePicker } from '../shared/yahoo-league-picker';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import { FreeAgentsTableComponent } from './free-agents-table/free-agents-table';
import { LeagueFieldComponent } from './league-field/league-field';
import {
  categoryColumn,
  dropFactor,
  filterByPositions,
  LineColumn,
  nightsFactor,
  FREE_AGENT_POSITIONS,
  PLANNER_POSITIONS,
  FreeAgentPosition,
  FreeAgentSort,
  FreeAgentSortKey,
  isRankedOrder,
  nextSort,
  projectedStarts,
  RANKED_ORDER,
  RankedFreeAgent,
  roomFactor,
  scaledProjection,
  sortFreeAgents,
  startsProjection,
  teamsByKey,
  TOP_OPTIONS,
  WEEK_DECIMALS,
} from './planner-free-agents';
import { focusableCategories, readFocus, scoresIn, writeFocus } from './planner-focus';
import {
  DropRoom,
  dropRooms,
  dropRoomTip,
  fitsDrop,
  LineupPosition,
  NightRoom,
  nightRooms,
  roomLabel,
  roomRuns,
} from './planner-lineup';
import {
  isPageSize,
  PAGE_SIZES,
  PLANNER_LAYOUT,
  readPageSize,
  writePageSize,
} from './planner-page-size';
import {
  addDays,
  clampStretch,
  dayName,
  earliestStart,
  formatDay,
  isIsoDate,
  latestEnd,
  leadingDays,
  PLANNER_PRESETS,
  PLANNER_TODAY,
  PlannerDay,
  plannerDays,
  PlannerPreset,
  presetStretch,
  rateTeams,
  sameStretch,
  Stretch,
  weekdayName,
  weekOf,
  weeksTitle,
} from './planner-schedule';
import { TeamSchedulesComponent } from './team-schedules/team-schedules';

export type { Stretch } from './planner-schedule';

/** A day before the stretch: its date, and its games once they have been asked for. */
export interface LeadingDay {
  readonly date: string;
  readonly games?: number;
}

/** The two tables, shown one at a time. */
export type PlannerView = 'free-agents' | 'schedules';

function keepOffered(
  picked: ReadonlySet<ScoringStatKey>,
  offered: readonly LineColumn[],
): ReadonlySet<ScoringStatKey> {
  const keys = new Set(offered.map((option) => option.key));
  return new Set([...picked].filter((key) => keys.has(key)));
}

function toggled(picked: ReadonlySet<ScoringStatKey>, key: ScoringStatKey): Set<ScoringStatKey> {
  const next = new Set(picked);
  if (!next.delete(key)) {
    next.add(key);
  }
  return next;
}

function pickedLabel(options: readonly LineColumn[], picked: ReadonlySet<ScoringStatKey>): string {
  return options
    .filter((option) => picked.has(option.key))
    .map((option) => option.label)
    .join(', ');
}

/** A preset with the stretch it names today, for the reader to pick by name. */
export interface PresetOption {
  readonly key: PlannerPreset;
  readonly label: string;
  readonly stretch: Stretch;
}

/**
 * The streamer planner: every NHL team ranked by how good its schedule is over the nights ahead,
 * and the best players a league has available for them.
 *
 * <p>The nights are the page's one setting. They are picked by name (the rest of this week, next
 * week, both) or by two dates, and any night among them can be left out; the teams and the free
 * agents follow at once, with no button, as on Team Power Rankings. A night already played is not
 * offered: a stretch starts no earlier than today. The league, which the free agents are read from,
 * sits beside the nights, picked the way Team Power Rankings picks one: Yahoo / ESPN tabs, the
 * account's Yahoo leagues under the one and ESPN's card under the other, opening on the league
 * last chosen anywhere ({@link LeagueChoiceService}).
 *
 * <p>The free agents and the team schedules are shown one at a time, each the page's full width,
 * behind a switch that opens on the free agents.
 *
 * <p>The schedules are rated once, for the whole page. The free agents are one list, skaters and
 * goalies together, best first by the league's scoring: with the table the page's full width
 * there is room for both kinds' categories side by side, each row blank under the other kind's.
 * What concerns one table only (which positions, which categories to rank by) sits on that table.
 *
 * <p>The server rates the whole stretch; a night the reader leaves out is taken out here, by the
 * server's own rule (`planner-schedule.ts`), and a skater's line is scaled to the share of his
 * club's games that fall on the nights kept; a goalie's is his line over the starts his crease's
 * split of those nights gives him (`planner-free-agents.ts`). The ranking of the
 * free agents happens here too, by the league's own scoring settings through the same engine a
 * projection uses, because "best" only means anything against what the league pays for.
 */
@Component({
  selector: 'app-streamer-planner',
  imports: [
    ErrorStateComponent,
    FreeAgentsTableComponent,
    HelpTipComponent,
    IconComponent,
    LeagueFieldComponent,
    LoadingIndicatorComponent,
    TeamSchedulesComponent,
    TooltipDirective,
  ],
  providers: [YahooLeaguePicker],
  templateUrl: './streamer-planner.html',
  styleUrl: './streamer-planner.css',
})
export class StreamerPlannerComponent {
  private readonly api = inject(Api);
  private readonly freeAgentsService = inject(StreamerPlannerFreeAgentsService);
  private readonly picker = inject(YahooLeaguePicker);
  private readonly ranking = inject(ProjectionRankingService);
  private readonly yahoo = inject(YahooService);
  private readonly espn = inject(EspnService);
  private readonly features = inject(FeatureService);
  /** Read once, when the page opens: the nights are counted from this day. */
  private readonly today = inject(PLANNER_TODAY)();
  /** Phone or desktop: each keeps its own page size. */
  private readonly layout = inject(PLANNER_LAYOUT);

  constructor() {
    // At once rather than with the league field, which waits for the schedule: the remembered
    // league's free agents are asked for alongside it.
    this.picker.start();
  }

  // --- The nights -------------------------------------------------------------------------------

  private readonly weeksResource = rxResource({
    stream: () => from(this.api.invoke(streamerPlannerWeeks)),
  });

  readonly weeks = computed<readonly PlannerWeek[]>(() =>
    this.weeksResource.hasValue() ? this.weeksResource.value().weeks : [],
  );

  /** The stretch the reader asked for, or null for the rest of this week. */
  private readonly chosen = signal<Stretch | null>(null);

  readonly stretch = computed<Stretch | undefined>(() => {
    const weeks = this.weeks();
    const wanted = this.chosen() ?? presetStretch('this-week', weeks, this.today);
    return wanted ? clampStretch(wanted, weeks, this.today) : undefined;
  });

  /** The presets the season still has a stretch for. */
  readonly presets = computed<readonly PresetOption[]>(() =>
    PLANNER_PRESETS.flatMap((preset) => {
      const stretch = presetStretch(preset.key, this.weeks(), this.today);
      return stretch ? [{ ...preset, stretch }] : [];
    }),
  );

  /** The preset the stretch on screen is, if it is one. */
  readonly activePreset = computed<PlannerPreset | null>(
    () => this.presets().find((preset) => sameStretch(preset.stretch, this.stretch()))?.key ?? null,
  );

  readonly earliestStart = computed(() => earliestStart(this.weeks(), this.today));
  readonly latestEnd = computed(() => latestEnd(this.weeks(), this.stretch()?.start ?? this.today));
  readonly seasonEnd = computed(() => this.weeks()[this.weeks().length - 1]?.end ?? '');

  applyPreset(key: PlannerPreset): void {
    const preset = this.presets().find((candidate) => candidate.key === key);
    if (preset) {
      this.chosen.set(preset.stretch);
    }
  }

  /** The first night, typed or picked; the last follows it if it has to. */
  setStart(event: Event): void {
    const input = event.target as HTMLInputElement;
    const stretch = this.stretch();
    if (isIsoDate(input.value) && stretch) {
      this.chosen.set({ start: input.value, end: stretch.end });
    }
    // Written back, since a clamped date leaves the box showing what was typed.
    input.value = this.stretch()?.start ?? '';
  }

  setEnd(event: Event): void {
    const input = event.target as HTMLInputElement;
    const stretch = this.stretch();
    if (isIsoDate(input.value) && stretch) {
      this.chosen.set({ start: stretch.start, end: input.value });
    }
    input.value = this.stretch()?.end ?? '';
  }

  // --- The teams and the nights -----------------------------------------------------------------

  private readonly teamsResource = rxResource({
    params: () => this.stretch(),
    stream: ({ params }) => from(this.api.invoke(streamerPlannerTeams, params)),
  });

  readonly strength = computed(() =>
    this.teamsResource.hasValue() ? this.teamsResource.value() : undefined,
  );

  /** Every date of the stretch, in order, including one without a game. */
  readonly days = computed<readonly PlannerDay[]>(() => {
    const strength = this.strength();
    return strength ? plannerDays(strength) : [];
  });

  /** The nights the reader has left out. A new stretch starts with every night counted. */
  private readonly excluded = linkedSignal<Stretch | undefined, ReadonlySet<string>>({
    source: this.stretch,
    computation: () => new Set<string>(),
  });

  /** The nights with games that are counted. */
  readonly counted = computed<ReadonlySet<string>>(() => {
    const excluded = this.excluded();
    return new Set(
      this.days()
        .filter((day) => day.games > 0 && !excluded.has(day.date))
        .map((day) => day.date),
    );
  });

  readonly everyNightCounted = computed(() => this.excluded().size === 0);

  readonly nightsWithGames = computed(() => this.days().filter((day) => day.games > 0).length);

  isCounted(day: PlannerDay): boolean {
    return !this.excluded().has(day.date);
  }

  toggleDay(day: PlannerDay): void {
    this.excluded.update((excluded) => {
      const next = new Set(excluded);
      if (next.has(day.date)) {
        next.delete(day.date);
      } else {
        next.add(day.date);
      }
      return next;
    });
  }

  /** The teams over the nights counted, best first. */
  readonly teamRows = computed(() =>
    rateTeams(this.strength()?.teams ?? [], this.counted(), this.everyNightCounted()),
  );

  readonly offNightMaxGames = computed(() => this.strength()?.offNightMaxGames);
  readonly noSchedule = computed(() => this.weeksResource.hasValue() && this.weeks().length === 0);

  readonly loadingSchedule = computed(
    () => this.weeksResource.isLoading() || this.teamsResource.isLoading(),
  );
  readonly loadFailure = computed(() => this.weeksResource.error() ?? this.teamsResource.error());

  retry(): void {
    if (this.weeksResource.error()) {
      this.weeksResource.reload();
    }
    if (this.teamsResource.error()) {
      this.teamsResource.reload();
    }
  }

  // --- The league and its free agents -----------------------------------------------------------

  /** Whether ESPN leagues are offered at all: where Team Power Rankings offers them. */
  private readonly espnOffered = environment.espnLeaguesEnabled;
  private readonly remembered = inject(LeagueChoiceService).league();

  /** Which platform's league the free agents come from: last time's, else Yahoo. */
  readonly platform = signal<Platform>(
    this.espnOffered && this.remembered?.platform === 'ESPN' ? 'espn' : 'yahoo',
  );

  /** The ESPN league ESPN last accepted for the card, kept while the reader looks at Yahoo's. */
  readonly espnLeague = signal<ChosenLeague | null>(
    this.espnOffered && this.remembered?.platform === 'ESPN' ? this.remembered : null,
  );

  /**
   * The league the free agents are read from: the tab's. Equal by platform and id alone, so the
   * name arriving with the Yahoo list does not read the league a second time.
   */
  readonly league = computed<ChosenLeague | null>(
    () => {
      if (this.platform() === 'espn') {
        return this.espnLeague();
      }
      const key = this.picker.selectedKey();
      return key
        ? { platform: 'YAHOO', leagueId: key, name: this.picker.selectedLeague()?.name ?? key }
        : null;
    },
    { equal: (a, b) => a?.platform === b?.platform && a?.leagueId === b?.leagueId },
  );

  /**
   * The table on screen. The free agents are what the page is for, so it always opens on them,
   * with no league picked too, where their card asks for one. Once the reader picks a table it
   * stays, whatever happens to the league.
   */
  readonly view = signal<PlannerView>('free-agents');

  setView(view: PlannerView): void {
    this.view.set(view);
  }

  readonly positionOptions = FREE_AGENT_POSITIONS;

  /** The positions the free agents are narrowed to. None is every position, as the page opens. */
  readonly positions = signal<ReadonlySet<FreeAgentPosition>>(new Set());

  /** One more position, or one fewer: any number can be on at once. */
  togglePosition(position: FreeAgentPosition): void {
    this.positions.update((positions) => {
      const next = new Set(positions);
      if (next.has(position)) {
        next.delete(position);
      } else {
        next.add(position);
      }
      return next;
    });
  }

  clearPositions(): void {
    this.positions.set(new Set());
  }

  /** Every skater position picked, and nothing else: what the "All skaters" shortcut shows. */
  readonly allSkaters = computed(() => isAllSkaters([...this.positions()]));

  /** Picks the four skater positions at once; pressed again, goes back to everyone. */
  toggleAllSkaters(): void {
    this.positions.set(this.allSkaters() ? new Set() : new Set(PLANNER_POSITIONS));
  }

  private readonly settingsResource = rxResource({
    params: () => this.league() ?? undefined,
    stream: ({ params }) =>
      params.platform === 'YAHOO'
        ? this.yahoo.leagueProjectionSettings(params.leagueId)
        : this.espn.leagueProjectionSettings(params.leagueId),
  });

  private readonly freeAgentsResource = rxResource({
    params: () => {
      const league = this.league();
      const stretch = this.stretch();
      return league && stretch ? { league, ...stretch } : undefined;
    },
    stream: ({ params }) =>
      this.freeAgentsService.freeAgents(
        params.league.platform,
        params.league.leagueId,
        params.start,
        params.end,
      ),
  });

  readonly loadingFreeAgents = computed(
    () =>
      this.freeAgentsResource.isLoading() ||
      this.settingsResource.isLoading() ||
      // The ranking follows the user's own team when there is one: held until it is in, so the
      // list is not drawn on every night and then redrawn on his.
      this.myTeamResource.isLoading(),
  );
  readonly freeAgentsFailure = computed(
    () => this.freeAgentsResource.error() ?? this.settingsResource.error(),
  );

  /** The league's own scoring, or the app's defaults until its settings land. */
  private readonly scoring = computed(() => {
    const settings = this.settingsResource.hasValue() ? this.settingsResource.value() : null;
    return {
      scoringType: settings?.scoringType ?? 'points',
      statWeights: {
        ...DEFAULT_STAT_WEIGHTS,
        ...((settings?.statWeights ?? {}) as Record<ScoringStatKey, number>),
      },
      // The columns the league actually scores, as its own settings report them. Falling back to
      // the app's defaults would price categories this league does not play.
      activeScoringColumns: new Set(
        (settings?.activeScoringColumns as ScoringStatKey[] | undefined) ?? DEFAULT_SCORING_COLUMNS,
      ),
    };
  });

  readonly scoringType = computed(() => this.scoring().scoringType);

  /** The categories the league scores, in the order its settings list them. */
  readonly categories = computed<readonly ScoringStatKey[]>(() => [
    ...this.scoring().activeScoringColumns,
  ]);

  private readonly teamsByKey = computed(() => teamsByKey(this.strength()?.teams ?? []));

  // --- The user's own team ----------------------------------------------------------------------

  /**
   * The user's own team in the league, where this environment reads it. The nights it has room on
   * follow from it, the league's lineup slots and the club schedules already on the page.
   */
  private readonly myTeamResource = rxResource({
    params: () => {
      const league = this.features.streamerPlannerMyTeam() ? this.league() : null;
      // The roster as it stands: no stretch, so no lines, which nothing on the page reads.
      return league ? { league } : undefined;
    },
    stream: ({ params }) =>
      from(
        this.api.invoke(streamerPlannerMyTeam, {
          platform: params.league.platform,
          leagueId: params.league.leagueId,
        }),
      ),
  });

  private readonly myTeam = computed(() =>
    this.myTeamResource.hasValue() ? this.myTeamResource.value() : undefined,
  );

  /**
   * What the page can say about the user's own team: nothing where it is not read, and otherwise
   * whether it is still coming, failed, is not in this league, or is in hand.
   */
  readonly myTeamStatus = computed<'off' | 'loading' | 'error' | 'not-found' | 'ready'>(() => {
    if (!this.features.streamerPlannerMyTeam() || !this.league()) {
      return 'off';
    }
    if (this.myTeamResource.error()) {
      return 'error';
    }
    if (this.myTeamResource.isLoading() || this.settingsResource.isLoading()) {
      return 'loading';
    }
    return this.myTeam()?.found ? 'ready' : 'not-found';
  });

  /** Each game day's room in the user's lineup, or null while there is no team to place. */
  readonly rooms = computed<ReadonlyMap<string, NightRoom> | null>(() => {
    const team = this.myTeam();
    const settings = this.settingsResource.hasValue() ? this.settingsResource.value() : null;
    if (this.myTeamStatus() !== 'ready' || !team || !settings?.rosterSlots) {
      return null;
    }
    const dates = this.days()
      .filter((day) => day.games > 0)
      .map((day) => day.date);
    return nightRooms(team.players, settings.rosterSlots, this.teamsByKey(), dates);
  });

  /** Whether the free agents are scored only on the nights the user's lineup has room for them. */
  readonly fitMyTeam = signal(true);

  toggleFitMyTeam(): void {
    this.fitMyTeam.update((fit) => !fit);
  }

  /** The rooms the ranking follows: none when the reader asks for every counted night. */
  private readonly rankingRooms = computed(() => (this.fitMyTeam() ? this.rooms() : null));

  /**
   * Whether the games only a drop makes room for are counted too: every free agent given the
   * games he would play if the user dropped a player for him, and ranked on them. Off, they are
   * marked beside his games and what they would add is marked beside each number, since such a
   * night adds no game to the team. On, the list is ranked as if the reader will drop someone,
   * the same assumption for everyone, so no row moves on its own.
   */
  readonly countDrops = signal(false);

  toggleCountDrops(): void {
    this.countDrops.update((count) => !count);
  }

  /** Counted, and only while the ranking follows the room: without it there is nothing to open. */
  readonly dropsCounted = computed(() => this.fitMyTeam() && this.countDrops());

  room(day: PlannerDay): NightRoom | undefined {
    return day.games > 0 ? this.rooms()?.get(day.date) : undefined;
  }

  roomLabel(room: NightRoom): string {
    return roomLabel(room);
  }

  retryMyTeam(): void {
    this.myTeamResource.reload();
  }

  /** The league, as the remembered focus and drops are filed under. */
  private readonly leagueKey = computed(() => {
    const league = this.league();
    return league ? `${league.platform}:${league.leagueId}` : null;
  });

  // --- What a drop would open ----------------------------------------------------------------

  /**
   * Each game day's positions open only once one of the user's players is gone, for each kind of
   * player he could drop: the seat a drop frees, and what moving his dual-position teammates about
   * lets it take. Told apart from the night's own room, since it holds only with that drop.
   */
  private readonly dropRoomsByDate = computed<ReadonlyMap<string, DropRoom> | null>(() => {
    const rooms = this.rooms();
    const team = this.myTeam();
    const settings = this.settingsResource.hasValue() ? this.settingsResource.value() : null;
    if (!rooms || !team || !settings?.rosterSlots) {
      return null;
    }
    return dropRooms(team.players, settings.rosterSlots, this.teamsByKey(), rooms);
  });

  /** What a drop would open on a game day; nothing where no drop opens anything. */
  dropRoom(day: PlannerDay): DropRoom | undefined {
    return day.games > 0 ? this.dropRoomsByDate()?.get(day.date) : undefined;
  }

  /**
   * The day's open positions as its cell shows them: in lineup order, each run green when the
   * lineup has room as it stands and yellow when only a drop opens it. A run is drawn one chip a
   * position, so a long run wraps chip by chip in a narrow cell instead of leaving half a pill
   * empty after a line break. Only a yellow run has a tip, saying who has to go to open it, and
   * the label names the run's spots for a screen reader; a green one says all it needs to.
   */
  roomRuns(day: PlannerDay): {
    drop: boolean;
    positions: readonly LineupPosition[];
    label: string;
    tip: string | null;
  }[] {
    const room = this.room(day);
    const opened = this.dropRoom(day);
    return roomRuns(room, opened).map((run) => ({
      drop: run.drop,
      positions: run.positions,
      label: run.positions.join(', '),
      tip: run.drop ? dropRoomTip(opened!, run.positions) : null,
    }));
  }

  /** Whether any day on screen has room as the lineup stands, so the line under them says what green means. */
  readonly hasOpenRoom = computed(() =>
    this.days().some((day) => (this.room(day)?.fits.size ?? 0) > 0),
  );

  /** Whether any day on screen has room only through a drop, so the line under them says what yellow means. */
  readonly hasDropRoom = computed(() =>
    this.days().some((day) => this.dropRoom(day) !== undefined),
  );

  // --- The categories the list is ranked by ----------------------------------------------------

  /**
   * The categories a streamer can rank the list by: a category league's own, skaters' and goalies'
   * alike, or only one kind's while the positions picked show only that kind. A points league has
   * none, since a point is worth the same whichever category it came from.
   */
  readonly focusOptions = computed<readonly LineColumn[]>(() =>
    this.scoringType() === 'category'
      ? focusableCategories(this.categories(), this.positions()).map(categoryColumn)
      : [],
  );

  /** The categories picked, as remembered for the league until this week is over. */
  private readonly focusPicked = linkedSignal<string | null, ReadonlySet<ScoringStatKey>>({
    source: this.leagueKey,
    computation: (league) => new Set(league ? readFocus(league, this.today) : []),
  });

  /**
   * The categories the list is ranked by. None is the league's whole set, which is how the page
   * opens. A category not offered, because the league no longer scores it or the positions picked
   * show nobody who does, is dropped rather than ranked by; picking the positions back brings it
   * back.
   */
  readonly focus = computed(() => keepOffered(this.focusPicked(), this.focusOptions()));

  toggleFocus(key: ScoringStatKey): void {
    this.setFocus(toggled(this.focus(), key));
  }

  clearFocus(): void {
    this.setFocus(new Set());
  }

  private setFocus(focus: ReadonlySet<ScoringStatKey>): void {
    this.focusPicked.set(focus);
    const league = this.leagueKey();
    const week = weekOf(this.weeks(), this.today);
    // Without the season's weeks there is no end to hold it to: it holds for this visit only.
    if (league && week) {
      writeFocus(league, focus, week.end, this.today);
    }
  }

  /** "PPP, SOG": the categories picked, as the score's tip and the cards name them. */
  readonly focusLabel = computed(() => pickedLabel(this.focusOptions(), this.focus()));

  /**
   * Every available player with a projection, best first by the league's scoring. With categories
   * picked, only the kinds that score in them, ranked by those alone: a goalie has nothing to give
   * in a skater category, nor a skater in a goalie one.
   */
  private rankedBy(focus: ReadonlySet<ScoringStatKey>): RankedFreeAgent[] {
    const week = this.freeAgentsResource.hasValue() ? this.freeAgentsResource.value() : null;
    if (!week) {
      return [];
    }
    const scoring = this.scoring();
    const teams = this.teamsByKey();
    const counted = this.counted();
    const everyNightCounted = this.everyNightCounted();
    const rooms = this.rankingRooms();
    // A goalie starts only on a night the lineup has a G seat for him, and every goalie fits the
    // same nights, so the crease is split over those alone.
    const goalieNights = rooms
      ? new Set([...counted].filter((date) => rooms.get(date)?.fits.has('G')))
      : counted;
    const starts = projectedStarts(week.creases, goalieNights, everyNightCounted && !rooms);
    // What a drop would add, shown beside the games and never scored: each would replace the
    // dropped player's game. A goalie's are the starts the crease gives him once the nights only a
    // drop opens a G seat on are counted too, less those he has already.
    const dropped = rooms ? this.dropRoomsByDate() : null;
    const counting = dropped !== null && this.countDrops();
    const dropStarts = dropped
      ? projectedStarts(
          week.creases,
          new Set(
            [...counted].filter(
              (date) =>
                goalieNights.has(date) || fitsDrop(['G'], rooms!.get(date), dropped.get(date)),
            ),
          ),
          false,
        )
      : null;
    const games = new Map<string, number>();
    const dropGames = new Map<string, number>();
    const lines = new Map<string, Projection>();
    // His line with the drop's games played too, for the one who asks what they would give him.
    const liftedLines = new Map<string, Projection>();
    const byPlayerId = new Map(week.players.map((player) => [player.projection.playerId, player]));
    const players = week.players.filter((player) => scoresIn(player.projection.type, focus));
    const projections = players.map((player) => {
      const factor = rooms
        ? roomFactor(player, teams, counted, rooms)
        : nightsFactor(player, teams, counted, everyNightCounted);
      let played = player.expectedGames * factor;
      let line = scaledProjection(player.projection, factor);
      let more = dropped
        ? player.expectedGames * dropFactor(player, teams, counted, rooms!, dropped)
        : 0;
      if (player.projection.type === 'goalie') {
        // A game is one goalie's, so a goalie's are whole: the crease's split of the nights, or
        // for one in no crease his own expectation, rounded.
        played = starts.get(player.playerId) ?? Math.round(played);
        line = startsProjection(player.projection, player.expectedGames, played);
        more = Math.max(
          0,
          (dropStarts?.get(player.playerId) ?? Math.round(played + more)) - played,
        );
      }
      if (dropped) {
        dropGames.set(player.playerId, more);
        if (more > 0) {
          const lifted =
            player.projection.type === 'goalie'
              ? startsProjection(player.projection, player.expectedGames, played + more)
              : scaledProjection(player.projection, (played + more) / player.expectedGames);
          // Counted, the lifted line is his line: there is nothing left for a drop to add.
          if (counting) {
            played += more;
            line = lifted;
          } else {
            liftedLines.set(player.playerId, lifted);
          }
        }
      }
      games.set(player.playerId, played);
      lines.set(player.playerId, line);
      return line;
    });
    const input = {
      scoringType: scoring.scoringType,
      statWeights: scoring.statWeights,
      activeScoringColumns: focus.size > 0 ? new Set(focus) : scoring.activeScoringColumns,
      leagueSize: DEFAULT_LEAGUE_SIZE,
      rosterSlots: DEFAULT_ROSTER_SLOTS,
      // A goalie streamed for a week has nothing like a season's starts behind him, and the
      // minimum is there to keep a backup off a season table. Applied here it would disqualify
      // every goalie on the page.
      minGoalieGames: 0,
      decimalSettings: WEEK_DECIMALS,
    };
    const scored = this.ranking.rankOverall({ ...input, projections });
    const scoreOf = (entry: ScoredProjection) =>
      scoring.scoringType === 'points' ? entry.score.fantasyPoints : entry.score.zScore;
    // Each lifted line scored in place of its own, the rest of the list as it stands: what the
    // games would add to his score as the list reads it. In a points league a line's score is
    // its own whoever else is listed, so one run scores them all; in a category league a z-score
    // is read against the pool, and scored all together, each lifted line shifted it for the
    // others, so a player given one game more read as losing a point while everyone else was
    // given two. A run a player keeps the pool his own, a line of three hundred apart.
    const liftedScores = new Map<number, number>();
    const liftedRuns =
      scoring.scoringType === 'points'
        ? [[...liftedLines.keys()]]
        : [...liftedLines.keys()].map((id) => [id]);
    for (const ids of liftedRuns) {
      if (ids.length === 0) {
        continue;
      }
      const swapped = new Set(ids);
      const lifted = this.ranking.rankOverall({
        ...input,
        projections: players.map((player) =>
          swapped.has(player.playerId)
            ? liftedLines.get(player.playerId)!
            : lines.get(player.playerId)!,
        ),
      });
      for (const entry of lifted) {
        const owner = byPlayerId.get(entry.projection.playerId);
        if (owner && swapped.has(owner.playerId)) {
          liftedScores.set(entry.projection.playerId, scoreOf(entry));
        }
      }
    }
    const ranked: RankedFreeAgent[] = [];
    for (const [index, entry] of scored.entries()) {
      const player = byPlayerId.get(entry.projection.playerId);
      if (player) {
        const liftedLine = liftedLines.get(player.playerId);
        ranked.push({
          player,
          line: lines.get(player.playerId) ?? player.projection,
          score: scoreOf(entry),
          rank: index + 1,
          games: games.get(player.playerId) ?? player.expectedGames,
          dropGames: dropGames.get(player.playerId),
          lifted: liftedLine
            ? { line: liftedLine, score: liftedScores.get(entry.projection.playerId) ?? 0 }
            : undefined,
        });
      }
    }
    return ranked;
  }

  /** The best pickups, by the categories picked: what the list reads. */
  readonly ranked = computed(() => this.rankedBy(this.focus()));

  /**
   * The list on screen: skaters and goalies together, narrowed to the positions picked. Each keeps
   * his place in the whole list, so one narrowed to a position still says how it compares.
   */
  readonly filtered = computed(() => filterByPositions(this.ranked(), this.positions()));

  // --- The order of the list --------------------------------------------------------------------

  /** The column the list was last sorted by; it opens ranked, best first by the score. */
  private readonly sortPicked = signal<FreeAgentSort>(RANKED_ORDER);

  /**
   * The order on screen: the one picked, while its column is still in the table. A category the
   * league picked next does not score falls back to the ranked order rather than sorting by blanks.
   */
  readonly sort = computed(() => {
    const sort = this.sortPicked();
    const about = ['name', 'score', 'perGame', 'games', 'toi'];
    return about.includes(sort.key) || this.categories().includes(sort.key as ScoringStatKey)
      ? sort
      : RANKED_ORDER;
  });

  /** Sorts the whole list by a column, best first; the same column again turns it round. */
  sortBy(key: FreeAgentSortKey): void {
    this.sortPicked.set(nextSort(this.sort(), key));
  }

  /** The list in the order asked for, before it is cut into pages. */
  readonly sorted = computed(() => sortFreeAgents(this.filtered(), this.sort()));

  /** Why the list on screen has nobody in it, though the league has players available. */
  readonly emptyText = computed(() =>
    this.positions().size > 0
      ? 'No available player at these positions has a projection.'
      : 'No available player has a projection in these categories.',
  );

  // --- The pages of the list --------------------------------------------------------------------

  readonly pageSizes = PAGE_SIZES;

  /** Players to a page: the reader's choice for this layout, or its default. */
  readonly pageSize = linkedSignal(() => readPageSize(this.layout()));

  /**
   * The page asked for, counted from 0. Other positions, other categories or another order are
   * another list, so it opens on its first page again.
   */
  private readonly page = linkedSignal<unknown, number>({
    source: () => [this.positions(), this.focus(), this.sort()],
    computation: () => 0,
  });

  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.filtered().length / this.pageSize())),
  );

  /** The page on screen: the one asked for, or the last one if the list has since grown shorter. */
  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount() - 1));

  private readonly firstShown = computed(() => this.currentPage() * this.pageSize());

  readonly visible = computed(() =>
    this.sorted().slice(this.firstShown(), this.firstShown() + this.pageSize()),
  );

  /**
   * How many places are set off as the best picks: the best few of everyone available, by the rank
   * each row shows, so a list narrowed to some positions sets off only the ones among them. Sorted
   * by another column, the head of the list is the most blocks or the alphabet, not the best picks,
   * so nothing is set off.
   */
  readonly topRows = computed(() => (isRankedOrder(this.sort()) ? TOP_OPTIONS : 0));

  /** "26–50 of 212": the places on screen, of the whole list. */
  readonly rangeText = computed(() => {
    const total = this.filtered().length;
    const first = this.firstShown() + 1;
    const last = this.firstShown() + this.visible().length;
    return first === last ? `${first} of ${total}` : `${first}–${last} of ${total}`;
  });

  /** The table's top, brought back into view when a page is turned from below it. */
  private readonly listTop = viewChild('listTop', { read: ElementRef });

  goToPage(page: number): void {
    const target = Math.max(0, Math.min(page, this.pageCount() - 1));
    if (target === this.currentPage()) {
      return;
    }
    this.page.set(target);
    const top = this.listTop()?.nativeElement as HTMLElement | undefined;
    if (top && top.getBoundingClientRect().top < 0) {
      top.scrollIntoView?.({ block: 'start' });
    }
  }

  /**
   * Another page size, kept for this layout until changed. The list turns to the page holding the
   * first player that was on screen, so the reader does not lose their place.
   */
  setPageSize(event: Event): void {
    const size = Number((event.target as HTMLSelectElement).value);
    if (!isPageSize(size)) {
      return;
    }
    const first = this.firstShown();
    this.pageSize.set(size);
    this.page.set(Math.floor(first / size));
    writePageSize(this.layout(), size);
  }

  readonly noFreeAgents = computed(
    () =>
      !!this.league() &&
      !this.loadingFreeAgents() &&
      !this.freeAgentsFailure() &&
      this.freeAgentsResource.hasValue() &&
      this.freeAgentsResource.value().players.length === 0,
  );

  retryFreeAgents(): void {
    if (this.settingsResource.error()) {
      this.settingsResource.reload();
    }
    if (this.freeAgentsResource.error()) {
      this.freeAgentsResource.reload();
    }
  }

  // --- Words for the page -----------------------------------------------------------------------

  /** "Week 3", or "Weeks 3-5". */
  readonly weeksTitle = computed(() => {
    const stretch = this.stretch();
    return stretch ? weeksTitle(this.weeks(), stretch) : '';
  });

  /** "6 of 7 days selected": the days counted, of the days with games. */
  readonly nightsTitle = computed(() => {
    const nights = this.nightsWithGames();
    return nights === 0 ? 'No games' : `${this.counted().size} of ${nights} days selected`;
  });

  dayName(day: PlannerDay): string {
    return dayName(day);
  }

  /** "Oct" and "12" apart, so a phone's narrower cell can show the number alone. */
  dayMonth(day: PlannerDay): string {
    return formatDay(day.date).split(' ')[0];
  }

  dayOfMonth(day: PlannerDay): string {
    return formatDay(day.date).split(' ')[1];
  }

  /** The dates of the week before the stretch starts, asked for only to say how many games they held. */
  private readonly leadingStretch = computed<Stretch | undefined>(() => {
    const start = this.stretch()?.start;
    const dates = start ? leadingDays(start) : [];
    return start && dates.length > 0 ? { start: dates[0], end: addDays(start, -1) } : undefined;
  });

  private readonly leadingResource = rxResource({
    params: () => this.leadingStretch(),
    stream: ({ params }) => from(this.api.invoke(streamerPlannerTeams, params)),
  });

  /**
   * The days of the week already behind the stretch, drawn faint so its first row reads as a week,
   * with the games they held: a night played still had its games. The count is left off until it
   * has come, and stays off if it cannot.
   */
  readonly leadingDays = computed<readonly LeadingDay[]>(() => {
    const start = this.stretch()?.start;
    if (!start || this.days().length === 0) {
      return [];
    }
    const nights = this.leadingResource.hasValue()
      ? new Map(plannerDays(this.leadingResource.value()).map((day) => [day.date, day.games]))
      : undefined;
    return leadingDays(start).map((date) => ({ date, games: nights?.get(date) }));
  });

  weekdayName(date: string): string {
    return weekdayName(date);
  }

  formatDay(date: string): string {
    return formatDay(date);
  }
}
