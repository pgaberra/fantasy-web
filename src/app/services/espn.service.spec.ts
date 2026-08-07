import { TestBed } from '@angular/core/testing';
import { MockBuilder } from 'ng-mocks';
import { describe, it, expect, vi } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { Api } from '../api/api';
import { EspnService } from './espn.service';
import { projectionSettings1 } from '../api/fn/espn/projection-settings-1';
import { saveCredentials } from '../api/fn/espn/save-credentials';
import { LeagueProjectionSettingsResponse } from '../api/models/league-projection-settings-response';

describe('EspnService', () => {
  const settings: LeagueProjectionSettingsResponse = {
    scoringType: 'points',
    activeScoringColumns: [],
    activeUtilityColumns: ['gp'],
    rosterSlots: { c: 0, lw: 0, rw: 0, d: 0, util: 0, bn: 0, g: 0 },
    unsupportedStats: [],
    unsupportedRosterCodes: [],
  };

  it('requests a league projection settings by id', async () => {
    const invoke = vi.fn().mockResolvedValue(settings);
    await MockBuilder(EspnService).mock(Api, { invoke });
    const service = TestBed.inject(EspnService);

    const result = await firstValueFrom(service.leagueProjectionSettings('123'));

    expect(result).toEqual(settings);
    expect(invoke).toHaveBeenCalledWith(projectionSettings1, { leagueId: '123' });
  });

  it('saves credentials with the espn_s2 and SWID body', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    await MockBuilder(EspnService).mock(Api, { invoke });
    const service = TestBed.inject(EspnService);

    await firstValueFrom(service.saveCredentials({ espnS2: 's2', swid: '{id}' }));

    expect(invoke).toHaveBeenCalledWith(saveCredentials, { body: { espnS2: 's2', swid: '{id}' } });
  });
});
