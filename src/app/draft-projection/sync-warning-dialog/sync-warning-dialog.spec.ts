import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { SyncWarningDialogComponent } from './sync-warning-dialog';

describe('SyncWarningDialogComponent', () => {
  beforeEach(() => MockBuilder(SyncWarningDialogComponent));

  it('renders the league name', () => {
    const fixture = MockRender(SyncWarningDialogComponent, {
      leagueName: 'HHL',
      platform: 'Yahoo',
    });

    expect(fixture.nativeElement.textContent).toContain('HHL');
  });

  it('points the re-sync advice at the platform the league lives on', () => {
    const fixture = MockRender(SyncWarningDialogComponent, {
      leagueName: 'Puck Luck Dynasty',
      platform: 'ESPN',
    });

    expect(fixture.nativeElement.textContent).toContain('changed in ESPN');
  });

  it('emits reSync and confirm from the two buttons', () => {
    const fixture = MockRender(SyncWarningDialogComponent, {
      leagueName: 'HHL',
      platform: 'Yahoo',
    });
    const component = fixture.point.componentInstance;
    const events: string[] = [];
    component.reSync.subscribe(() => events.push('reSync'));
    component.confirm.subscribe(() => events.push('confirm'));

    const buttons = ngMocks.findAll('button');
    ngMocks.click(buttons[0]);
    ngMocks.click(buttons[1]);

    expect(events).toEqual(['reSync', 'confirm']);
  });
});
