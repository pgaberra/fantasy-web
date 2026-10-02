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
import { Api } from '../api/api';
import { streamerPlannerTeams } from '../api/fn/streamer-planner/streamer-planner-teams';
import { streamerPlannerWeeks } from '../api/fn/streamer-planner/streamer-planner-weeks';
import { PlannerWeek } from '../api/models/planner-week';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_SCORING_COLUMNS,
  DEFAULT_STAT_WEIGHTS,
} from '../draft-projection/projection-defaults';
import { Projection } from '../models/projection.model';
import { ScoringStatKey } from '../models/stat-key.model';
import { EspnService } from '../services/espn.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { StreamerPlannerFreeAgentsService } from '../services/streamer-planner-free-agents.service';
import { StreamerPlannerLeagueService } from '../services/streamer-planner-league.service';
import { YahooService } from '../services/yahoo.service';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { HelpTipComponent } from '../shared/help-tip/help-tip';
import { IconComponent } from '../shared/icon/icon';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import { FreeAgentsTableComponent } from './free-agents-table/free-agents-table';
import { LeagueFieldComponent } from './league-field/league-field';
import {
  categoryColumn,
  filterByPositions,
  LineColumn,
  nightsFactor,
  ofKind,
  PLANNER_POSITIONS,
  PlannerPosition,
  PlannerPositionGroup,
  projectedStarts,
  RankedFreeAgent,
  scaledProjection,
  startsProjection,
  teamsByKey,
  TOP_OPTIONS,
  WEEK_DECIMALS,
} from './planner-free-agents';
import { focusableCategories, readFocus, writeFocus } from './planner-focus';
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
  stretchLabel,
  weekdayName,
  weekOf,
  weeksTitle,
} from './planner-schedule';
import { TeamSchedulesComponent } from './team-schedules/team-schedules';
import { TopOptionsComponent } from './top-options/top-options';

export type { Stretch } from './planner-schedule';

/** A day before the stretch: its date, and its games once they have been asked for. */
export interface LeadingDay {
  readonly date: string;
  readonly games?: number;
}

/** No category picked: the list is ranked by the league's whole set. */
const NO_FOCUS: ReadonlySet<ScoringStatKey> = new Set();

/** What the goalies' categories are filed under, beside the league's own key. */
const GOALIE_FOCUS_SUFFIX = ':goalies';

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
 * sits beside the nights.
 *
 * <p>The schedules are rated once, for the whole page. Skaters or goalies is asked on the free
 * agents alone, which are that kind only, in its own categories: the two fill different roster
 * slots and score different things, so a list of both had columns that meant one thing on a
 * skater's row and nothing on a goalie's. What concerns one table only (which kind, which
 * positions, which categories to rank by) sits on that table.
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
    TopOptionsComponent,
  ],
  templateUrl: './streamer-planner.html',
  styleUrl: './streamer-planner.css',
})
export class StreamerPlannerComponent {
  private readonly api = inject(Api);
  private readonly freeAgentsService = inject(StreamerPlannerFreeAgentsService);
  private readonly leagueService = inject(StreamerPlannerLeagueService);
  private readonly ranking = inject(ProjectionRankingService);
  private readonly yahoo = inject(YahooService);
  private readonly espn = inject(EspnService);
  /** Read once, when the page opens: the nights are counted from this day. */
  private readonly today = inject(PLANNER_TODAY)();
  /** Phone or desktop: each keeps its own page size. */
  private readonly layout = inject(PLANNER_LAYOUT);

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

  readonly league = this.leagueService.league;

  readonly positionOptions = PLANNER_POSITIONS;

  /** Skaters or goalies: the kind of player the free agents list. */
  readonly position = signal<PlannerPosition>('skaters');

  setPosition(position: PlannerPosition): void {
    this.position.set(position);
  }

  /** The positions the skaters are narrowed to. None is every position, as the page opens. */
  readonly positions = signal<ReadonlySet<PlannerPositionGroup>>(new Set());

