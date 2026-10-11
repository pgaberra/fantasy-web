import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { SeededProjectionResponse } from '../api/models/seeded-projection-response';
import { ProjectionModelService } from './projection-model.service';

const SEEDED: SeededProjectionResponse = {
  players: [],
  season: 2026,
  modelVersion: 'marcel-v3',
  skaters: 400,
  goalies: 60,
  unmapped: 3,
  goaliesWithoutWorkload: 2,
};

describe('ProjectionModelService', () => {
  let service: ProjectionModelService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProjectionModelService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  function pending() {
    return httpTesting.expectOne((request) => request.url.endsWith('/projection-model/seed'));
  }

  it('passes on what to ask the model for', async () => {
    const seeded = firstValueFrom(service.seed({ skaterLimit: 25, goalieLimit: 10 }));
    const asked = pending();

    expect(asked.request.params.get('skaterLimit')).toEqual('25');
    expect(asked.request.params.get('goalieLimit')).toEqual('10');
    asked.flush(SEEDED);

    expect(await seeded).toEqual(SEEDED);
  });

  /**
   * The create page asks whenever the AI starting point is picked, and on the server a five-row
   * preview costs the same full rebuild as seeding a whole projection.
   */
  it('answers the same question from what the first ask returned', async () => {
    const first = firstValueFrom(service.seed({ skaterLimit: 25, goalieLimit: 10 }));
    pending().flush(SEEDED);
    await first;

    const second = await firstValueFrom(service.seed({ skaterLimit: 25, goalieLimit: 10 }));

    httpTesting.expectNone(() => true);
    expect(second).toEqual(SEEDED);
  });

  it('asks again for a different slice of the board', async () => {
    const first = firstValueFrom(service.seed({ skaterLimit: 25, goalieLimit: 10 }));
    pending().flush(SEEDED);
    await first;

    const whole = firstValueFrom(service.seed());
    pending().flush(SEEDED);

    expect(await whole).toEqual(SEEDED);
  });

  /** A held error would outlive the outage that caused it: the next caller must get a real ask. */
  it('does not keep a failed ask', async () => {
    const failed = firstValueFrom(service.seed({ skaterLimit: 25 }));
    pending().flush('down', { status: 502, statusText: 'Bad Gateway' });
    await expect(failed).rejects.toBeDefined();

    const retried = firstValueFrom(service.seed({ skaterLimit: 25 }));
    pending().flush(SEEDED);

    expect(await retried).toEqual(SEEDED);
  });

  /** The two AI presets are two boards: an answer for one is not an answer for the other. */
  it('keeps the rest of the season apart from the whole season', async () => {
    const whole = firstValueFrom(service.seed({ skaterLimit: 25, source: 'model' }));
    const rest = firstValueFrom(service.seed({ skaterLimit: 25, source: 'rest_of_season' }));
    const asked = httpTesting.match((request) => request.url.endsWith('/projection-model/seed'));
    expect(asked.map((request) => request.request.params.get('source'))).toEqual([
      'model',
      'rest_of_season',
    ]);
    asked[0].flush(SEEDED);
    asked[1].flush({ ...SEEDED, modelVersion: 'marcel-v115' });

    expect((await whole).modelVersion).toBe('marcel-v3');
    expect((await rest).modelVersion).toBe('marcel-v115');
  });

  it("asks for the rest of the season's board by name", async () => {
    const board = { players: [] };
    const rest = firstValueFrom(service.board('rest_of_season'));
    const asked = httpTesting.expectOne((request) =>
      request.url.endsWith('/projection-model/board'),
    );
    expect(asked.request.params.get('source')).toBe('rest_of_season');
    asked.flush(board);
    expect(await rest).toEqual(board);
  });

  /** A preview of what Create writes must be as fresh as Create, which asks the server each time. */
  it('asks for the board Create would write afresh every time', async () => {
    const board = {
      players: [
        { playerId: 7, type: 'goalie' as const, stats: { utility: {}, scoring: { w: 38 } } },
      ],
    };
    const first = firstValueFrom(service.board());
    httpTesting
      .expectOne((request) => request.url.endsWith('/projection-model/board'))
      .flush(board);
    expect(await first).toEqual(board);

    const second = firstValueFrom(service.board());
    httpTesting
      .expectOne((request) => request.url.endsWith('/projection-model/board'))
      .flush(board);
    expect(await second).toEqual(board);
  });
});
