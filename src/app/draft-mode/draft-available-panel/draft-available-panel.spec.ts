import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '@angular/core';
import { DraftAvailablePanelComponent } from './draft-available-panel';
import { PositionFilter } from '../../models/projection.model';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';
import { ScoredProjection } from '../../models/projection.model';
import { StatLabelPipe } from '../../pipes/stat-label.pipe';
import { StatInfoService } from '../../services/stat-info.service';

describe('DraftAvailablePanelComponent', () => {
  const showAvatars = signal(true);

  beforeEach(() => {
    showAvatars.set(true);
    return MockBuilder(DraftAvailablePanelComponent)
      .keep(StatLabelPipe)
      .keep(StatInfoService)
      .mock(DraftPlayerLookupService, {
        showAvatars,
        name: () => 'Connor McDavid',
        team: () => 'EDM',
      });
  });

  function renderPanel(
    selectedPositions: readonly PositionFilter[],
    pageSize = 50,
    availableCount = 0,
  ) {
    return MockRender(DraftAvailablePanelComponent, {
      editingInfo: null,
      searchTerm: '',
      positionFilters: [
        { value: 'ALL', label: 'All' },
        { value: 'C', label: 'C' },
        { value: 'LW', label: 'LW' },
      ],
      selectedPositions,
      showStats: false,
      pageSizeOptions: [
        { label: '50', value: 50 },
        { label: '100', value: 100 },
      ],
      pageSize,
      scoreHeading: 'Value',
      visibleAvailable: [],
      availableCount,
      hasMore: false,
      isMyPick: true,
      isComplete: false,
      scoringType: 'category',
      statColumns: [],
    });
  }

  function chips(fixture: ReturnType<typeof renderPanel>): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.filter-chip'));
  }

  describe('the draft button', () => {
    const row = {
      projection: { playerId: 97 },
      score: { fantasyPoints: 400, zScore: 10.05 },
      qualified: true,
    } as unknown as ScoredProjection;

    const render = (isMyPick: boolean) =>
      MockRender(DraftAvailablePanelComponent, {
        editingInfo: null,
        searchTerm: '',
        positionFilters: [{ value: 'ALL', label: 'All' }],
        selectedPositions: ['ALL'],
        showStats: false,
        pageSizeOptions: [{ label: '50', value: 50 }],
        pageSize: 50,
        scoreHeading: 'Value',
        visibleAvailable: [row],
        availableCount: 1,
        hasMore: false,
        isMyPick,
        isComplete: false,
        scoringType: 'category',
        statColumns: [],
      });

    const button = (fixture: ReturnType<typeof render>): HTMLButtonElement =>
      fixture.nativeElement.querySelector('.row-actions button');
    const buttonDebug = (fixture: ReturnType<typeof render>) =>
      ngMocks.find(fixture, '.row-actions button');

    /**
     * Beside the player the button was a grid column, which cut the label to a few letters and
     * pushed the score heading off the scores. It closes the row instead, under the stats.
     */
    it('puts the button last in the row, after the score', () => {
      const fixture = render(false);

      const rowEl: HTMLElement = fixture.nativeElement.querySelector('.available-row');
      expect(rowEl.lastElementChild?.classList.contains('row-actions')).toBe(true);
    });

    it("reads Draft on another team's pick, with no tooltip", () => {
      const fixture = render(false);

      expect(button(fixture).textContent?.trim()).toEqual('Draft');
      expect(() => ngMocks.input(buttonDebug(fixture), 'appTooltip')).toThrow();
      expect(button(fixture).getAttribute('aria-label')).toEqual('Draft: Connor McDavid');
    });

    it("reads Draft on the user's own pick too", () => {
      const fixture = render(true);

      expect(button(fixture).textContent?.trim()).toEqual('Draft');
      expect(button(fixture).getAttribute('aria-label')).toEqual('Draft: Connor McDavid');
    });
  });

  it("prints the player's place in the available list, not his place among the hits", () => {
    const fixture = MockRender(DraftAvailablePanelComponent, {
      editingInfo: null,
      searchTerm: 'mar',
      positionFilters: [{ value: 'ALL', label: 'All' }],
      selectedPositions: ['ALL'],
      showStats: false,
      pageSizeOptions: [{ label: '50', value: 50 }],
      pageSize: 50,
      scoreHeading: 'Value',
      visibleAvailable: [
        {
          projection: { playerId: 97 },
          score: { fantasyPoints: 100, zScore: 1 },
          qualified: true,
        } as unknown as ScoredProjection,
      ],
      boardRanks: new Map([[97, 157]]),
      availableCount: 1,
      hasMore: false,
      isMyPick: true,
      isComplete: false,
      scoringType: 'category',
      statColumns: [],
    });

    expect(fixture.nativeElement.querySelector('.row-rank').textContent.trim()).toEqual('157');
  });

  /**
   * Label and value side by side ran a league's categories past the row, and the last ones fell
   * to a line of their own. Each stat is a cell with the label over the value, which the
   * stylesheet stacks, so the two have to stay separate elements.
   */
  it('shows each stat as its label with the value under it', () => {
    const fixture = MockRender(DraftAvailablePanelComponent, {
      editingInfo: null,
      searchTerm: '',
      positionFilters: [{ value: 'ALL', label: 'All' }],
      selectedPositions: ['ALL'],
      showStats: true,
      pageSizeOptions: [{ label: '50', value: 50 }],
      pageSize: 50,
      scoreHeading: 'Value',
      visibleAvailable: [
        {
          projection: {
            playerId: 97,
            type: 'skater',
            stats: { utility: {}, scoring: { goals: 48, assists: 98 } },
          },
          score: { fantasyPoints: 100, zScore: 1 },
          qualified: true,
        } as unknown as ScoredProjection,
      ],
      availableCount: 1,
      hasMore: false,
      isMyPick: true,
      isComplete: false,
      scoringType: 'category',
      statColumns: ['goals', 'assists'],
    });

    const cells = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.stat-chip'));

    expect(
      cells.map((cell) => [
        cell.querySelector('.stat-key')?.textContent?.trim(),
        cell.querySelector('.stat-value')?.textContent?.trim(),
      ]),
    ).toEqual([
      ['Goals', '48'],
      ['Assists', '98'],
    ]);
  });

  /**
   * The strip once wrote every rate to two places, so a .915 goalie and a .906 one both read
   * 0.91. A rate takes the decimals the editor gives it; a count stays whole.
   */
  it('writes each rate stat to the decimals the editor uses for it', () => {
    const fixture = MockRender(DraftAvailablePanelComponent, {
      editingInfo: null,
      searchTerm: '',
      positionFilters: [{ value: 'ALL', label: 'All' }],
      selectedPositions: ['ALL'],
      showStats: true,
      pageSizeOptions: [{ label: '50', value: 50 }],
      pageSize: 50,
      scoreHeading: 'Value',
      visibleAvailable: [
        {
          projection: {
            playerId: 31,
            type: 'goalie',
            stats: { utility: {}, scoring: { w: 33.4, gaa: 2.456, svPct: 0.9149 } },
          },
          score: { fantasyPoints: 100, zScore: 1 },
          qualified: true,
        } as unknown as ScoredProjection,
      ],
      availableCount: 1,
      hasMore: false,
      isMyPick: true,
      isComplete: false,
      scoringType: 'category',
      statColumns: ['w', 'gaa', 'svPct'],
    });

    const values = Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll('.stat-value'),
    ).map((cell) => cell.textContent?.trim());

    expect(values).toEqual(['33', '2.46', '0.915']);
  });

  it('marks every chosen position as active', () => {
    const fixture = renderPanel(['C', 'LW']);

    const active = chips(fixture)
      .filter((chip) => chip.classList.contains('active'))
      .map((chip) => chip.textContent?.trim());

    expect(active).toEqual(['C', 'LW']);
  });

  it('prints how many players are still available next to the title', () => {
    const fixture = renderPanel(['ALL'], 50, 412);

    expect(fixture.nativeElement.querySelector('.available-count').textContent.trim()).toEqual(
      '412',
    );
  });

  // The stats switch is a pressed button, not a checkbox: it carries its state as aria-pressed
  // and asks the parent for the opposite of what it shows.
  it('shows the stats toggle as pressed only while stats are on, and emits the flip', () => {
    const fixture = renderPanel(['ALL']);
    const toggled: boolean[] = [];
    fixture.point.componentInstance.statsToggle.subscribe((on: boolean) => toggled.push(on));
    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.toggle-pill');

    expect(toggle.getAttribute('aria-pressed')).toEqual('false');
    toggle.click();
    expect(toggled).toEqual([true]);

    fixture.componentInstance.showStats = true;
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-pressed')).toEqual('true');
    toggle.click();
    expect(toggled).toEqual([true, false]);
  });

  it('emits the chip that was clicked so the parent can toggle it', () => {
    const fixture = renderPanel(['C']);
    const toggled: PositionFilter[] = [];
    fixture.point.componentInstance.positionFilterToggle.subscribe((filter: PositionFilter) =>
      toggled.push(filter),
    );

    chips(fixture)[2].click();

    expect(toggled).toEqual(['LW']);
  });

  // The avatar hides itself; the list has to drop the grid column it sat in, or every row's
  // name would slide into the avatar's narrow slot.
  it('drops the avatar column while the board has no avatars to draw', () => {
    const list = (fixture: ReturnType<typeof renderPanel>): HTMLElement =>
      fixture.nativeElement.querySelector('.available-list');

    expect(list(renderPanel(['ALL'], 50, 1)).classList).not.toContain('available-list--no-avatars');

    showAvatars.set(false);
    expect(list(renderPanel(['ALL'], 50, 1)).classList).toContain('available-list--no-avatars');
  });

  it('selects the current page size in the dropdown', () => {
    const fixture = renderPanel(['ALL']);

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('.page-size-select');

    expect(Array.from(select.options).map((option) => option.textContent?.trim())).toEqual([
      '50',
      '100',
    ]);
    expect(select.value).toEqual('50');
  });
});
