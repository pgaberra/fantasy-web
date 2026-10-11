import { TestBed } from '@angular/core/testing';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LeaguesResponse } from '../../api/models/leagues-response';
import { EspnLeagueSyncComponent } from '../../draft-projection/projection-settings-section/espn-league-sync/espn-league-sync';
import { ChosenLeague, LeagueChoiceService } from '../../services/league-choice.service';
import { YahooConnectReturnService } from '../../services/yahoo-connect-return.service';
import { YahooService } from '../../services/yahoo.service';
import { Platform, PlatformTabsComponent } from '../../shared/platform-tabs/platform-tabs';
import { YahooLeaguePicker } from '../../shared/yahoo-league-picker';
import { LeagueFieldComponent } from './league-field';

describe('LeagueFieldComponent', () => {
  const myLeagues = vi.fn<() => Observable<LeaguesResponse>>();
  const connectionStatus = vi.fn<() => Observable<{ connected: boolean }>>();
  const originalEspnLeagues = environment.espnLeaguesEnabled;

  beforeEach(() => {
    localStorage.clear();
    environment.espnLeaguesEnabled = true;
    myLeagues.mockReset();
    myLeagues.mockReturnValue(
      of<LeaguesResponse>({
        leagues: [
          { leagueKey: '465.l.9', name: 'The Gordie Howes' },
          { leagueKey: '465.l.2', name: 'Work League' },
        ],
      }),
    );
    connectionStatus.mockReset();
    connectionStatus.mockReturnValue(of({ connected: true }));
    return MockBuilder(LeagueFieldComponent)
      .keep(PlatformTabsComponent)
      .keep(LeagueChoiceService)
      .provide(YahooLeaguePicker)
      .mock(YahooService, { myLeagues, connectionStatus } as never)
      .mock(YahooConnectReturnService);
  });

  afterEach(() => {
    environment.espnLeaguesEnabled = originalEspnLeagues;
  });

  /** The field rendered on a tab, with the page's picker started as the page starts it. */
  async function render(platform: Platform = 'yahoo', espnLeague: ChosenLeague | null = null) {
    const fixture = MockRender(LeagueFieldComponent, { platform, espnLeague });
    fixture.point.componentInstance.picker.start();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const remembered = () => TestBed.inject(LeagueChoiceService).league();
  const picker = () => TestBed.inject(YahooLeaguePicker);

  function remember(league: ChosenLeague): void {
    localStorage.setItem('slapstat.league', JSON.stringify(league));
  }

  it('offers the Yahoo leagues on the account and remembers the one picked', async () => {
    const fixture = await render();
    const select = fixture.nativeElement.querySelector('.field-select') as HTMLSelectElement;

    expect(Array.from(select.options).map((option) => option.text.trim())).toEqual([
      'Select a league…',
      'The Gordie Howes',
      'Work League',
    ]);
    select.value = '465.l.2';
    select.dispatchEvent(new Event('change'));

    expect(picker().selectedKey()).toBe('465.l.2');
    expect(remembered()).toEqual({ platform: 'YAHOO', leagueId: '465.l.2', name: 'Work League' });
  });

  it('opens on the league last chosen anywhere', async () => {
    remember({ platform: 'YAHOO', leagueId: '465.l.9', name: 'The Gordie Howes' });
    const fixture = await render();
    const select = fixture.nativeElement.querySelector('.field-select') as HTMLSelectElement;

    expect(select.value).toBe('465.l.9');
  });

  it('lets go of a remembered league the account no longer lists', async () => {
    remember({ platform: 'YAHOO', leagueId: '465.l.1', name: 'Gone League' });
    await render();

    expect(picker().selectedKey()).toBeNull();
    expect(remembered()).toBeNull();
  });

  it('forgets the league when the placeholder is picked again', async () => {
    remember({ platform: 'YAHOO', leagueId: '465.l.9', name: 'The Gordie Howes' });
    const fixture = await render();
    const select = fixture.nativeElement.querySelector('.field-select') as HTMLSelectElement;

    select.value = '';
    select.dispatchEvent(new Event('change'));

    expect(remembered()).toBeNull();
  });

  it('offers Yahoo and ESPN tabs, and the ESPN card under ESPN', async () => {
    const fixture = await render();
    const tabs = fixture.nativeElement.querySelectorAll('.provider-tab');
    expect(tabs).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('app-espn-league-sync')).toBeNull();

    (tabs[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.point.componentInstance.platform()).toBe('espn');
    expect(fixture.nativeElement.querySelector('app-espn-league-sync')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.field-select')).toBeNull();
  });

  it('reads the ESPN league the card has checked with ESPN', async () => {
    const fixture = await render('espn');

    ngMocks.findInstance(EspnLeagueSyncComponent).synced.emit({
      leagueId: '12345',
      leagueName: 'Office League',
      settings: {} as never,
    });

    expect(fixture.point.componentInstance.espnLeague()).toEqual({
      platform: 'ESPN',
      leagueId: '12345',
      name: 'Office League',
    });
  });

  it('starts the ESPN card on the league being read, so its button is not the next step', async () => {
    await render('espn', { platform: 'ESPN', leagueId: '12345', name: 'Office League' });

    expect(ngMocks.findInstance(EspnLeagueSyncComponent).lastLeagueId()).toBe('12345');
  });

  it('offers no tabs where ESPN leagues are not offered', async () => {
    environment.espnLeaguesEnabled = false;
    const fixture = await render();

    expect(fixture.nativeElement.querySelector('.provider-tab')).toBeNull();
    expect(fixture.nativeElement.querySelector('.field-select')).not.toBeNull();
  });

  it('offers to connect Yahoo where the account is not connected', async () => {
    connectionStatus.mockReturnValue(of({ connected: false }));
    const fixture = await render();

    expect(ngMocks.formatText(fixture)).toContain('Connect Yahoo account');
    expect(fixture.nativeElement.querySelector('.field-select')).toBeNull();
  });
});
