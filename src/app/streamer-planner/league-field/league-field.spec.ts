import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { LeaguesResponse } from '../../api/models/leagues-response';
import {
  PlannerLeague,
  StreamerPlannerLeagueService,
} from '../../services/streamer-planner-league.service';
import { YahooService } from '../../services/yahoo.service';
import { ESPN_OPTION, LeagueFieldComponent } from './league-field';

describe('LeagueFieldComponent', () => {
  const choose = vi.fn();
  const forget = vi.fn();
  const myLeagues = vi.fn<() => ReturnType<YahooService['myLeagues']>>();
  let chosen: PlannerLeague | null = null;

  beforeEach(() => {
    chosen = null;
    choose.mockReset();
    forget.mockReset();
    myLeagues.mockReset();
    myLeagues.mockReturnValue(
      of<LeaguesResponse>({
        leagues: [{ leagueKey: '465.l.9', name: 'The Gordie Howes' }],
      }),
    );
    return MockBuilder(LeagueFieldComponent)
      .mock(StreamerPlannerLeagueService, {
        get league() {
          return () => chosen;
        },
        choose,
        forget,
      } as never)
      .mock(YahooService, { myLeagues });
  });

  async function render() {
    const fixture = MockRender(LeagueFieldComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('reads a Yahoo league the moment it is picked', async () => {
    const fixture = await render();

    fixture.point.componentInstance.select({ target: { value: '465.l.9' } } as unknown as Event);

    expect(choose).toHaveBeenCalledWith({
      platform: 'YAHOO',
      leagueId: '465.l.9',
      name: 'The Gordie Howes',
    });
  });

  it('opens on the remembered league, even one Yahoo no longer lists', async () => {
    chosen = { platform: 'YAHOO', leagueId: '465.l.1', name: 'Gone League' };
    const fixture = await render();
    const field = fixture.point.componentInstance;

    expect(field.selectedValue()).toBe('465.l.1');
    expect(field.yahooLeagues().map((league) => league.name)).toEqual([
      'Gone League',
      'The Gordie Howes',
    ]);
  });

  it('waits for an ESPN id to be typed and used, and trims it', async () => {
    const fixture = await render();
    const field = fixture.point.componentInstance;

    field.select({ target: { value: ESPN_OPTION } } as unknown as Event);
    expect(choose).not.toHaveBeenCalled();
    expect(field.showsEspnId()).toBe(true);

    field.espnLeagueId.set(' 12345 ');
    field.useEspn();

    expect(choose).toHaveBeenCalledWith({
      platform: 'ESPN',
      leagueId: '12345',
      name: 'ESPN league 12345',
    });
    expect(field.espnChosen()).toBe(false);
  });

  it('does nothing when no ESPN id is typed', async () => {
    const fixture = await render();
    fixture.point.componentInstance.useEspn();

    expect(choose).not.toHaveBeenCalled();
  });

  it('forgets the league when the placeholder is picked again', async () => {
    chosen = { platform: 'YAHOO', leagueId: '465.l.9', name: 'The Gordie Howes' };
    const fixture = await render();

    fixture.point.componentInstance.select({ target: { value: '' } } as unknown as Event);

    expect(forget).toHaveBeenCalled();
  });

  it('still offers ESPN when the Yahoo leagues cannot be loaded, and says so', async () => {
    myLeagues.mockReturnValue(throwError(() => new Error('offline')));
    const fixture = await render();

    expect(ngMocks.formatText(fixture)).toContain("Couldn't load your Yahoo leagues");
    expect(ngMocks.formatText(fixture)).toContain('ESPN league by ID');
  });
});
