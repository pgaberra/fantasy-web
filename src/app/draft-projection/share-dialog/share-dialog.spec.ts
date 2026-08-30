import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ShareDialogComponent } from './share-dialog';
import { AccountService } from '../../services/account.service';
import { ProjectionShareService } from '../../services/projection-share.service';
import { NotificationService } from '../../services/notification.service';
import { AccountResponse } from '../../api/models/account-response';
import { ShareLinkResponse } from '../../api/models/share-link-response';
import { SharedPlayer } from '../../api/models/shared-player';

describe('ShareDialogComponent', () => {
  const players: SharedPlayer[] = [
    {
      playerId: 1,
      name: 'Connor McDavid',
      type: 'skater',
      rank: 1,
      value: 412.5,
      stats: { utility: { gp: 82 }, scoring: { goals: 64 } },
    },
  ];

  const link: ShareLinkResponse = {
    token: 'abc123',
    shareUrl: 'https://slapstat.com/s/abc123',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
  };

  const named: AccountResponse = { email: 'owner@example.com', username: 'alex' };
  const nameless: AccountResponse = { email: 'owner@example.com' };

  const getShare = vi.fn();
  const share = vi.fn();
  const load = vi.fn();
  const setUsername = vi.fn();
  const notifyError = vi.fn();

  const notShared = () =>
    throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' }));

  beforeEach(() => {
    for (const spy of [getShare, share, load, setUsername, notifyError]) {
      spy.mockReset();
    }
    getShare.mockReturnValue(notShared());
    share.mockReturnValue(of(link));
    load.mockReturnValue(of(named));
    setUsername.mockReturnValue(of(named));
    return MockBuilder(ShareDialogComponent)
      .mock(ProjectionShareService, { getShare, share })
      .mock(AccountService, { load, setUsername, username: signal<string | null>('alex') })
      .mock(NotificationService, { error: notifyError });
  });

  const render = () =>
    MockRender(ShareDialogComponent, { projectionId: 'p1', players }, { detectChanges: true });

  it('offers to create a link when the projection has never been shared', async () => {
    const fixture = render();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.point.componentInstance.share()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Create link');
  });

  it('publishes straight away when the account already has a name', async () => {
    const fixture = render();
    await fixture.whenStable();

    fixture.point.componentInstance.publish();

    expect(setUsername).not.toHaveBeenCalled();
    expect(share).toHaveBeenCalledWith('p1', players);
  });

  it('asks for a name first when the account has none', async () => {
    load.mockReturnValue(of(nameless));

    const fixture = render();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.point.componentInstance.needsUsername()).toEqual(true);
    expect(fixture.nativeElement.textContent).toContain('Pick a username');
  });

  it('refuses to publish until the chosen name is a valid one', async () => {
    load.mockReturnValue(of(nameless));

    const fixture = render();
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect(component.canPublish()).toEqual(false);
    component.usernameInput.set('a b');
    expect(component.canPublish()).toEqual(false);
    component.usernameInput.set('beerleaguehero');
    expect(component.canPublish()).toEqual(true);
  });

  it('claims the name before publishing', async () => {
    load.mockReturnValue(of(nameless));

    const fixture = render();
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.usernameInput.set('beerleaguehero');

    component.publish();

    expect(setUsername).toHaveBeenCalledWith('beerleaguehero');
    expect(share).toHaveBeenCalledWith('p1', players);
  });

  it('says so plainly when the name is already taken', async () => {
    load.mockReturnValue(of(nameless));
    setUsername.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, statusText: 'Conflict' })),
    );

    const fixture = render();
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.usernameInput.set('alex');

    component.publish();

    expect(component.errorMessage()).toEqual('That name is taken. Try another.');
    expect(share).not.toHaveBeenCalled();
  });

  it('shows the existing link when the projection is already shared', async () => {
    getShare.mockReturnValue(of(link));

    const fixture = render();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.point.componentInstance.share()?.shareUrl).toEqual(
      'https://slapstat.com/s/abc123',
    );
  });
});
