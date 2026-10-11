import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { LandingLineupComponent } from './landing-lineup';
import { ErrorStateComponent } from '../../shared/error-state/error-state';
import { LandingPlayersService } from '../landing-players.service';
import { PlayerService } from '../../services/player.service';
import { ProjectionRankingService } from '../../services/projection-ranking.service';
import { ProjectionCalculationService } from '../../services/projection-calculation.service';
import { Goalie, Skater } from '../../models/player.model';
import { GoalieStats, SkaterStats } from '../../models/projection.model';
import { SkaterPosition } from '../../models/position.model';
import { GOALIE_SCORING_STAT_KEYS, SKATER_SCORING_STAT_KEYS } from '../../models/stat-key.model';

const zeroed = (keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, 0]));

function skater(
  id: number,
  name: string,
  positions: SkaterPosition[],
  scoring: Partial<SkaterStats['scoring']>,
): Skater {
  return {
    id,
    type: 'skater',
    name,
    teamAbbrev: 'EDM',
    positions: new Set(positions),
    stats: {
      scoring: { ...zeroed(SKATER_SCORING_STAT_KEYS), ...scoring },
      utility: { gp: 82, toiPerGame: 1200 },
    } as unknown as SkaterStats,
  };
}

function goalie(id: number, name: string, w: number): Goalie {
  return {
    id,
    type: 'goalie',
    name,
    teamAbbrev: 'WPG',
    stats: {
      scoring: { ...zeroed(GOALIE_SCORING_STAT_KEYS), w, sv: 1500, ga: 120, gs: 60 },
      utility: { gp: 62 },
    } as unknown as GoalieStats,
  };
}

describe('LandingLineupComponent', () => {
  // Two centres: one scores his goals, the other his assists, so which leads the card depends on
  // the weights the visitor types.
  const sniper = skater(1, 'Auston Matthews', ['C'], { goals: 60, assists: 20 });
  const playmaker = skater(2, 'Connor McDavid', ['C'], { goals: 30, assists: 90 });
  const winger = skater(3, 'Kirill Kaprizov', ['LW'], { goals: 40, assists: 50 });
  const starter = goalie(4, 'Connor Hellebuyck', 40);
  const players = [sniper, playmaker, winger, starter];
  const getPlayers = vi.fn(() => of(players));

  beforeEach(() => {
    getPlayers.mockReturnValue(of(players));
    return MockBuilder(LandingLineupComponent)
      .keep(LandingPlayersService)
      .keep(ProjectionRankingService)
      .keep(ProjectionCalculationService)
      .mock(PlayerService, { getPlayers });
  });

  function names(el: HTMLElement): (string | undefined)[] {
    return Array.from(el.querySelectorAll('.lineup-row')).map((row) =>
      row.querySelector('.player-name')?.textContent?.trim(),
    );
  }

  async function render() {
    const fixture = MockRender(LandingLineupComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('fills the slots from the real pool, ranked by the default weights', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;

    // Goals weigh 4.5 and assists 3: 60 goals and 20 assists (330) beat 30 and 90 (405)? No:
    // 30 * 4.5 + 90 * 3 = 405 > 60 * 4.5 + 20 * 3 = 330, so McDavid takes the first C slot.
    expect(names(el)).toEqual([
      'Connor McDavid',
      'Auston Matthews',
      'Kirill Kaprizov',
      undefined, // RW: nobody eligible, the slot waits
      undefined, // D
      undefined, // D
      'Connor Hellebuyck',
    ]);
    expect(el.querySelector('th.col-score')?.textContent?.trim()).toBe('Fan Pts');
  });

  it('refills the slots when a weight changes, and holds a highlight on the ones that moved', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    // Fake timers only once the pool has landed: whenStable() waits on the real ones.
    vi.useFakeTimers();
    const goals = el.querySelectorAll<HTMLInputElement>('.weight-input')[0];

    // Goals worth 20 each: 60 goals now beat 90 assists.
    goals.value = '20';
    goals.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(names(el).slice(0, 2)).toEqual(['Auston Matthews', 'Connor McDavid']);
    const changed = Array.from(el.querySelectorAll('.lineup-row--changed')).map((row) =>
      row.querySelector('.player-name')?.textContent?.trim(),
    );
    expect(changed).toEqual(['Auston Matthews', 'Connor McDavid']);

    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(el.querySelectorAll('.lineup-row--changed').length).toBe(0);
    vi.useRealTimers();
  });

  it('does not highlight the first filling', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.lineup-row--changed').length).toBe(0);
  });

  it('switches to the z-score in a category league', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;

    el.querySelectorAll<HTMLButtonElement>('.segmented button')[1].click();
    fixture.detectChanges();

    expect(el.querySelector('th.col-score')?.textContent?.trim()).toBe('Z-score');
  });

  it('keeps the slots, as waiting rows, while the pool has not arrived', async () => {
    getPlayers.mockReturnValue(of([]));
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.lineup-row').length).toBe(7);
    expect(el.querySelectorAll('.pending-bar--name').length).toBe(7);
  });

  it('shows the error state, with a way to try again, when the pool cannot be read', async () => {
    getPlayers.mockReturnValue(throwError(() => new Error('down')));
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('app-error-state')).toBeTruthy();
    expect(el.querySelector('.lineup-table')).toBeNull();

    getPlayers.mockReturnValue(of(players));
    ngMocks.output(ngMocks.find(fixture, ErrorStateComponent), 'retry').emit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('app-error-state')).toBeNull();
    expect(names(el)[0]).toBe('Connor McDavid');
  });
});
