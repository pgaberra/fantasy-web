import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { CookieRepair, DraftFollowConnectComponent } from './draft-follow-connect';
import { EspnService } from '../../services/espn.service';
import { LeagueProjectionSettingsResponse } from '../../api/models/league-projection-settings-response';

describe('DraftFollowConnectComponent', () => {
  const settings: LeagueProjectionSettingsResponse = {
    scoringType: 'points',
    statWeights: { goals: 3 },
    activeScoringColumns: ['goals'],
    activeUtilityColumns: ['gp'],
    rosterSlots: { c: 2, lw: 2, rw: 2, w: 0, f: 0, d: 4, util: 1, bn: 4, g: 2 },
    unsupportedRosterCodes: [],
    unsupportedStats: [],
    leagueName: 'Pond League',
  };

  const repair: CookieRepair = { leagueId: '123', reason: 'SlapStat needs your cookies.' };

  const render = async (espn: Partial<EspnService> = {}) => {
    await MockBuilder(DraftFollowConnectComponent).mock(EspnService, {
      leagueProjectionSettings: () => of(settings),
      saveCredentials: () => of(undefined),
      ...espn,
    });
    const fixture = MockRender(DraftFollowConnectComponent, { repair });
    await fixture.whenStable();
    return fixture;
  };

  const repairedFrom = (component: DraftFollowConnectComponent) => {
    const repaired = vi.fn<() => void>();
    component.repaired.subscribe(repaired);
    return repaired;
  };

  const typed = (value: string) => ({ target: { value } }) as unknown as Event;

  const pasteCookies = (component: DraftFollowConnectComponent) => {
    component.onEspnS2Input(typed(' s2 '));
    component.onSwidInput(typed('{swid}'));
  };

  it('asks only for the cookies of the league it was given, and names why', async () => {
    const fixture = await render();
    const component = fixture.point.componentInstance;
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('.modal-title')?.textContent?.trim()).toBe('Add your ESPN cookies');
    expect(page.querySelector('.modal-text')?.textContent?.trim()).toBe(
      'SlapStat needs your cookies.',
    );
    const leagueId = page.querySelector<HTMLInputElement>('.link-field > .link-input');
    expect(leagueId?.value).toBe('123');
    expect(leagueId?.readOnly).toBe(true);
    expect(component.canSave()).toBe(false);
  });

  it('wants both cookies before it goes on', async () => {
    const saveCredentials = vi.fn(() => of(undefined));
    const component = (await render({ saveCredentials })).point.componentInstance;

    component.onEspnS2Input(typed('s2'));
    component.save();

    expect(component.canSave()).toBe(false);
    expect(saveCredentials).not.toHaveBeenCalled();

    component.onSwidInput(typed('{swid}'));
    expect(component.canSave()).toBe(true);
  });

  it('saves the pasted cookies, reads the league with them, and says it is repaired', async () => {
    const saveCredentials = vi.fn(() => of(undefined));
    const leagueProjectionSettings = vi.fn(() => of(settings));
    const component = (await render({ saveCredentials, leagueProjectionSettings })).point
      .componentInstance;
    const repaired = repairedFrom(component);

    pasteCookies(component);
    component.save();

    expect(saveCredentials).toHaveBeenCalledWith({ espnS2: 's2', swid: '{swid}' });
    expect(leagueProjectionSettings).toHaveBeenCalledWith('123');
    expect(repaired).toHaveBeenCalledOnce();
  });

  it('says ESPN refused the cookies, and offers nothing to follow', async () => {
    const component = (
      await render({
        leagueProjectionSettings: () => throwError(() => new HttpErrorResponse({ status: 400 })),
      })
    ).point.componentInstance;
    const repaired = repairedFrom(component);

    pasteCookies(component);
    component.save();

    expect(component.settingsFailed()).toBe(false);
    expect(component.error()).toBe(
      'ESPN did not accept those cookies. Check the league ID and make sure espn_s2 and SWID were copied in full.',
    );
    expect(repaired).not.toHaveBeenCalled();
  });

  it('says so when ESPN knows no such league', async () => {
    const component = (
      await render({
        leagueProjectionSettings: () => throwError(() => new HttpErrorResponse({ status: 404 })),
      })
    ).point.componentInstance;

    pasteCookies(component);
    component.save();

    expect(component.settingsFailed()).toBe(false);
    expect(component.error()).toBe('No ESPN league found for that id.');
  });

  it('says so when the settings cannot be read, and still offers the picks', async () => {
    const component = (
      await render({
        leagueProjectionSettings: () => throwError(() => new HttpErrorResponse({ status: 500 })),
      })
    ).point.componentInstance;
    const repaired = repairedFrom(component);

    pasteCookies(component);
    component.save();

    expect(component.settingsFailed()).toBe(true);
    expect(component.error()).toBe(
      "Couldn't read this league's settings. Its picks can still be followed.",
    );
    expect(repaired).not.toHaveBeenCalled();

    component.followAnyway();
    expect(repaired).toHaveBeenCalledOnce();
  });

  it('closes without a word to ESPN when cancelled', async () => {
    const saveCredentials = vi.fn(() => of(undefined));
    const component = (await render({ saveCredentials })).point.componentInstance;
    const cancelled = vi.fn<() => void>();
    component.cancelled.subscribe(cancelled);

    component.cancel();

    expect(cancelled).toHaveBeenCalledOnce();
    expect(saveCredentials).not.toHaveBeenCalled();
  });
});
