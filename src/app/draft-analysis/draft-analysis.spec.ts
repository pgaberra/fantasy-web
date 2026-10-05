import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { DraftAnalysisComponent } from './draft-analysis';
import { DraftAnalysisResponse } from '../api/models/draft-analysis-response';
import { LeaguesResponse } from '../api/models/leagues-response';
import { DraftAnalysisService } from '../services/draft-analysis.service';
import { YahooService } from '../services/yahoo.service';
import { YahooConnectReturnService } from '../services/yahoo-connect-return.service';
import { YahooLeaguePicker } from '../shared/yahoo-league-picker';
import { ErrorStateComponent } from '../shared/error-state/error-state';

const leagues: LeaguesResponse = {
  leagues: [
    { leagueKey: '465.l.1', name: 'Beer League', numTeams: 2 },
    { leagueKey: '465.l.2', name: 'Work League', numTeams: 2 },
  ],
};

const analysis: DraftAnalysisResponse = {
  status: 'FINISHED',
  auction: false,
  scoringType: 'points',
  preseason: true,
  modelVersion: 'preseason',
  premium: true,
  teams: [
    {
      id: 't2',
      name: 'Jocke',
      mine: false,
      picks: 2,
      valueAdded: 12.5,
      goodPicks: 1,
      badPicks: 0,
      grade: 'A',
    },
    {
      id: 't1',
      name: 'Mine',
      mine: true,
      picks: 2,
      valueAdded: -8,
      goodPicks: 0,
      badPicks: 1,
      grade: 'D',
    },
  ],
  picks: [
    {
      overall: 1,
      round: 1,
      teamId: 't1',
      playerId: 30,
      name: 'Reached Forward',
      club: 'TOR',
      positions: ['C'],
      aiRank: 30,
      value: 100,
      valueOverSlot: -40,
      grade: 'BIG_REACH',
      bestAvailable: { playerId: 1, name: 'Top Forward', positions: ['C'], aiRank: 1 },
    },
    {
      overall: 2,
      round: 1,
      teamId: 't2',
      playerId: 1,
      name: 'Top Forward',
      club: 'BOS',
      positions: ['C'],
      aiRank: 1,
      value: 140,
      valueOverSlot: 10,
      grade: 'GOOD',
    },
    {
      overall: 3,
      round: 2,
      teamId: 't2',
      playerId: 3,
      name: 'Third Forward',
      positions: ['LW'],
      aiRank: 3,
      value: 130,
      valueOverSlot: 0,
      grade: 'FAIR',
    },
    {
      overall: 4,
      round: 2,
      teamId: 't1',
      playerId: 2,
      name: 'Second Forward',
      positions: ['RW'],
      aiRank: 2,
      value: 135,
      valueOverSlot: 7,
      grade: 'STEAL',
    },
  ],
};

