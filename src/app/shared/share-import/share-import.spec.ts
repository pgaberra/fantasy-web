import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ShareImportComponent, shareTokenFrom } from './share-import';
import { ProjectionStorageService } from '../../services/projection-storage.service';
import { NotificationService } from '../../services/notification.service';

describe('ShareImportComponent', () => {
  const importFromShare = vi.fn();
  const notifyError = vi.fn();

  beforeEach(() => {
    importFromShare.mockClear();
    notifyError.mockClear();
    importFromShare.mockReturnValue(of({ id: 'i1' }));
    return MockBuilder(ShareImportComponent)
      .mock(ProjectionStorageService, { importFromShare })
      .mock(NotificationService, { error: notifyError });
  });

  const render = async () => {
    const fixture = MockRender(ShareImportComponent);
    await fixture.whenStable();
    return fixture.point.componentInstance;
  };

  /** The new-projection page imports from its own Create button, so this one is in the way. */
  it('leaves out its own button when the page drives the import', async () => {
    const fixture = MockRender(ShareImportComponent, { showSubmit: false });
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(fixture.point.componentInstance.hasLink()).toEqual(false);
  });

  it('takes the token out of a pasted share link', () => {
    expect(shareTokenFrom('https://slapstat.com/s/aBc123_-xyz')).toEqual('aBc123_-xyz');
    expect(shareTokenFrom('  /s/aBc123_-xyz  ')).toEqual('aBc123_-xyz');
    expect(shareTokenFrom('aBc123_-xyz')).toEqual('aBc123_-xyz');
    expect(shareTokenFrom('https://example.com/nothing')).toBeNull();
    expect(shareTokenFrom('short')).toBeNull();
  });

  it('imports the pasted link and hands back the board it copied', async () => {
    const component = await render();
    const imported = vi.fn();
    component.imported.subscribe(imported);
    component.shareInput.set('https://slapstat.com/s/aBc123_-xyz');

    component.submit();

    expect(importFromShare).toHaveBeenCalledWith('aBc123_-xyz', undefined);
    expect(imported).toHaveBeenCalledWith({ id: 'i1' });
    expect(component.shareInput()).toEqual('');
    expect(component.isImporting()).toEqual(false);
  });

  it('rejects something that is not a share link without calling the server', async () => {
    const component = await render();
    component.shareInput.set('https://example.com/nothing');

    component.submit();

    expect(importFromShare).not.toHaveBeenCalled();
    expect(component.importHint()).toBeTruthy();
  });

  /** Two people can name a projection the same thing; only the importer can settle it. */
  it('asks for a name when one is already taken, then imports under it', async () => {
    importFromShare.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));

    const component = await render();
    component.shareInput.set('https://slapstat.com/s/aBc123_-xyz');
    component.submit();

    expect(component.importName()).toEqual('');
    expect(component.importHint()).toBeTruthy();

    importFromShare.mockReturnValue(of({ id: 'i2' }));
    component.importName.set("Alex's board");
    component.submit();

    expect(importFromShare).toHaveBeenLastCalledWith('aBc123_-xyz', "Alex's board");
    expect(component.importName()).toBeNull();
  });

  it('says so when the link has gone, and tells the page the import got nowhere', async () => {
    importFromShare.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

    const component = await render();
    const failed = vi.fn();
    component.failed.subscribe(failed);
    component.shareInput.set('https://slapstat.com/s/aBc123_-xyz');
    component.submit();

    expect(component.importHint()).toBeTruthy();
    expect(notifyError).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledOnce();
  });

  it('reports a paste that is not a link as a failure too, so no page waits on it', async () => {
    const component = await render();
    const failed = vi.fn();
    component.failed.subscribe(failed);
    component.shareInput.set('https://example.com/nothing');

    component.submit();

    expect(failed).toHaveBeenCalledOnce();
  });

  it('surfaces any other failure as a toast', async () => {
    importFromShare.mockReturnValue(throwError(() => new Error('boom')));

    const component = await render();
    component.shareInput.set('https://slapstat.com/s/aBc123_-xyz');
    component.submit();

    expect(notifyError).toHaveBeenCalledOnce();
    expect(component.isImporting()).toEqual(false);
  });
});
