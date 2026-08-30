import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { DraftAvailablePanelComponent } from './draft-available-panel';
import { PositionFilter } from '../../models/projection.model';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';

describe('DraftAvailablePanelComponent', () => {
  beforeEach(() => MockBuilder(DraftAvailablePanelComponent).mock(DraftPlayerLookupService));

  function renderPanel(selectedPositions: readonly PositionFilter[], pageSize = 50) {
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
      availableCount: 0,
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