  /** One more position, or one fewer: any number can be on at once. */
  togglePosition(position: PlannerPositionGroup): void {
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
    () => this.freeAgentsResource.isLoading() || this.settingsResource.isLoading(),
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

  // --- The categories the list is ranked by ----------------------------------------------------

  /** The league, as the remembered focus is filed under. */
  private readonly leagueKey = computed(() => {
    const league = this.league();
    return league ? `${league.platform}:${league.leagueId}` : null;
  });

  /**
   * The categories a streamer can rank one kind of player by: a category league's own. A points
   * league has none, since a point is worth the same whichever category it came from.
   */
  private focusOptionsOf(kind: 'skater' | 'goalie'): readonly LineColumn[] {
    return this.scoringType() === 'category'
      ? focusableCategories(this.categories(), kind).map(categoryColumn)
      : [];
  }

  readonly focusOptions = computed(() => this.focusOptionsOf('skater'));
  readonly goalieFocusOptions = computed(() => this.focusOptionsOf('goalie'));

  /**
   * The categories picked, as remembered for the league until this week is over. The goalies' are
   * filed apart, since a category such as time on ice is both kinds'.
   */
  private readonly focusPicked = linkedSignal<string | null, ReadonlySet<ScoringStatKey>>({
    source: this.leagueKey,
    computation: (league) => new Set(league ? readFocus(league, this.today) : []),
  });
  private readonly goalieFocusPicked = linkedSignal<string | null, ReadonlySet<ScoringStatKey>>({
    source: this.leagueKey,
    computation: (league) =>
      new Set(league ? readFocus(`${league}${GOALIE_FOCUS_SUFFIX}`, this.today) : []),
  });

  /**
   * The categories the list is ranked by. None is the league's whole set, which is how the page
   * opens. A category the league no longer scores is dropped rather than ranked by.
   */
  readonly focus = computed(() => keepOffered(this.focusPicked(), this.focusOptions()));
  readonly goalieFocus = computed(() =>
    keepOffered(this.goalieFocusPicked(), this.goalieFocusOptions()),
  );

  toggleFocus(key: ScoringStatKey): void {
    this.setFocus('skater', toggled(this.focus(), key));
  }

  toggleGoalieFocus(key: ScoringStatKey): void {
    this.setFocus('goalie', toggled(this.goalieFocus(), key));
  }

  clearFocus(): void {
    this.setFocus('skater', new Set());
  }

  clearGoalieFocus(): void {
    this.setFocus('goalie', new Set());
  }

  private setFocus(kind: 'skater' | 'goalie', focus: ReadonlySet<ScoringStatKey>): void {
    (kind === 'skater' ? this.focusPicked : this.goalieFocusPicked).set(focus);
    const league = this.leagueKey();
    const week = weekOf(this.weeks(), this.today);
    // Without the season's weeks there is no end to hold it to: it holds for this visit only.
    if (league && week) {
      writeFocus(
        kind === 'skater' ? league : `${league}${GOALIE_FOCUS_SUFFIX}`,
        focus,
        week.end,
        this.today,
      );
    }
  }

  /** The categories to pick from for the kind on screen, and which of them are picked. */
  readonly pickerOptions = computed(() =>
    this.position() === 'skaters' ? this.focusOptions() : this.goalieFocusOptions(),
  );
  readonly pickerFocus = computed(() =>
    this.position() === 'skaters' ? this.focus() : this.goalieFocus(),
  );

  togglePicker(key: ScoringStatKey): void {
    if (this.position() === 'skaters') {
      this.toggleFocus(key);
    } else {
      this.toggleGoalieFocus(key);
    }
  }

  clearPicker(): void {
    if (this.position() === 'skaters') {
      this.clearFocus();
    } else {
      this.clearGoalieFocus();
    }
  }

  /** "PPP, SOG": the skater categories picked, as the score's tip and the cards name them. */
  readonly focusLabel = computed(() => pickedLabel(this.focusOptions(), this.focus()));
  private readonly goalieFocusLabel = computed(() =>
    pickedLabel(this.goalieFocusOptions(), this.goalieFocus()),
  );

  /**
   * Every available player with a projection, best first by the league's scoring. With categories
   * picked, only the kind they belong to, scored in those alone: a goalie has nothing to give in a
   * skater category, and his own z-score is not on the same scale as one category's.
   */
  private rankedBy(
    focus: ReadonlySet<ScoringStatKey>,
    kind: 'skater' | 'goalie' = 'skater',
  ): RankedFreeAgent[] {
    const week = this.freeAgentsResource.hasValue() ? this.freeAgentsResource.value() : null;
    if (!week) {
      return [];
    }
    const scoring = this.scoring();
    const teams = this.teamsByKey();
    const counted = this.counted();
    const everyNightCounted = this.everyNightCounted();
    const starts = projectedStarts(week.creases, counted, everyNightCounted);
    const games = new Map<string, number>();
    const lines = new Map<string, Projection>();
    const byPlayerId = new Map(week.players.map((player) => [player.projection.playerId, player]));
    const players =
      focus.size > 0
        ? week.players.filter((player) => player.projection.type === kind)
        : week.players;
    const projections = players.map((player) => {
      const factor = nightsFactor(player, teams, counted, everyNightCounted);
      let played = player.expectedGames * factor;
      let line = scaledProjection(player.projection, factor);
      if (player.projection.type === 'goalie') {
        // A game is one goalie's, so a goalie's are whole: the crease's split of the nights, or
        // for one in no crease his own expectation, rounded.
        played = starts.get(player.playerId) ?? Math.round(played);
        line = startsProjection(player.projection, player.expectedGames, played);
      }
      games.set(player.playerId, played);
      lines.set(player.playerId, line);
      return line;
    });
    const scored = this.ranking.rankOverall({
      projections,
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
    });
    const ranked: RankedFreeAgent[] = [];
    for (const [index, entry] of scored.entries()) {
      const player = byPlayerId.get(entry.projection.playerId);
      if (player) {
        ranked.push({
          player,
          line: lines.get(player.playerId) ?? player.projection,
          score: scoring.scoringType === 'points' ? entry.score.fantasyPoints : entry.score.zScore,
          rank: index + 1,
          games: games.get(player.playerId) ?? player.expectedGames,
        });
      }
    }
    return ranked;
  }

  /** The best pickups of either kind, or the skaters in the categories picked: what the cards read. */
  readonly ranked = computed(() => this.rankedBy(this.focus()));

  /** Everyone by the league's whole set of categories, which is how the goalies open. */
  private readonly rankedByAll = computed(() =>
    this.focus().size === 0 ? this.ranked() : this.rankedBy(NO_FOCUS),
  );

  /** The goalies, by the categories picked for them, or by the league's whole set. */
  private readonly rankedGoalies = computed(() =>
    this.goalieFocus().size > 0 ? this.rankedBy(this.goalieFocus(), 'goalie') : this.rankedByAll(),
  );

  readonly topOptions = computed(() => this.ranked().slice(0, TOP_OPTIONS));

  /**
   * The list on screen: the skaters, narrowed to the positions picked, or the goalies, each ranked
   * by the categories picked for that kind. Each is placed among his own kind.
   */
  readonly filtered = computed(() =>
    this.position() === 'skaters'
      ? filterByPositions(ofKind(this.ranked(), 'skater'), this.positions())
      : ofKind(this.rankedGoalies(), 'goalie'),
  );

  /** The categories the list on screen is ranked by. */
  readonly listFocus = computed(() => this.pickerFocus());
  readonly listFocusLabel = computed(() =>
    this.position() === 'skaters' ? this.focusLabel() : this.goalieFocusLabel(),
  );

  /** Why the list on screen has nobody in it, though the league has players available. */
  readonly emptyText = computed(() => {
    if (this.position() === 'goalies') {
      return 'No available goalie has a projection for these nights.';
    }
    return this.positions().size > 0
      ? 'No available player at these positions has a projection.'
      : 'No available skater has a projection for these nights.';
  });

  // --- The pages of the list --------------------------------------------------------------------

  readonly pageSizes = PAGE_SIZES;

  /** Players to a page: the reader's choice for this layout, or its default. */
  readonly pageSize = linkedSignal(() => readPageSize(this.layout()));

  /**
   * The page asked for, counted from 0. The other kind of player, other positions or other
   * categories are another list, so it opens on its first page again.
   */
  private readonly page = linkedSignal<unknown, number>({
    source: () => [this.position(), this.positions(), this.focus(), this.goalieFocus()],
    computation: () => 0,
  });

  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.filtered().length / this.pageSize())),
  );

  /** The page on screen: the one asked for, or the last one if the list has since grown shorter. */
  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount() - 1));

  private readonly firstShown = computed(() => this.currentPage() * this.pageSize());

  readonly visible = computed(() =>
    this.filtered().slice(this.firstShown(), this.firstShown() + this.pageSize()),
  );

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

  /** The cards have something to show, or will once the list lands. */
  readonly showsTopOptions = computed(
    () => !!this.league() && (this.loadingFreeAgents() || this.topOptions().length > 0),
  );

  readonly noFreeAgents = computed(
    () =>
      !!this.league() &&
      !this.loadingFreeAgents() &&
      !this.freeAgentsFailure() &&
      this.rankedByAll().length === 0,
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

  /** "Week 3", or "Weeks 3 to 5". */
  readonly weeksTitle = computed(() => {
    const stretch = this.stretch();
    return stretch ? weeksTitle(this.weeks(), stretch) : '';
  });

  /** "Oct 19 to Oct 25". */
  readonly stretchTitle = computed(() => {
    const stretch = this.stretch();
    return stretch ? stretchLabel(stretch.start, stretch.end) : '';
  });

  /** "6 of 7 game days": the days counted, of the days with games. */
  readonly nightsTitle = computed(() => {
    const nights = this.nightsWithGames();
    return nights === 0 ? 'No games' : `${this.counted().size} of ${nights} game days`;
  });

  /** What a night is worth, said once, in the tip beside the nights. */
  readonly nightsHelp = computed(() => {
    const max = this.offNightMaxGames();
    const offNight = max
      ? `An off-night has ${max} games or fewer, when most lineups have an open slot, so a game on one counts 1.25.`
      : 'A game on an off-night, when most lineups have an open slot, counts 1.25.';
    return `${offNight} Untick a game day your lineup has no room on.`;
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

  /** Whether any night on screen carries the off-night mark, and so whether the line under them explains it. */
  readonly hasOffNight = computed(() => this.days().some((day) => day.offNight));
}
