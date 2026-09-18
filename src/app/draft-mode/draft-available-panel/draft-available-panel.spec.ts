import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '@angular/core';
import { DraftAvailablePanelComponent } from './draft-available-panel';
import { PositionFilter } from '../../models/projection.model';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';
import { ScoredProjection } from '../../models/projection.model';

describe('DraftAvailablePanelComponent', () => {
  const showAvatars = signal(true);

  beforeEach(() => {
    showAvatars.set(true);
    return MockBuilder(DraftAvailablePanelComponent).mock(DraftPlayerLookupService, {
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

    /**
     * The label once carried the team's name, and a league's team can be called anything: a
     * "Krillans Puckvilsna Trotjänare" made every row's button wide enough to cut the player's
     * own name to its first letter.
     */
    it('reads Draft however long the name of the team it drafts for', () => {
      const fixture = render('Draft for Krillans Puckvilsna Trotjänare', false);

      expect(button(fixture).textContent?.trim()).toEqual('Draft');
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
      availableRanks: new Map([[97, 157]]),
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
