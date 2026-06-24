import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { SyncWarningDialogComponent } from './sync-warning-dialog';

describe('SyncWarningDialogComponent', () => {
  beforeEach(() => MockBuilder(SyncWarningDialogComponent));

  it('renders the league name', () => {
    const fixture = MockRender(SyncWarningDialogComponent, { leagueName: 'HHL' });

    expect(fixture.nativeElement.textContent).toContain('HHL');
  });

  it('emits reSync and confirm from the two buttons', () => {
    const fixture = MockRender(SyncWarningDialogComponent, { leagueName: 'HHL' });
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
