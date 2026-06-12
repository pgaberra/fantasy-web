import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { Router } from '@angular/router';
import { ProjectionListComponent } from './projection-list';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';

describe('ProjectionListComponent', () => {
  const summaries: ProjectionSummaryResponse[] = [
    {
      id: 'p1',
      name: 'My league',
      season: '20262027',
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
    },
  ];

  const navigate = vi.fn();

  beforeEach(() => {
    navigate.mockClear();
    return MockBuilder(ProjectionListComponent)
      .mock(ProjectionStorageService, {
        listProjections: () => of(summaries),
        deleteProjection: () => of(undefined),
      })
      .provide({ provide: Router, useValue: { navigate } });
  });

  const getComponent = () => MockRender(ProjectionListComponent).point.componentInstance;

  it('loads the saved projections', () => {
    const component = getComponent();
    expect(component.projections()).toEqual(summaries);
    expect(component.isLoading()).toEqual(false);
  });

  it('navigates to the create page', () => {
    const component = getComponent();
    component.createNew();
    expect(navigate).toHaveBeenCalledWith(['/projections/new']);
  });

  it('navigates to edit an existing projection', () => {
    const component = getComponent();
    component.edit('p1');
    expect(navigate).toHaveBeenCalledWith(['/projections', 'p1']);
  });
});
