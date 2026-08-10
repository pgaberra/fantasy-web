import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ShareDialogComponent } from './share-dialog';
import { ProjectionShareService } from '../../services/projection-share.service';
import { NotificationService } from '../../services/notification.service';
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
    authorAlias: 'Alex',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
  };

  const getShare = vi.fn();
  const share = vi.fn();
  const unshare = vi.fn();
  const notifyError = vi.fn();

  const notShared = () =>
    throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' }));

  beforeEach(() => {
    getShare.mockReset();
    share.mockReset();
    unshare.mockReset();
    notifyError.mockReset();
    getShare.mockReturnValue(notShared());
    share.mockReturnValue(of(link));
    unshare.mockReturnValue(of(undefined));
    return MockBuilder(ShareDialogComponent)
      .mock(ProjectionShareService, { getShare, share, unshare })
      .mock(NotificationService, { error: notifyError });
  });

  const render = () =>
    MockRender(ShareDialogComponent, { projectionId: 'p1', players }, { detectChanges: true });

  it('offers to create a link when the projection has never been shared', async () => {
    const fixture = render();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.point.componentInstance.share()).toBeNull();
    expect(fixture.point.componentInstance.errorMessage()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Create link');
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

  it('publishes the ranked rows and the alias', async () => {
    const fixture = render();
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.authorAlias.set('Alex');

    component.publish();

    expect(share).toHaveBeenCalledWith('p1', players, 'Alex');
    expect(component.share()).toEqual(link);
  });

  it('surfaces a failure to publish instead of leaving the dialog silent', async () => {
    share.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, statusText: 'Bad Request' })),
    );

    const fixture = render();
    await fixture.whenStable();
    fixture.point.componentInstance.publish();

    expect(fixture.point.componentInstance.errorMessage()).toEqual(
      "Couldn't share this projection.",
    );
  });

  it('clears the link when the owner stops sharing', async () => {
    getShare.mockReturnValue(of(link));

    const fixture = render();
    await fixture.whenStable();
    fixture.point.componentInstance.unshare();

    expect(unshare).toHaveBeenCalledWith('p1');
    expect(fixture.point.componentInstance.share()).toBeNull();
  });
});
