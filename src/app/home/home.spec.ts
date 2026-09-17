import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { provideLocationMocks } from '@angular/common/testing';
import { HomeComponent } from './home';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { AccountService } from '../services/account.service';
import { FeatureService } from '../services/feature.service';
import { AiProjectionAccess } from '../shared/premium/ai-projection-access';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';

function summary(
  id: string,
  kind: ProjectionSummaryResponse['kind'],
  draftStatus: ProjectionSummaryResponse['draftStatus'] = 'none',
  updatedAt = '2026-06-01T00:00:00Z',
): ProjectionSummaryResponse {
  return {
    id,
    kind,
    name: `Board ${id}`,
    draftStatus,
    season: '20262027',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt,
  };
}

describe('HomeComponent', () => {
  const listWithPresetDrafts = vi.fn();
  const navigate = vi.fn();
  const username = signal<string | null>(null);
  const locked = signal(false);
  const aiProjection = signal(true);

  beforeEach(() => {
    listWithPresetDrafts.mockReset();
    navigate.mockClear();
    username.set(null);
    locked.set(false);
    aiProjection.set(true);
    return MockBuilder(HomeComponent)
      .mock(ProjectionStorageService, { listWithPresetDrafts })
      .mock(AccountService, { username })
      .mock(FeatureService, { aiProjection })
      .mock(AiProjectionAccess, { locked })
      .provide({ provide: Router, useValue: { navigate } })
      .provide(provideLocationMocks());
  });

  const renderFixture = async () => {
    const fixture = MockRender(HomeComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const text = (fixture: { nativeElement: HTMLElement }, selector: string) =>
    fixture.nativeElement.querySelector<HTMLElement>(selector)?.textContent?.trim() ?? null;

  it('welcomes a new account and leads with creating a projection', async () => {
    listWithPresetDrafts.mockReturnValue(of([]));
    const fixture = await renderFixture();

    expect(text(fixture, 'h1')).toEqual('Welcome to SlapStat');
    expect(text(fixture, '.progress')).toContain('0 of 2 done');
    expect(text(fixture, '.step-projection .step-action')).toContain('Create projection');
    expect(fixture.nativeElement.querySelector('.latest')).toBeNull();
  });

  it('counts a started draft as done even when it was drafted from a preset', async () => {
    // A preset draft is not a projection to list, but starting one is using Draft mode.
    listWithPresetDrafts.mockReturnValue(of([summary('preset1', 'preset_draft', 'in_progress')]));
    const fixture = await renderFixture();

    expect(text(fixture, '.progress')).toContain('1 of 2 done');
    expect(fixture.nativeElement.querySelector('.step-draft.done')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.step-projection.done')).toBeNull();
    expect(fixture.nativeElement.querySelector('.latest')).toBeNull();
  });

  it('hides the checklist once both steps are done', async () => {
    listWithPresetDrafts.mockReturnValue(of([summary('p1', 'projection', 'finished')]));
    const fixture = await renderFixture();

    expect(fixture.nativeElement.querySelector('.draft-prep')).toBeNull();
  });

  it('leads a returning user with the projection they updated last', async () => {
    username.set('alex');
    listWithPresetDrafts.mockReturnValue(
      of([
        summary('old', 'projection', 'none', '2026-06-01T00:00:00Z'),
        summary('new', 'imported', 'in_progress', '2026-06-10T00:00:00Z'),
        summary('preset1', 'preset_draft', 'in_progress', '2026-06-20T00:00:00Z'),
      ]),
    );
    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;

    expect(text(fixture, 'h1')).toEqual('Welcome back, alex');
    expect(text(fixture, '.latest-name')).toEqual('Board new');
    expect(text(fixture, '.latest-actions .btn-secondary')).toEqual('Resume draft');
    expect(component.others().map((projection) => projection.id)).toEqual(['old']);
    expect(component.hasMoreProjections()).toBe(false);
  });

  it('points at the full list only when there is more than it shows', async () => {
    listWithPresetDrafts.mockReturnValue(
      of(['a', 'b', 'c', 'd', 'e'].map((id) => summary(id, 'projection'))),
    );
    const fixture = await renderFixture();

    expect(fixture.point.componentInstance.others()).toHaveLength(3);
    expect(text(fixture, '.panel-link')).toEqual('See all');
  });

  it('pitches the AI projection only to an account it is locked for', async () => {
    listWithPresetDrafts.mockReturnValue(of([]));
    const fixture = await renderFixture();
    expect(fixture.nativeElement.querySelector('.premium')).toBeNull();

    locked.set(true);
    fixture.detectChanges();
    expect(text(fixture, '.premium h2')).toContain('AI projection');

    // An environment that does not serve the model has nothing to sell.
    aiProjection.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.premium')).toBeNull();
  });

  it('shows the failure instead of an empty checklist when the list does not load', async () => {
    listWithPresetDrafts.mockReturnValue(throwError(() => new Error('down')));
    const fixture = await renderFixture();

    expect(fixture.nativeElement.querySelector('app-error-state')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.draft-prep')).toBeNull();
  });

  it('opens a board imported from a share link in the editor', async () => {
    listWithPresetDrafts.mockReturnValue(of([]));
    const fixture = await renderFixture();

    fixture.point.componentInstance.onImported({ id: 'imp1' } as never);

    expect(navigate).toHaveBeenCalledWith(['/projections', 'imp1']);
  });
});
