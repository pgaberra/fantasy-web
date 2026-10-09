import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { DraftAnalysisPick } from '../api/models/draft-analysis-pick';
import { DraftAnalysisResponse } from '../api/models/draft-analysis-response';
import { DraftAnalysisTeam } from '../api/models/draft-analysis-team';
import { DraftAnalysisService } from '../services/draft-analysis.service';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { IconComponent } from '../shared/icon/icon';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { TableScrollDirective } from '../shared/table-scroll/table-scroll.directive';
import { TeamLogoComponent } from '../shared/team-logo/team-logo';
import { YahooLeaguePicker } from '../shared/yahoo-league-picker';
import {
  powerRankingsMessage,
  powerRankingsRetryable,
} from '../team-power-rankings/power-rankings-error';
import {
  filterPicks,
  GRADE_LABELS,
  GradeFilter,
  gradeTone,
  pickLabel,
  PickGrade,
  signedValue,
} from './draft-analysis-view';

/**
 * Draft Analysis: a league's draft with every pick set against the AI projection, to say which
 * picks were good and which were reaches — the user's own and everyone else's.
 *
 * <p>Like Team Power Rankings, nothing is saved and only the league key goes out: the BFF reads the
 * picks and the scoring settings from Yahoo and grades them by the model's line from before the
 * season. The teams' grades are everyone's; each pick's rank and grade are Premium's.
 */
@Component({
  selector: 'app-draft-analysis',
  imports: [
    RouterLink,
    ErrorStateComponent,
    IconComponent,
    LoadingIndicatorComponent,
    TableScrollDirective,
    TeamLogoComponent,
  ],
  providers: [YahooLeaguePicker],
  templateUrl: './draft-analysis.html',
  styleUrl: './draft-analysis.css',
})
export class DraftAnalysisComponent implements OnInit {
  private readonly analysisService = inject(DraftAnalysisService);

  /** The league picker every screen shares, so choosing a league means the same thing here. */
  readonly picker = inject(YahooLeaguePicker);

  protected readonly gradeLabels = GRADE_LABELS;
  protected readonly gradeTone = gradeTone;
  protected readonly signedValue = signedValue;

  /** The team whose picks the list shows, or null for every team. */
  readonly teamFilter = signal<string | null>(null);

  readonly gradeFilter = signal<GradeFilter>('all');

  ngOnInit(): void {
    this.picker.start();
  }

  private readonly analysisResource = rxResource({
    params: () => this.picker.selectedKey() ?? undefined,
    stream: ({ params }) => this.analysisService.yahoo(params),
  });

  readonly loading = computed(() => this.analysisResource.isLoading());
  readonly error = computed(() => this.analysisResource.error());
  readonly analysis = computed<DraftAnalysisResponse | null>(() =>
    this.analysisResource.hasValue() ? this.analysisResource.value() : null,
  );

  readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? powerRankingsMessage(error) : null;
  });

  readonly errorRetryable = computed(() => powerRankingsRetryable(this.error()));

  readonly leagueName = computed(() => {
    const key = this.picker.selectedKey();
    return this.picker.leagues().find((league) => league.leagueKey === key)?.name ?? '';
  });

  readonly teams = computed<DraftAnalysisTeam[]>(() => this.analysis()?.teams ?? []);

  private readonly teamNames = computed(
    () => new Map(this.teams().map((team) => [team.id, team.name] as const)),
  );

  readonly myTeamId = computed(() => this.teams().find((team) => team.mine)?.id ?? null);

  /** Whether each pick's rank and grade came back, which is what Premium pays for. */
  readonly graded = computed(() => !!this.analysis()?.premium && !this.analysis()?.auction);

  /** Whether to sell Premium here: wherever the grades did not come back. */
  readonly sellsPremium = computed(() => !!this.analysis() && !this.analysis()?.premium);

  /** What a value is in, which the league's scoring decides. */
  readonly valueUnit = computed(() =>
    this.analysis()?.scoringType === 'category' ? 'z-scores' : 'fantasy points',
  );

  readonly notDrafted = computed(() => {
    const analysis = this.analysis();
    return !!analysis && analysis.picks.length === 0;
  });

  readonly inProgress = computed(() => this.analysis()?.status === 'IN_PROGRESS');

  readonly picks = computed<DraftAnalysisPick[]>(() =>
    filterPicks(this.analysis()?.picks ?? [], this.teamFilter(), this.gradeFilter()),
  );

  teamName(teamId: string): string {
    return this.teamNames().get(teamId) ?? '';
  }

  pickLabel(pick: DraftAnalysisPick): string {
    return pickLabel(pick, this.teams().length);
  }

  gradeLabel(grade: PickGrade | undefined): string {
    return grade ? this.gradeLabels[grade] : '';
  }

  /** Picking a league in the dropdown reads it; the filters start over for a new league. */
  selectLeague(event: Event): void {
    this.teamFilter.set(null);
    this.gradeFilter.set('all');
    this.picker.select(event);
  }

  selectTeam(event: Event): void {
    this.teamFilter.set((event.target as HTMLSelectElement).value || null);
  }

  /** Shows one team's picks, as a press on its row in the team table asks. */
  showTeam(teamId: string): void {
    this.teamFilter.set(teamId);
  }

  setGradeFilter(filter: GradeFilter): void {
    this.gradeFilter.set(filter);
  }

  retry(): void {
    this.analysisResource.reload();
  }
}