describe('DraftAnalysisComponent', () => {
  const yahoo = vi.fn<(key: string) => Observable<DraftAnalysisResponse>>(() => of(analysis));
  const myLeagues = vi.fn<() => Observable<LeaguesResponse>>(() => of(leagues));
  const originalPayments = environment.paymentsEnabled;

  const render = async () => {
    const fixture = MockRender(DraftAnalysisComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const choose = async (fixture: Awaited<ReturnType<typeof render>>, leagueKey: string) => {
    const select = fixture.nativeElement.querySelector('.league-select') as HTMLSelectElement;
    select.value = leagueKey;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const rows = (fixture: Awaited<ReturnType<typeof render>>, table: string): HTMLElement[] =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(`${table} tbody tr`),
    );

  beforeEach(() => {
    environment.paymentsEnabled = true;
    yahoo.mockReset();
    yahoo.mockReturnValue(of(analysis));
    myLeagues.mockReset();
    myLeagues.mockReturnValue(of(leagues));
    return MockBuilder(DraftAnalysisComponent)
      .keep(YahooLeaguePicker)
      .mock(YahooService, {
        myLeagues,
        connectionStatus: () => of({ connected: true }),
        startConnect: () => of({ authorizeUrl: 'https://example.test/auth' }),
      } as never)
      .mock(YahooConnectReturnService)
      .mock(DraftAnalysisService, { yahoo });
  });

  afterEach(() => {
    environment.paymentsEnabled = originalPayments;
  });

  it('reads nothing until a league is picked, then grades that league', async () => {
    const fixture = await render();
    expect(yahoo).not.toHaveBeenCalled();

    await choose(fixture, '465.l.2');

    expect(yahoo).toHaveBeenCalledWith('465.l.2');
    expect(fixture.nativeElement.querySelector('.analysis-league').textContent).toContain(
      'Work League',
    );
  });

  it('shows every pick with its grade and the best player still on the board', async () => {
    const fixture = await render();
    await choose(fixture, '465.l.1');

    const picks = rows(fixture, '.picks-table');
    expect(picks).toHaveLength(4);
    expect(picks[0].textContent).toContain('1.01');
    expect(picks[0].textContent).toContain('Reached Forward');
    expect(picks[0].textContent).toContain('Big reach');
    expect(picks[0].textContent).toContain('Top Forward');
    expect(picks[0].textContent).toContain('-40.0');
    expect(picks[3].textContent).toContain('2.02');
    expect(picks[3].textContent).toContain('Steal');
  });

  it('narrows the picks to one team from its row in the team table', async () => {
    const fixture = await render();
    await choose(fixture, '465.l.1');

    const jocke = rows(fixture, '.teams-table')[0];
    (jocke.querySelector('.show-picks') as HTMLButtonElement).click();
    fixture.detectChanges();

    const picks = rows(fixture, '.picks-table');
    expect(picks.map((row) => row.querySelector('.player-name')?.textContent)).toEqual([
      'Top Forward',
      'Third Forward',
    ]);
  });

  it('keeps only the reaches when asked', async () => {
    const fixture = await render();
    await choose(fixture, '465.l.1');

    const reaches = Array.from(fixture.nativeElement.querySelectorAll('.grade-filter button')).find(
      (button) => (button as HTMLElement).textContent?.trim() === 'Reaches',
    ) as HTMLButtonElement;
    reaches.click();
    fixture.detectChanges();

    expect(rows(fixture, '.picks-table')).toHaveLength(1);
  });

  it("marks the reader's own team", async () => {
    const fixture = await render();
    await choose(fixture, '465.l.1');

    expect(rows(fixture, '.teams-table')[1].classList).toContain('mine');
    expect(rows(fixture, '.picks-table')[0].classList).toContain('mine');
  });

  it('without Premium shows the picks and the teams, and offers the grades', async () => {
    yahoo.mockReturnValue(
      of({
        ...analysis,
        premium: false,
        picks: analysis.picks.map(({ overall, round, teamId, playerId, name, positions }) => ({
          overall,
          round,
          teamId,
          playerId,
          name,
          positions,
        })),
      }),
    );
    const fixture = await render();
    await choose(fixture, '465.l.1');

    expect(rows(fixture, '.picks-table')).toHaveLength(4);
    expect(fixture.nativeElement.querySelector('.picks-table thead').textContent).not.toContain(
      'Grade',
    );
    expect(fixture.nativeElement.querySelector('.grade-filter')).toBeNull();
    expect(fixture.nativeElement.querySelector('.analysis-locked')).not.toBeNull();
    expect(rows(fixture, '.teams-table')[0].textContent).toContain('A');
  });

  it('says so when the league has not drafted', async () => {
    yahoo.mockReturnValue(of({ ...analysis, status: 'PRE_DRAFT', picks: [] }));
    const fixture = await render();
    await choose(fixture, '465.l.1');

    expect(fixture.nativeElement.textContent).toContain("This league hasn't drafted yet");
    expect(fixture.nativeElement.querySelector('.picks-table')).toBeNull();
  });

  it('says which line graded the picks where the preseason one is missing', async () => {
    yahoo.mockReturnValue(of({ ...analysis, preseason: false }));
    const fixture = await render();
    await choose(fixture, '465.l.1');

    expect(fixture.nativeElement.querySelector('.analysis-source').textContent).toContain(
      'current SlapStat AI projection',
    );
  });

  it('shows a refusal in words the reader can act on', async () => {
    yahoo.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 424 })));
    const fixture = await render();
    await choose(fixture, '465.l.1');

    const errorState = ngMocks.find(fixture, ErrorStateComponent).componentInstance;
    expect(errorState.title()).toBe("Couldn't read that draft");
    expect(errorState.message()).toContain('Yahoo refused access');
  });
});
