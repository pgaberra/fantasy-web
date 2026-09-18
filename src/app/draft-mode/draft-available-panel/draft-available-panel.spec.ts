import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '@angular/core';
import { DraftAvailablePanelComponent } from './draft-available-panel';
import { PositionFilter } from '../../models/projection.model';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';
import { ScoredProjection } from '../../models/projection.model';
import { StatLabelPipe } from '../../pipes/stat-label.pipe';

describe('DraftAvailablePanelComponent', () => {
  const showAvatars = signal(true);

  beforeEach(() => {
    showAvatars.set(true);
    return MockBuilder(DraftAvailablePanelComponent)
      .keep(StatLabelPipe)
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
      draftLabel: 'Draft',
      scoringType: 'category',
      statColumns: [],
    });
  }

  function chips(fixture: ReturnType<typeof renderPanel>): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.pos-filter-chip'));
  }

  describe('the draft button', () => {
    const row = {
      projection: { playerId: 97 },
      score: { fantasyPoints: 400, zScore: 10.05 },
      qualified: true,
    } as unknown as ScoredProjection;

    const render = (draftLabel: string, isMyPick: boolean) =>
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
        draftLabel,
        scoringType: 'category',
        statColumns: [],
      });

    const button = (fixture: ReturnType<typeof render>): HTMLButtonElement =>
      fixture.nativeElement.querySelector('.row-actions button');
    const buttonDebug = (fixture: ReturnType<typeof render>) =>
      ngMocks.find(fixture, '.row-actions button');

    /**
     * A league's team can be called anything: an uncapped "Krillans Puckvilsna Trotjänare" made
     * every row's button wide enough to cut the player's own name to its first letter. The label
     * sits in .draft-label, which the stylesheet caps and cuts with an ellipsis.
     */
    it('names the team it drafts for, inside the capped label', () => {
      const fixture = render('Draft for Krillans Puckvilsna Trotjänare', false);

      const label = button(fixture).querySelector('.draft-label');
      expect(label?.textContent?.trim()).toEqual('Draft for Krillans Puckvilsna Trotjänare');
      expect(button(fixture).textContent?.trim()).toEqual(label?.textContent?.trim());
    });

    it('gives the whole label in the tooltip, since the button may cut it', () => {
      const fixture = render('Draft for Krillans Puckvilsna Trotjänare', false);

      expect(ngMocks.input(buttonDebug(fixture), 'appTooltip')).toEqual(
        'Draft for Krillans Puckvilsna Trotjänare',
      );
    });

    it("has no tooltip on the user's own pick, where Draft is the whole label", () => {
      const fixture = render('Draft', true);

      expect(ngMocks.input(buttonDebug(fixture), 'appTooltip')).toBeNull();
    });

    it('still names that team to a screen reader, with the player', () => {
      const fixture = render('Draft for Krillans Puckvilsna Trotjänare', false);

      expect(button(fixture).getAttribute('aria-label')).toEqual(
        'Draft for Krillans Puckvilsna Trotjänare: Connor McDavid',
      );
    });

    it("reads Draft on the user's own pick too", () => {
      const fixture = render('Draft', true);

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
      draftLabel: 'Draft',
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
      draftLabel: 'Draft',
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

  it('marks every chosen position as active', () => {
    const fixture = renderPanel(['C', 'LW']);

    const active = chips(fixture)
      .filter((chip) => chip.classList.contains('active'))
      .map((chip) => chip.textContent?.trim());

    expect(active).toEqual(['C', 'LW']);
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
