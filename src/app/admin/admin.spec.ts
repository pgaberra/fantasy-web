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

  beforeEach(() => {
    yahooConnection.mockReturnValue(of({ connected: true }));
    connectYahoo.mockReturnValue(of({ authorizeUrl: 'https://example.com/consent' }));
    triggerSync.mockReturnValue(of({ status: 'accepted' }));
    syncRuns.mockReturnValue(of([]));
    return MockBuilder(AdminComponent).mock(AdminService, {
      yahooConnection,
      connectYahoo,
      triggerSync,
      syncRuns,
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
});
