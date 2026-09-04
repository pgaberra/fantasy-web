import { MockBuilder, MockRender } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { ProfileComponent } from './profile';
import { AccountService } from '../services/account.service';
import {
  AvatarImageService,
  UnreadableImageError,
  UnsupportedImageTypeError,
} from '../services/avatar-image.service';
import { PlayerHeadshotComponent } from '../shared/player-headshot/player-headshot';
import { AccountResponse } from '../api/models/account-response';

describe('ProfileComponent', () => {
  const named: AccountResponse = { email: 'owner@example.com', username: 'alex' };
  const picked = new File([new Uint8Array([1, 2, 3])], 'me.png', { type: 'image/png' });
  const prepared = new Blob([new Uint8Array([4, 5, 6])], { type: 'image/jpeg' });

  const load = vi.fn();
  const setUsername = vi.fn();
  const setAvatar = vi.fn();
  const removeAvatar = vi.fn();
  const prepare = vi.fn();
  const avatarUrl = signal<string | null>(null);

  beforeEach(() => {
    for (const spy of [load, setUsername, setAvatar, removeAvatar, prepare]) {
      spy.mockReset();
    }
    avatarUrl.set(null);
    load.mockReturnValue(of(named));
    setUsername.mockReturnValue(of(named));
    setAvatar.mockReturnValue(of(undefined));
    removeAvatar.mockReturnValue(of(undefined));
    prepare.mockResolvedValue(prepared);
    return MockBuilder(ProfileComponent)
      .keep(PlayerHeadshotComponent)
      .mock(AccountService, {
        load,
        setUsername,
        setAvatar,
        removeAvatar,
        username: signal<string | null>('alex'),
        avatarUrl,
      })
      .mock(AvatarImageService, { prepare });
  });

  const render = async () => {
    const fixture = MockRender(ProfileComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const pick = async (fixture: Awaited<ReturnType<typeof render>>, file: File | null) => {
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: file ? [file] : [],
    });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const text = (fixture: Awaited<ReturnType<typeof render>>) =>
    (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');

  it('offers to upload a picture while the account has none', async () => {
    const fixture = await render();

    expect(text(fixture)).toContain('Upload picture');
    expect(text(fixture)).not.toContain('Remove');
    expect(fixture.nativeElement.querySelector('.avatar-preview')?.textContent?.trim()).toEqual(
      'A',
    );
  });

  it('scales the picked file down and uploads what comes out', async () => {
    const fixture = await render();

    await pick(fixture, picked);

    expect(prepare).toHaveBeenCalledWith(picked);
    expect(setAvatar).toHaveBeenCalledWith(prepared);
    expect(fixture.point.componentInstance.avatarError()).toBeNull();
    expect(fixture.point.componentInstance.isUploading()).toEqual(false);
  });

  it('says so when the file is not a picture the browser can read', async () => {
    prepare.mockRejectedValue(new UnreadableImageError());
    const fixture = await render();

    await pick(fixture, picked);

    expect(setAvatar).not.toHaveBeenCalled();
    expect(text(fixture)).toContain("Couldn't read that file as a picture");
  });

  /**
   * The formats are no longer listed under the button, so this message is the only place the
   * page names them — it has to arrive the moment a file we cannot take is picked.
   */
  it('names the formats it takes when the file is not one of them', async () => {
    prepare.mockRejectedValue(new UnsupportedImageTypeError());
    const fixture = await render();

    await pick(fixture, picked);

    expect(setAvatar).not.toHaveBeenCalled();
    expect(text(fixture)).toContain(
      'Unsupported file format. Please upload a PNG, JPEG, or WebP image.',
    );
    expect(fixture.point.componentInstance.isUploading()).toEqual(false);
  });

  it('no longer spends a line of help text on the formats it takes', async () => {
    const fixture = await render();

    expect(text(fixture)).not.toContain('cropped to a square');
  });

  it('reports an upload the server refused', async () => {
    setAvatar.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, statusText: 'Bad Request' })),
    );
    const fixture = await render();

    await pick(fixture, picked);

    expect(text(fixture)).toContain("Couldn't save your picture");
    expect(fixture.point.componentInstance.isUploading()).toEqual(false);
  });

  it('blames the connection rather than the picture when the server is unreachable', async () => {
    setAvatar.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    const fixture = await render();

    await pick(fixture, picked);

    expect(text(fixture)).toContain("can't reach the server");
  });

  it('does nothing when the picker is dismissed without a file', async () => {
    const fixture = await render();

    await pick(fixture, null);

    expect(prepare).not.toHaveBeenCalled();
    expect(setAvatar).not.toHaveBeenCalled();
  });

  it('shows the picture and offers to change or remove it once there is one', async () => {
    avatarUrl.set('blob:http://localhost/avatar');
    const fixture = await render();

    expect(text(fixture)).toContain('Change picture');
    expect(text(fixture)).toContain('Remove');
    expect(
      (fixture.nativeElement.querySelector('.avatar-preview img') as HTMLImageElement).getAttribute(
        'src',
      ),
    ).toEqual('blob:http://localhost/avatar');
  });

  it('removes the picture', async () => {
    avatarUrl.set('blob:http://localhost/avatar');
    const fixture = await render();

    (fixture.nativeElement.querySelector('.btn-danger-quiet') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(removeAvatar).toHaveBeenCalledOnce();
    expect(fixture.point.componentInstance.avatarError()).toBeNull();
  });

  it('reports a removal that failed', async () => {
    avatarUrl.set('blob:http://localhost/avatar');
    removeAvatar.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 502, statusText: 'Bad Gateway' })),
    );
    const fixture = await render();

    (fixture.nativeElement.querySelector('.btn-danger-quiet') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain("can't reach the server");
  });

  it('still saves the username', async () => {
    const fixture = await render();
    const component = fixture.point.componentInstance;

    component.usernameInput.set('newname');
    component.save();
    await fixture.whenStable();

    expect(setUsername).toHaveBeenCalledWith('newname');
  });
});
