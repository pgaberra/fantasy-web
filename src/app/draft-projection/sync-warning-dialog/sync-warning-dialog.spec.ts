import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { SyncWarningDialogComponent } from './sync-warning-dialog';

describe('SyncWarningDialogComponent', () => {
  beforeEach(() => MockBuilder(SyncWarningDialogComponent));

  const renderAsking = () =>
    MockRender(SyncWarningDialogComponent, {
      leagueName: 'HHL',
      subject: 'draft',
      change: 'a pick',
      cancelLabel: 'Leave the pick and stay in sync',
      confirmLabel: 'Change the pick',
    });

  it('names the league, the draft and the change', () => {
    const text = renderAsking().nativeElement.textContent;

    expect(text).toContain('Changing a pick will disconnect this draft from');
    expect(text).toContain('HHL');
  });

  it('cancels from the cross and its second button, and goes on from the first', () => {
    const fixture = renderAsking();
    const component = fixture.point.componentInstance;
    const events: string[] = [];
    component.cancelled.subscribe(() => events.push('cancelled'));
    component.confirm.subscribe(() => events.push('confirm'));

    const close = fixture.nativeElement.querySelector('.dialog-close') as HTMLButtonElement;
    // Labelled, because a bare cross elsewhere in the app means "never mind": here it keeps the league.
    expect(close.getAttribute('aria-label')).toEqual('Leave the pick and stay in sync');
    close.click();
    ngMocks.click(ngMocks.find('.btn-secondary'));
    ngMocks.click(ngMocks.find('.btn-primary'));

    expect(ngMocks.find('.btn-primary').nativeElement.textContent.trim()).toEqual(
      'Change the pick',
    );
    expect(events).toEqual(['cancelled', 'cancelled', 'confirm']);
  });
});
