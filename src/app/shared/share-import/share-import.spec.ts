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

  /**
   * Pressing Import used to submit the form to the browser instead of the component, which
   * navigated away and brought the page back on its first tab with nothing imported. The press
   * has to go through the DOM here: calling submit() directly is exactly what missed it.
   */
  it('imports on the button press, and lets the browser do nothing with it', async () => {
    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;
    component.shareInput.set('https://slapstat.com/s/aBc123_-xyz');
    fixture.detectChanges();

    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    const submitted = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(submitted);

    expect(importFromShare).toHaveBeenCalledWith('aBc123_-xyz', undefined);
    expect(submitted.defaultPrevented).toEqual(true);
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

  /** The name field is what makes a phone's row too narrow, so it alone switches the stacking on. */
  it('marks the row for stacking only while a name is being asked for', async () => {
    importFromShare.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));

    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;
    const controls = (): HTMLElement =>
      fixture.nativeElement.querySelector('.import-controls') as HTMLElement;
    expect(controls().classList).not.toContain('import-controls--naming');

    component.shareInput.set('https://slapstat.com/s/aBc123_-xyz');
    component.submit();
    fixture.detectChanges();

    expect(controls().classList).toContain('import-controls--naming');
  });

  it("keeps the page's own button the only filled one", async () => {
    const fixture = await renderFixture();
    const button = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLElement;

    expect(button.classList).toContain('btn-secondary');
    expect(button.classList).not.toContain('btn-primary');
  });

  it('says so when the link has gone', async () => {
    importFromShare.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

    const component = await render();
    component.shareInput.set('https://slapstat.com/s/aBc123_-xyz');
    component.submit();

    expect(component.importHint()).toBeTruthy();
    expect(notifyError).not.toHaveBeenCalled();
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
