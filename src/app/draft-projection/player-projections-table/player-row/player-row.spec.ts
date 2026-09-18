import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlayerRowComponent } from './player-row';
import { StatInputComponent } from './stat-input/stat-input';
import { PlayerInjury } from '../../../api/models/player-injury';
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
    showHeadshot: boolean;
    activeColumns: ActiveColumns;
    scoringType: ScoringType;
    decimalSettings: Record<DecimalStatKey, number>;
    isEditing: boolean;
    injury?: PlayerInjury | null;
  }

  const setInputs = (overrides: Partial<PlayerRowComponentInputs> = {}) => {
    const inputs: PlayerRowComponentInputs = {
      positionRank: 1,
      totalRank: 1,
      projection: mockSkaterProjection,
      playerScore: mockPlayerScore,
      player: mockSkater,
      showHeadshot: true,
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

  describe('the injury marker', () => {
    const badge = () => fixture.nativeElement.querySelector('.injury-badge');
    /** What the tooltip bubble says while the badge is hovered. */
    const badgeTooltip = () => {
      badge().dispatchEvent(new MouseEvent('mouseenter'));
      TestBed.inject(ApplicationRef).tick();
      return (document.querySelector('.cdk-overlay-container')?.textContent ?? '').trim();
    };

    it('says nothing about a player who is not on the report', () => {
      setInputs();
      expect(badge()).toBeNull();
    });

    it('marks a player who is out and puts the whole report in the tooltip', () => {
      setInputs({
        injury: {
          playerId: 1,
          status: 'Out',
          bodyPart: 'Knee',
          expectedReturn: '2026-11-07',
        },
      });

      expect(badge().textContent.trim()).toBe('OUT');
      expect(badgeTooltip()).toBe('Out, knee, expected back 7 November');
    });

    it('shortens the statuses a roster page already abbreviates', () => {
      setInputs({ injury: { playerId: 1, status: 'Injured Reserve' } });
      expect(badge().textContent.trim()).toBe('IR');

      setInputs({ injury: { playerId: 1, status: 'Day-To-Day' } });
      expect(badge().textContent.trim()).toBe('DTD');

      setInputs({ injury: { playerId: 1, status: 'Suspension' } });
      expect(badge().textContent.trim()).toBe('SUSP');
    });

    it('says only what the report says, when it says little', () => {
      setInputs({ injury: { playerId: 1, status: 'Out' } });

      expect(badgeTooltip()).toBe('Out');
    });
  });

  /** Each chip's position and its colour class, in the order the name cell draws them. */
  const positionChips = () =>
    Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.player-name .pos-chip')).map(
      (chip) =>
        `${chip.textContent?.trim()} ${[...chip.classList].find((name) => name.startsWith('pos--'))}`,
    );

  it('should display skater name and positions', () => {
    setInputs();
    const nameCell = fixture.nativeElement.querySelector('.player-name');
    expect(nameCell.textContent).toContain('Connor McDavid');
    expect(positionChips()).toEqual(['C pos--c']);
  });

  /**
   * On a phone the name's span is cut with an ellipsis, and the chips once sat inside it: every
   * name longer than the column lost its positions with its last letters. Beside the span, they
   * stay whole however long the name.
   */
  it('keeps the positions out of the span that a long name is cut short in', () => {
    setInputs();
    const nameText = fixture.nativeElement.querySelector('.player-name-text') as HTMLElement;

    expect(nameText.textContent?.trim()).toEqual('Connor McDavid');
    expect(nameText.querySelector('.pos-chip')).toBeNull();
    expect(positionChips()).toEqual(['C pos--c']);
  });

  // The same coloured chips the draft board draws, one per position the skater is eligible for.
  it('draws a coloured chip for every position a skater holds', () => {
    setInputs({ player: { ...mockSkater, positions: new Set<SkaterPosition>(['C', 'RW']) } });

    expect(positionChips()).toEqual(['C pos--c', 'RW pos--rw']);
  });

  describe('the headshot', () => {
    const headshot = () => fixture.nativeElement.querySelector('app-player-headshot');

    // A player without a picture still gets the circle, so his name lines up with the rest.
    it('draws initials for a player without a picture while the table shows headshots', () => {
      setInputs({ showHeadshot: true });

      expect(headshot().textContent.trim()).toEqual('CM');
    });

    it('draws nothing beside the name while the table shows no headshots', () => {
      setInputs({ showHeadshot: false });

      expect(headshot()).toBeNull();
      expect(fixture.nativeElement.querySelector('.player-name').textContent).toContain(
        'Connor McDavid',
      );
    });
  });

  it('should display goalie name and position', () => {
    setInputs({
      projection: mockGoalieProjection,
      player: mockGoalie,
    });
    const nameCell = fixture.nativeElement.querySelector('.player-name');
    expect(nameCell.textContent).toContain('Igor Shesterkin');
    expect(positionChips()).toEqual(['G pos--g']);
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

  it('steps by the smallest amount the column can show', () => {
    setInputs({ decimalSettings: { ...DEFAULT_DECIMAL_SETTINGS, goals: 1, assists: 0 } });
    const tds = fixture.nativeElement.querySelectorAll('td');
    const goals = tds[4].querySelector('input') as HTMLInputElement;
    const assists = tds[5].querySelector('input') as HTMLInputElement;
    const goalsBefore = Number(goals.value);
    const assistsBefore = Number(assists.value);

    goals.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    assists.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));

    expect(Number(goals.value)).toBeCloseTo(goalsBefore + 0.1, 10);
    expect(Number(assists.value)).toBeCloseTo(assistsBefore - 1, 10);
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

    const input = fixture.nativeElement.querySelector('input.stat-input');
    input.value = '70';
    input.dispatchEvent(new Event('input'));

    expect(spy).toHaveBeenCalled();
  });

  it('should apply editing-row class when isEditing is true', () => {
    setInputs({ isEditing: true });
    expect(fixture.nativeElement.classList.contains('editing-row')).toEqual(true);
  });
});
