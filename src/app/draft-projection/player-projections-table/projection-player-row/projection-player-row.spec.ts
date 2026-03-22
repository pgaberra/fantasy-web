import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { vi } from 'vitest';
import { ProjectionPlayerRowComponent } from './projection-player-row';
import { Player, ScoringStatKey, UtilityStatKey } from '../../../models/player.model';
import { ActiveColumns, PlayerProjection, PlayerScore, ScoringType } from '../../model';
import { DEFAULT_DECIMAL_SETTINGS } from '../../projection-settings-section/model';
import { DecimalPipe } from '@angular/common';
import { FormatToiPipe } from '../../../pipes/format-toi.pipe';

describe('ProjectionPlayerRowComponent', () => {
  const mockPlayer: Player = {
    id: 1,
    name: 'Connor McDavid',
    positions: new Set(['C', 'LW']),
    stats: {
      utility: { gp: 82, toiPerGame: 1320 },
      scoring: { goals: 64, assists: 89, plusMinus: 33, pim: 36, ppg: 22, ppa: 38, shg: 1, sha: 0, gwg: 8, sog: 348, shPct: 18.4, fw: 812, fl: 623, hits: 42, blocks: 28 },
    },
  };
  const mockProjection: PlayerProjection = {
    playerId: 1,
    stats: { scoring: mockPlayer.stats.scoring, utility: mockPlayer.stats.utility },
  };
  const mockPlayerScore: PlayerScore = { fantasyPoints: 42.5, zScore: 1.23 };

  const rowTemplate = `
    <table><tbody>
      <tr app-projection-player-row
        [rank]="rank"
        [projection]="projection"
        [playerScore]="playerScore"
        [player]="player"
        [activeColumns]="activeColumns"
        [scoringType]="scoringType"
        [decimalSettings]="decimalSettings"
      ></tr>
    </tbody></table>
  `;

  beforeEach(() =>
    MockBuilder(ProjectionPlayerRowComponent)
      .keep(DecimalPipe)
      .keep(FormatToiPipe),
  );

  const getFixture = (overrides: object = {}) =>
    MockRender(rowTemplate, {
      rank: 1,
      projection: mockProjection,
      playerScore: mockPlayerScore,
      player: mockPlayer,
      activeColumns: { scoringColumns: new Set<ScoringStatKey>(['goals', 'assists']), utilityColumns: new Set<UtilityStatKey>(['gp']) } as ActiveColumns,
      scoringType: 'category' as ScoringType,
      decimalSettings: DEFAULT_DECIMAL_SETTINGS,
      ...overrides,
    });

  const getComponent = (overrides: object = {}) =>
    ngMocks.find(getFixture(overrides).debugElement, ProjectionPlayerRowComponent).componentInstance;

  describe('playerPosition', () => {
    it('should join multiple positions with a comma', () => {
      expect(getComponent().playerPosition()).toEqual('C, LW');
    });

    it('should return a single position without a comma', () => {
      expect(getComponent({ player: { ...mockPlayer, positions: new Set(['D']) } }).playerPosition()).toEqual('D');
    });
  });

  describe('formatStat', () => {
    it('should format a stat with the correct number of decimals', () => {
      expect(getComponent().formatStat(18.4567, 'shPct')).toEqual('18.5'); // shPct has 1 decimal
    });

    it('should round to 0 decimals for integer-typed stats', () => {
      expect(getComponent().formatStat(64.7, 'goals')).toEqual('65');
    });

    it('should drop trailing zeros after the decimal point', () => {
      expect(getComponent().formatStat(2.0, 'shPct')).toEqual('2');
    });
  });

  describe('template', () => {
    it('should render the rank in the rank cell', () => {
      const fixture = getFixture({ rank: 5 });
      expect(fixture.nativeElement.querySelector('.col-rank').textContent.trim()).toEqual('5');
    });

    it('should render the player name in the name cell', () => {
      const fixture = getFixture();
      expect(fixture.nativeElement.querySelector('.player-name').textContent).toContain('Connor McDavid');
    });

    it('should render the positions in the name cell', () => {
      const fixture = getFixture();
      expect(fixture.nativeElement.querySelector('.player-name').textContent).toContain('C, LW');
    });

    it('should render a number input for non-toiPerGame utility columns', () => {
      const fixture = getFixture({ activeColumns: { scoringColumns: new Set<ScoringStatKey>(['goals', 'assists']), utilityColumns: new Set<UtilityStatKey>(['gp']) } as ActiveColumns });
      const input = fixture.nativeElement.querySelector('.col-gp input') as HTMLInputElement;
      expect(input.type).toEqual('number');
      expect(input.value).toEqual('82');
    });

    it('should render a text input in mm:ss format for toiPerGame', () => {
      const fixture = getFixture({ activeColumns: { scoringColumns: new Set<ScoringStatKey>(['goals', 'assists']), utilityColumns: new Set<UtilityStatKey>(['toiPerGame']) } as ActiveColumns });
      const input = fixture.nativeElement.querySelector('.col-toiPerGame input') as HTMLInputElement;
      expect(input.type).toEqual('text');
      expect(input.value).toEqual('22:00');
    });

    it('should render a number input per active scoring column', () => {
      const fixture = getFixture({
        activeColumns: { scoringColumns: new Set<ScoringStatKey>(['goals', 'assists']), utilityColumns: new Set<UtilityStatKey>() } as ActiveColumns,
      });
      expect(fixture.nativeElement.querySelectorAll('input[type="number"]').length).toEqual(2);
    });

    it('should show zScore when scoringType is "category"', () => {
      const fixture = getFixture({ scoringType: 'category' });
      expect(fixture.nativeElement.querySelector('.fan-pts-cell').textContent.trim()).toContain('1.23');
    });

    it('should show fantasyPoints when scoringType is "points"', () => {
      const fixture = getFixture({ scoringType: 'points' });
      expect(fixture.nativeElement.querySelector('.fan-pts-cell').textContent.trim()).toContain('42.5');
    });

    it('should emit statInput with the correct payload on a scoring column input event', () => {
      const fixture = getFixture({
        activeColumns: { scoringColumns: new Set<ScoringStatKey>(['goals']), utilityColumns: new Set<UtilityStatKey>() } as ActiveColumns,
      });
      const component = ngMocks.find(fixture.debugElement, ProjectionPlayerRowComponent).componentInstance;
      vi.spyOn(component.statInput, 'emit');
      fixture.nativeElement.querySelector('input[type="number"]').dispatchEvent(new Event('input'));
      expect(component.statInput.emit).toHaveBeenCalledWith(
        expect.objectContaining({ playerId: 1, key: 'goals' }),
      );
    });

    it('should emit statInput with the correct payload on a non-toiPerGame utility input event', () => {
      const fixture = getFixture({ activeColumns: { scoringColumns: new Set<ScoringStatKey>(['goals', 'assists']), utilityColumns: new Set<UtilityStatKey>(['gp']) } as ActiveColumns });
      const component = ngMocks.find(fixture.debugElement, ProjectionPlayerRowComponent).componentInstance;
      vi.spyOn(component.statInput, 'emit');
      fixture.nativeElement.querySelector('.col-gp input').dispatchEvent(new Event('input'));
      expect(component.statInput.emit).toHaveBeenCalledWith(
        expect.objectContaining({ playerId: 1, key: 'gp' }),
      );
    });

    it('should emit toiKeydown with the correct payload on a toiPerGame keydown event', () => {
      const fixture = getFixture({ activeColumns: { scoringColumns: new Set<ScoringStatKey>(['goals', 'assists']), utilityColumns: new Set<UtilityStatKey>(['toiPerGame']) } as ActiveColumns });
      const component = ngMocks.find(fixture.debugElement, ProjectionPlayerRowComponent).componentInstance;
      vi.spyOn(component.toiKeydown, 'emit');
      fixture.nativeElement.querySelector('.col-toiPerGame input').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      expect(component.toiKeydown.emit).toHaveBeenCalledWith(
        expect.objectContaining({ playerId: 1 }),
      );
    });
  });
});
