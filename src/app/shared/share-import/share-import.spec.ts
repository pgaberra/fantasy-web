import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ShareImportComponent, shareTokenFrom } from './share-import';
import { ProjectionStorageService } from '../../services/projection-storage.service';
import { NotificationService } from '../../services/notification.service';

describe('ShareImportComponent', () => {
  const followShare = vi.fn();
  const notifyError = vi.fn();

  beforeEach(() => {
    followShare.mockClear();
    notifyError.mockClear();
    followShare.mockReturnValue(of({ projection: { id: 'i1' }, alreadyFollowed: false }));
    return MockBuilder(ShareImportComponent)
      .mock(ProjectionStorageService, { followShare })
      .mock(NotificationService, { error: notifyError });
  });

  const renderFixture = async () => {
    const fixture = MockRender(ShareImportComponent);
    await fixture.whenStable();
    return fixture;
  };

  const render = async () => (await renderFixture()).point.componentInstance;

  it('takes the token out of a pasted share link', () => {
    expect(shareTokenFrom('https://slapstat.com/s/aBc123_-xyz')).toEqual('aBc123_-xyz');
    expect(shareTokenFrom('  /s/aBc123_-xyz  ')).toEqual('aBc123_-xyz');
    expect(shareTokenFrom('aBc123_-xyz')).toEqual('aBc123_-xyz');
    expect(shareTokenFrom('https://example.com/nothing')).toBeNull();
    expect(shareTokenFrom('short')).toBeNull();
  });

  it('follows the pasted link and hands back the projection it followed', async () => {
    const component = await render();
    const followed = vi.fn();
    component.followed.subscribe(followed);
    component.shareInput.set('https://slapstat.com/s/aBc123_-xyz');

    component.submit();

    expect(followShare).toHaveBeenCalledWith('aBc123_-xyz');
    expect(followed).toHaveBeenCalledWith({ id: 'i1' });
    expect(component.shareInput()).toEqual('');
    expect(component.isFollowing()).toEqual(false);
    expect(component.followHint()).toBeNull();
  });

  /**
   * One follow per link, so a link pasted twice is answered with the follow already held (200
   * rather than 201). The page takes the user to it either way; this only says why there is no
   * second one, and says it as a remark rather than as a refusal.
   */
  it('takes the user to the projection they already follow, with a note', async () => {
    followShare.mockReturnValue(of({ projection: { id: 'i1' }, alreadyFollowed: true }));

    const component = await render();
    const followed = vi.fn();
    component.followed.subscribe(followed);
    component.shareInput.set('https://slapstat.com/s/aBc123_-xyz');

    component.submit();

    expect(followed).toHaveBeenCalledWith({ id: 'i1' });
    expect(component.followHint()).toBeTruthy();
    expect(component.hintIsNote()).toEqual(true);
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("refuses a link to the user's own projection beside the field", async () => {
    followShare.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400 })));

    const component = await render();
    component.shareInput.set('https://slapstat.com/s/aBc123_-xyz');
    component.submit();

    expect(component.followHint()).toBeTruthy();
    expect(component.hintIsNote()).toEqual(false);
    expect(notifyError).not.toHaveBeenCalled();
  });

  /**
   * Pressing Follow used to submit the form to the browser instead of the component, which
   * navigated away and brought the page back on its first tab with nothing followed. The press
   * has to go through the DOM here: calling submit() directly is exactly what missed it.
   */
  it('follows on the button press, and lets the browser do nothing with it', async () => {
    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;
    component.shareInput.set('https://slapstat.com/s/aBc123_-xyz');
    fixture.detectChanges();

    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    const submitted = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(submitted);

    expect(followShare).toHaveBeenCalledWith('aBc123_-xyz');
    expect(submitted.defaultPrevented).toEqual(true);
  });

  it('rejects something that is not a share link without calling the server', async () => {
    const component = await render();
    component.shareInput.set('https://example.com/nothing');

    component.submit();

    expect(followShare).not.toHaveBeenCalled();
    expect(component.followHint()).toBeTruthy();
  });

  it("keeps the page's own button the only filled one", async () => {
    const fixture = await renderFixture();
    const button = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLElement;

    expect(button.classList).toContain('btn-secondary');
    expect(button.classList).not.toContain('btn-primary');
  });

  it('says so when the link has gone', async () => {
    followShare.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

    const component = await render();
    component.shareInput.set('https://slapstat.com/s/aBc123_-xyz');
    component.submit();

    expect(component.followHint()).toBeTruthy();
    expect(notifyError).not.toHaveBeenCalled();
  });

  it('surfaces any other failure as a toast', async () => {
    followShare.mockReturnValue(throwError(() => new Error('boom')));

    const component = await render();
    component.shareInput.set('https://slapstat.com/s/aBc123_-xyz');
    component.submit();

    expect(notifyError).toHaveBeenCalledOnce();
    expect(component.isFollowing()).toEqual(false);
  });
});
