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
  const listEditable = vi.fn();
  const navigate = vi.fn();
  const username = signal<string | null>(null);
  const locked = signal(false);
  const aiProjection = signal(true);

  beforeEach(() => {
    listEditable.mockReset();
    navigate.mockClear();
    username.set(null);
    locked.set(false);
    aiProjection.set(true);
    return MockBuilder(HomeComponent)
      .mock(ProjectionStorageService, { listEditable })
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

  const headings = (fixture: { nativeElement: HTMLElement }) =>
    Array.from(fixture.nativeElement.querySelectorAll<HTMLElement>('.feature h2')).map((h) =>
      h.textContent?.trim(),
    );

  it('welcomes a new account with every feature and no way in singled out', async () => {
    listEditable.mockReturnValue(of([]));
    const fixture = await renderFixture();

    expect(text(fixture, 'h1')).toEqual('Welcome to SlapStat');
    expect(headings(fixture)).toEqual(['Projections', 'Draft mode', 'AI projection', "Who's Hot"]);
    expect(fixture.nativeElement.querySelector('.resume')).toBeNull();
    expect(text(fixture, '.feature-actions')).not.toContain('My projections');
  });

  it('leads a returning user with the projection they updated last', async () => {
    username.set('alex');
    listEditable.mockReturnValue(
      of([
        summary('old', 'projection', 'none', '2026-06-01T00:00:00Z'),
        summary('new', 'imported', 'in_progress', '2026-06-10T00:00:00Z'),
      ]),
    );
    const fixture = await renderFixture();

    expect(text(fixture, 'h1')).toEqual('Welcome back, alex');
    expect(text(fixture, '.resume-name')).toContain('Board new');
    expect(text(fixture, '.resume-actions .btn-primary')).toEqual('Resume draft');
    expect(text(fixture, '.feature-actions .feature-link')).toEqual('My projections (2)');
  });

  it('sells the AI projection to an account it is locked for, and offers it to one that has it', async () => {
    listEditable.mockReturnValue(of([]));
    locked.set(true);
    const fixture = await renderFixture();
    expect(text(fixture, '.feature-ai .btn')).toEqual('See Premium');

    locked.set(false);
    fixture.detectChanges();
    expect(text(fixture, '.feature-ai .btn')).toEqual('Create projection');
    expect(text(fixture, '.feature-ai .feature-link')).toEqual('Open Draft mode');
  });

  it('drops the AI projection card where the environment does not serve the model', async () => {
    listEditable.mockReturnValue(of([]));
    aiProjection.set(false);
    const fixture = await renderFixture();

    expect(fixture.nativeElement.querySelector('.feature-ai')).toBeNull();
    expect(headings(fixture)).not.toContain('AI projection');
  });

  it('shows the failure instead of the features when the list does not load', async () => {
    listEditable.mockReturnValue(throwError(() => new Error('down')));
    const fixture = await renderFixture();

    expect(fixture.nativeElement.querySelector('app-error-state')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.features')).toBeNull();
  });

  it('opens a board imported from a share link in the editor', async () => {
    listEditable.mockReturnValue(of([]));
    const fixture = await renderFixture();

    fixture.point.componentInstance.onImported({ id: 'imp1' } as never);

    expect(navigate).toHaveBeenCalledWith(['/projections', 'imp1']);
  });
});
