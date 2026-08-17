import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { AdminComponent } from './admin';
import { AdminService } from '../services/admin.service';

describe('AdminComponent', () => {
  const yahooConnection = vi.fn();
  const connectYahoo = vi.fn();
  const triggerSync = vi.fn();
  const syncRuns = vi.fn();
  const probeYahooAccess = vi.fn();

  beforeEach(() => {
    yahooConnection.mockReturnValue(of({ connected: true }));
    connectYahoo.mockReturnValue(of({ authorizeUrl: 'https://example.com/consent' }));
    triggerSync.mockReturnValue(of({ status: 'accepted' }));
    syncRuns.mockReturnValue(of([]));
    probeYahooAccess.mockReturnValue(
      of({ ok: true, path: '/game/nhl/players', status: 200, players: 25 }),
    );
    return MockBuilder(AdminComponent).mock(AdminService, {
      yahooConnection,
      connectYahoo,
      triggerSync,
      syncRuns,
      probeYahooAccess,
    });
  });

  it('shows the connected status from the service', () => {
    const fixture = MockRender(AdminComponent);

    expect(fixture.nativeElement.textContent).toContain('Connected');
  });

  it('triggers a sync when the sync button is clicked', () => {
    const fixture = MockRender(AdminComponent);

    ngMocks.find<HTMLButtonElement>('.btn-secondary').nativeElement.click();
    fixture.detectChanges();

    expect(triggerSync).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Sync started');
  });

  /**
   * The probe exists to make a refusal readable, so a refusal is a result and not an error —
   * showing "could not reach the probe" over Yahoo's own 403 would waste the whole feature.
   */
  describe('the Yahoo access probe', () => {
    const runProbe = (fixture: ReturnType<typeof MockRender<AdminComponent>>) => {
      const component = fixture.point.componentInstance;
      component.runProbe();
      fixture.detectChanges();
    };

    it('shows what Yahoo refused, in its own words', () => {
      probeYahooAccess.mockReturnValue(
        of({
          ok: false,
          path: '/game/nhl/players;start=0;count=25/stats;type=season;season=2026',
          status: 403,
          error: 'This application is not authorized to perform this action.',
        }),
      );
      const fixture = MockRender(AdminComponent);

      runProbe(fixture);

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Refused');
      expect(text).toContain('HTTP 403');
      expect(text).toContain('This application is not authorized to perform this action.');
      expect(text).toContain('season=2026');
      expect(text).not.toContain('Could not reach the probe');
    });

    it('shows how many players came back when Yahoo served it', () => {
      const fixture = MockRender(AdminComponent);

      runProbe(fixture);

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Yahoo served it');
      expect(text).toContain('25 players');
    });

    it('sends no season filter when the season is left empty', () => {
      const fixture = MockRender(AdminComponent);

      runProbe(fixture);

      expect(probeYahooAccess).toHaveBeenCalledWith('nhl', undefined);
    });

    it('falls back to nhl when the game key is blanked out', () => {
      const fixture = MockRender(AdminComponent);
      fixture.point.componentInstance.probeGameKey.set('   ');

      runProbe(fixture);

      expect(probeYahooAccess).toHaveBeenCalledWith('nhl', undefined);
    });
  });
});
