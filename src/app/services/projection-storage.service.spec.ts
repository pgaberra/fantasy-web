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
    autoNamed: true,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
  });

  const stored = [summary('p1', 'projection'), summary('i1', 'imported'), summary('d1', 'draft')];

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

  /** An imported board is a projection the user owns and can edit; a draft is not. */
  it('lists what can be opened in the editor, imported boards included', async () => {
    const listed = firstValueFrom(service.listEditable());
    respond();

    expect((await listed).map((projection) => projection.id)).toEqual(['p1', 'i1']);
  });

  it('keeps the drafts where those rows are the point', async () => {
    const listed = firstValueFrom(service.listAll());
    respond();

    expect((await listed).map((projection) => projection.id)).toEqual(['p1', 'i1', 'd1']);
  });

  /**
   * The rows the draft ranks by are copied on the server, so the ~0.5 MB of them is exactly what
   * does not travel — the request carries the draft's own league and its setup, nothing else.
   */
  it('starts a draft against a board without sending the board back', async () => {
    const started = firstValueFrom(
      service.startDraft('p1', {
        settings: { leagueSize: 12 } as never,
        players: [],
        draft: { teams: [], order: [], picks: [] },
      }),
    );

    const request = http.expectOne((candidate) => candidate.url.endsWith('/projections/p1/drafts'));
    expect(request.request.method).toEqual('POST');
    expect(request.request.body).toEqual({
      data: {
        settings: { leagueSize: 12 },
        players: [],
        draft: { teams: [], order: [], picks: [] },
      },
    });
    request.flush({ id: 'd2', name: 'Projection p1 (2)' });

    expect((await started).id).toEqual('d2');
  });

  /** A rename sends the name and nothing else: the board stays where it is. */
  it('renames without sending the board with it', async () => {
    const renamed = firstValueFrom(service.renameProjection('d1', 'Mock #3'));

    const request = http.expectOne((candidate) => candidate.url.endsWith('/projections/d1/name'));
    expect(request.request.method).toEqual('PUT');
    expect(request.request.body).toEqual({ name: 'Mock #3', derived: false });
    request.flush(summary('d1', 'draft'));

    await renamed;
  });

  /** A league sync's rename is marked, so the server can decline it or number it. */
  it('marks a name the app derived rather than the user typing it', async () => {
    const renamed = firstValueFrom(service.renameProjection('d1', 'Beer League', true));

    const request = http.expectOne((candidate) => candidate.url.endsWith('/projections/d1/name'));
    expect(request.request.body).toEqual({ name: 'Beer League', derived: true });
    request.flush(summary('d1', 'draft'));

    await renamed;
  });
});
