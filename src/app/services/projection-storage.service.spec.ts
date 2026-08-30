import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { ProjectionStorageService } from './projection-storage.service';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';

describe('ProjectionStorageService', () => {
  let service: ProjectionStorageService;
  let http: HttpTestingController;

  const summary = (
    id: string,
    kind: ProjectionSummaryResponse['kind'],
  ): ProjectionSummaryResponse => ({
    id,
    name: `Projection ${id}`,
    kind,
    season: '20262027',
    draftStatus: 'none',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
  });

  const stored = [
    summary('p1', 'projection'),
    summary('i1', 'imported'),
    summary('d1', 'preset_draft'),
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ProjectionStorageService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProjectionStorageService);
    http = TestBed.inject(HttpTestingController);
  });

  const respond = () => {
    const request = http.expectOne((candidate) => candidate.url.endsWith('/projections'));
    request.flush(stored);
  };

  it('lists only what the user made as their own projections', async () => {
    const listed = firstValueFrom(service.listProjections());
    respond();

    expect((await listed).map((projection) => projection.id)).toEqual(['p1']);
  });

  /** An imported board is a projection the user owns and can edit; a preset draft is not. */
  it('lists what can be opened in the editor, imported boards included', async () => {
    const listed = firstValueFrom(service.listEditable());
    respond();

    expect((await listed).map((projection) => projection.id)).toEqual(['p1', 'i1']);
  });

  it('keeps the preset draft where that row is the point', async () => {
    const listed = firstValueFrom(service.listWithPresetDrafts());
    respond();

    expect((await listed).map((projection) => projection.id)).toEqual(['p1', 'i1', 'd1']);
  });

  it('clears a draft by saving the projection back without one, and without its players', async () => {
    const cleared = firstValueFrom(service.clearDraft('p1'));

    const read = http.expectOne((candidate) => candidate.url.endsWith('/projections/p1'));
    expect(read.request.method).toEqual('GET');
    read.flush({
      id: 'p1',
      name: 'Projection p1',
      kind: 'projection',
      season: '20262027',
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
      data: {
        settings: { leagueSize: 12 },
        players: [{ playerId: '1' }],
        draft: { teams: [], order: [], picks: [] },
      },
    });

    // The read resolves through a promise before the write is sent, so let the queue drain.
    await new Promise((resolve) => setTimeout(resolve));

    const write = http.expectOne((candidate) => candidate.url.endsWith('/projections/p1'));
    expect(write.request.method).toEqual('PUT');
    // No draft is what clears it; no players is what keeps the stored ~0.5 MB of them.
    expect(write.request.body).toEqual({
      name: 'Projection p1',
      data: { settings: { leagueSize: 12 } },
    });
    write.flush({ id: 'p1' });

    await cleared;
  });
});
