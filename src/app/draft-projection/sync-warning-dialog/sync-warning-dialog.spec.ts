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

  it('undoes the edit from the cross, which is the only way out that keeps the league', () => {
    const fixture = MockRender(SyncWarningDialogComponent, {
      leagueName: 'HHL',
      platform: 'Yahoo',
    });
    const component = fixture.point.componentInstance;
    let cancelled = 0;
    component.cancelled.subscribe(() => (cancelled += 1));

    const close = fixture.nativeElement.querySelector('.dialog-close') as HTMLButtonElement;
    // Labelled, because a bare cross elsewhere in the app means "never mind" — here it acts.
    expect(close.getAttribute('aria-label')).toContain('Undo my change');
    close.click();

    expect(cancelled).toEqual(1);
  });

  it('names what the primary button does rather than saying Ok', () => {
    const fixture = MockRender(SyncWarningDialogComponent, {
      leagueName: 'HHL',
      platform: 'Yahoo',
    });

    const primary = fixture.nativeElement.querySelector('.btn-primary') as HTMLButtonElement;
    expect(primary.textContent?.trim()).toEqual('Keep my change');
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

    // Picked by role rather than by position: the cross is the first button in the card.
    ngMocks.click(ngMocks.find('.btn-secondary'));
    ngMocks.click(ngMocks.find('.btn-primary'));

    expect(events).toEqual(['reSync', 'confirm']);
  });
});
