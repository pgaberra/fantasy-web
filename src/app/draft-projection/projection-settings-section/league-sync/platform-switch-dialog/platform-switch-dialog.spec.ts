import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformSwitchDialogComponent } from './platform-switch-dialog';

describe('PlatformSwitchDialogComponent', () => {
  beforeEach(() => MockBuilder(PlatformSwitchDialogComponent));

  const renderAsking = () =>
    MockRender(PlatformSwitchDialogComponent, {
      linkedPlatform: 'ESPN',
      leagueName: 'Tampa Bay Pro',
      targetPlatform: 'Yahoo',
    });

  it('names the synced league, its platform and the one switched to', () => {
    const text = renderAsking().nativeElement.textContent;

    expect(text).toContain('Disconnect your ESPN league?');
    expect(text).toContain('Tampa Bay Pro');
    expect(text).toContain('Switching to Yahoo disconnects it.');
    expect(text).toContain('The settings stay as they are until a new league is synced.');
  });

  it('cancels from the cross, Escape and Cancel, and goes on from the other button', () => {
    const fixture = renderAsking();
    const component = fixture.point.componentInstance;
    const events: string[] = [];
    component.cancelled.subscribe(() => events.push('cancelled'));
    component.confirm.subscribe(() => events.push('confirm'));

    const close = fixture.nativeElement.querySelector('.dialog-close') as HTMLButtonElement;
    // Labelled, because a bare cross elsewhere means "never mind": here it keeps the league.
    expect(close.getAttribute('aria-label')).toEqual('Stay on ESPN');
    close.click();
    ngMocks.trigger(ngMocks.find('.dialog-card'), 'keydown', { key: 'Escape' });
    ngMocks.click(ngMocks.find('.btn-secondary'));
    ngMocks.click(ngMocks.find('.btn-primary'));

    expect(ngMocks.find('.btn-primary').nativeElement.textContent.trim()).toEqual(
      'Disconnect and switch',
    );
    expect(events).toEqual(['cancelled', 'cancelled', 'cancelled', 'confirm']);
  });
});
