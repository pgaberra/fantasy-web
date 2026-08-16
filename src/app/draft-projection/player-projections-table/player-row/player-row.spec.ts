import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlayerRowComponent } from './player-row';
import { StatInputComponent } from './stat-input/stat-input';
import { Goalie, Player, Skater } from '../../../models/player.model';
import { SkaterPosition } from '../../../models/position.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../../../models/stat-key.model';
import {
  ActiveColumns,
  PlayerScore,
  Projection,
  ScoringType,
} from '../../../models/projection.model';
import { FormatToiPipe } from '../../../pipes/format-toi.pipe';
import { DecimalPipe } from '@angular/common';
import { DecimalStatKey, DEFAULT_DECIMAL_SETTINGS } from '../../projection-settings-section/model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PlayerRowComponent', () => {
  let fixture: ComponentFixture<PlayerRowComponent>;
  let component: PlayerRowComponent;
  const mockSkater: Skater = {
    id: 1,
    type: 'skater',
    name: 'Connor McDavid',
    positions: new Set(['C']),
    stats: {
      utility: { gp: 82, toiPerGame: 1320 },
      scoring: {
        stpg: 0,
        stpa: 0,
        stp: 0,
        hatTricks: 0,
        defPoints: 0,
        shifts: 0,
        toi: 0,
        goals: 64,
        assists: 89,
        points: 153,
        plusMinus: 33,
        pim: 36,
        ppg: 22,
        ppa: 38,
        ppp: 60,
        shg: 1,
        sha: 0,
        shp: 1,
        gwg: 8,
        sog: 348,
        shPct: 18.4,
        fw: 812,
        fl: 623,
        hits: 42,
        blocks: 28,
      },
    },
  };

  const mockSkaterProjection: Projection = {
    type: 'skater',
    playerId: 1,
    stats: {
      scoring: {
        ...mockSkater.stats.scoring,
      },
      utility: { ...mockSkater.stats.utility },
    },
  };

  const mockGoalie: Goalie = {
    id: 101,
    type: 'goalie',
    name: 'Igor Shesterkin',
    stats: {
      utility: { gp: 58 },
      scoring: {
        otl: 0,
        winPct: 0,
        toi: 0,
        gs: 58,
        w: 36,
        l: 17,
        sho: 3,
        sa: 1720,
        sv: 1565,
        ga: 155,
        gaa: 2.67,
        svPct: 0.91,
      },
    },
  };

  const mockGoalieProjection: Projection = {
    type: 'goalie',
    playerId: 101,
    stats: {
      scoring: {
        ...mockGoalie.stats.scoring,
      },
      utility: { ...mockGoalie.stats.utility },
    },
  };

  const mockPlayerScore: PlayerScore = {
    fantasyPoints: 500,
    zScore: 2.5,
  };

  const mockActiveColumns: ActiveColumns = {
    scoring: new Set<ScoringStatKey>(['goals', 'assists', 'w', 'svPct']),
    utility: new Set<SkaterUtilityStatKey>(['gp', 'toiPerGame']),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayerRowComponent, StatInputComponent, FormatToiPipe, DecimalPipe],
    }).compileComponents();

    fixture = TestBed.createComponent(PlayerRowComponent);
    component = fixture.componentInstance;
  });

  interface PlayerRowComponentInputs {
    positionRank: number;
    totalRank: number;
    projection: Projection;
    playerScore: PlayerScore;
    player: Player;
    activeColumns: ActiveColumns;
    scoringType: ScoringType;
    decimalSettings: Record<DecimalStatKey, number>;
    isEditing: boolean;
  }

  const setInputs = (overrides: Partial<PlayerRowComponentInputs> = {}) => {
    const inputs: PlayerRowComponentInputs = {
      positionRank: 1,
      totalRank: 1,
      projection: mockSkaterProjection,
      playerScore: mockPlayerScore,
      player: mockSkater,
      activeColumns: mockActiveColumns,
      scoringType: 'category',
      decimalSettings: DEFAULT_DECIMAL_SETTINGS,
      isEditing: false,
      ...overrides,
    };
    Object.keys(inputs).forEach((key) => {
      const inputKey = key as keyof PlayerRowComponentInputs;
      fixture.componentRef.setInput(inputKey, inputs[inputKey]);
    });
    fixture.detectChanges();
  };

  it('should display skater name and positions', () => {
    setInputs();
    const nameCell = fixture.nativeElement.querySelector('.player-name');
    expect(nameCell.textContent).toContain('Connor McDavid (C)');
  });

  it('should display goalie name and position', () => {
    setInputs({
      projection: mockGoalieProjection,
      player: mockGoalie,
    });
    const nameCell = fixture.nativeElement.querySelector('.player-name');
    expect(nameCell.textContent).toContain('Igor Shesterkin (G)');
  });

  it('should display rank and total rank', () => {
    setInputs({
      positionRank: 5,
      totalRank: 10,
    });
    const rankCell = fixture.nativeElement.querySelector('.col-rank');
    expect(rankCell.textContent).toContain('5 (10)');
  });

  it('should display fantasy points when scoringType is points', () => {
    setInputs({ scoringType: 'points' });
    const fanPtsCell = fixture.nativeElement.querySelector('.fan-pts-cell');
    expect(fanPtsCell.textContent).toContain('500');
  });

  it('should display skater stats and "-" for goalie stats', () => {
    setInputs();
    const tds = fixture.nativeElement.querySelectorAll('td');

    expect(tds[2].querySelector('input')?.value).toEqual('82'); // gp
    expect(tds[3].querySelector('input')?.value).toEqual('22:00'); // toi
    expect(tds[4].querySelector('input')?.value).toEqual('64'); // goals
    expect(tds[5].querySelector('input')?.value).toEqual('89'); // assists
    expect(tds[6].textContent.trim()).toEqual('-'); // w
    expect(tds[7].textContent.trim()).toEqual('-'); // svPct
  });

  it('should display goalie stats and "-" for skater stats', () => {
    setInputs({
      projection: mockGoalieProjection,
      player: mockGoalie,
    });
    const tds = fixture.nativeElement.querySelectorAll('td');

    expect(tds[2].querySelector('input')?.value).toEqual('58'); // gp
    expect(tds[3].textContent.trim()).toEqual('-'); // toi
    expect(tds[4].textContent.trim()).toEqual('-'); // goals
    expect(tds[5].textContent.trim()).toEqual('-'); // assists
    expect(tds[6].querySelector('input')?.value).toEqual('36'); // w
    expect(tds[7].querySelector('input')?.value).toEqual('0.910'); // svPct, set to 3 decimals
  });

  it('pads a stat out to the decimals its column is set to', () => {
    setInputs({ decimalSettings: { ...DEFAULT_DECIMAL_SETTINGS, goals: 3 } });

    const goalsInput = fixture.nativeElement.querySelectorAll('td')[4].querySelector('input');
    expect(goalsInput.value).toEqual('64.000');
  });

  it('keeps the padding when the cell is entered', () => {
    setInputs({ decimalSettings: { ...DEFAULT_DECIMAL_SETTINGS, goals: 3 } });

    const goalsInput = fixture.nativeElement.querySelectorAll('td')[4].querySelector('input');
    goalsInput.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    expect(goalsInput.value).toEqual('64.000');
  });

  it('leaves a half-typed value alone, then pads it again on blur', () => {
    setInputs({ decimalSettings: { ...DEFAULT_DECIMAL_SETTINGS, goals: 3 } });

    const goalsInput = fixture.nativeElement.querySelectorAll('td')[4].querySelector('input');
    goalsInput.dispatchEvent(new Event('focus'));
    goalsInput.value = '64';
    fixture.detectChanges();

    expect(goalsInput.value).toEqual('64');

    goalsInput.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(goalsInput.value).toEqual('64.000');
  });

  it('corrects a typed value the table stored as something else', () => {
    setInputs({ decimalSettings: { ...DEFAULT_DECIMAL_SETTINGS, goals: 1 } });

    const goalsInput = fixture.nativeElement.querySelectorAll('td')[4].querySelector('input');
    goalsInput.dispatchEvent(new Event('focus'));
    goalsInput.value = '64.06';

    setInputs({
      decimalSettings: { ...DEFAULT_DECIMAL_SETTINGS, goals: 1 },
      projection: {
        ...mockSkaterProjection,
        stats: {
          ...mockSkaterProjection.stats,
          scoring: { ...mockSkaterProjection.stats.scoring, goals: 64.1 },
        },
      },
    });

    expect(goalsInput.value).toEqual('64.1');
  });

  it('offers a touch stepper for the cell being edited, and none of the others', () => {
    setInputs();
    expect(fixture.nativeElement.querySelectorAll('app-stat-stepper')).toHaveLength(0);

    const goalsInput = fixture.nativeElement.querySelectorAll('td')[4].querySelector('input');
    goalsInput.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('app-stat-stepper')).toHaveLength(1);
  });

  it('steps the value from the touch stepper the way an arrow key does', () => {
    setInputs({ decimalSettings: { ...DEFAULT_DECIMAL_SETTINGS, goals: 1 } });
    const spy = vi.spyOn(component.statInput, 'emit');
    const goalsInput = fixture.nativeElement.querySelectorAll('td')[4].querySelector('input');
    goalsInput.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    const [stepDown, stepUp] = fixture.nativeElement.querySelectorAll('app-stat-stepper button');
    stepUp.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    expect(goalsInput.value).toEqual('64.1');
    expect(spy).toHaveBeenCalledTimes(1);

    stepDown.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    stepDown.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    expect(goalsInput.value).toEqual('63.9');
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('steps by the smallest amount the column can show', () => {
    setInputs({ decimalSettings: { ...DEFAULT_DECIMAL_SETTINGS, goals: 1, assists: 0 } });
    const tds = fixture.nativeElement.querySelectorAll('td');

    expect(tds[4].querySelector('input').getAttribute('step')).toEqual('0.1');
    expect(tds[5].querySelector('input').getAttribute('step')).toEqual('1');
  });

  it('leaves defencemen points to defencemen — a forward has none of the category', () => {
    const defenceColumns: ActiveColumns = {
      utility: new Set<SkaterUtilityStatKey>(['gp']),
      scoring: new Set<ScoringStatKey>(['defPoints']),
    };

    setInputs({ activeColumns: defenceColumns });
    expect(fixture.nativeElement.querySelectorAll('td')[3].textContent.trim()).toEqual('-');

    setInputs({
      activeColumns: defenceColumns,
      player: { ...mockSkater, positions: new Set<SkaterPosition>(['D']) },
    });
    expect(fixture.nativeElement.querySelectorAll('td')[3].querySelector('input')).not.toBeNull();
  });

  it('should emit statInput on input change', () => {
    setInputs();
    const spy = vi.spyOn(component.statInput, 'emit');

    const input = fixture.nativeElement.querySelector('input[type="number"]');
    input.value = '70';
    input.dispatchEvent(new Event('input'));

    expect(spy).toHaveBeenCalled();
  });

  it('should apply editing-row class when isEditing is true', () => {
    setInputs({ isEditing: true });
    expect(fixture.nativeElement.classList.contains('editing-row')).toEqual(true);
  });
});
