import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { ProfileComponent } from './profile';
import { AccountService } from '../services/account.service';
import { AuthService } from '../services/auth.service';
import { AvatarImageService, UnreadableImageError } from '../services/avatar-image.service';
import { PlayerHeadshotComponent } from '../shared/player-headshot/player-headshot';
import { AvatarCropDialogComponent } from './avatar-crop-dialog/avatar-crop-dialog';
import { AvatarCrop } from '../models/avatar-crop';
import { AccountResponse } from '../api/models/account-response';

describe('ProfileComponent', () => {
  const named: AccountResponse = { email: 'owner@example.com', username: 'alex' };
  const picked = new File([new Uint8Array([1, 2, 3])], 'me.png', { type: 'image/png' });
  const prepared = new Blob([new Uint8Array([4, 5, 6])], { type: 'image/jpeg' });
  /** What the dialog hands back: the square the user placed on the picked file. */
  const placed: AvatarCrop = { x: 120, y: 0, side: 533 };

  const load = vi.fn();
  const setUsername = vi.fn();
  const setAvatar = vi.fn();
  const removeAvatar = vi.fn();
  const prepare = vi.fn();
  const signOutEverywhere = vi.fn();
  const avatarUrl = signal<string | null>(null);
  const fragment = new BehaviorSubject<string | null>(null);

  beforeEach(() => {
    for (const spy of [load, setUsername, setAvatar, removeAvatar, prepare, signOutEverywhere]) {
      spy.mockReset();
    }
    avatarUrl.set(null);
    fragment.next(null);
    load.mockReturnValue(of(named));
    setUsername.mockReturnValue(of(named));
    setAvatar.mockReturnValue(of(undefined));
    removeAvatar.mockReturnValue(of(undefined));
    prepare.mockResolvedValue(prepared);
    signOutEverywhere.mockReturnValue(of(undefined));
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
      .mock(AvatarImageService, { prepare })
      .mock(AuthService, { signOutEverywhere })
      .provide({ provide: ActivatedRoute, useValue: { fragment } });
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

  const cropDialog = (fixture: Awaited<ReturnType<typeof render>>) =>
    fixture.nativeElement.querySelector('app-avatar-crop-dialog') as HTMLElement | null;

  /** Places the square the dialog would have placed, and presses its Save. */
  const place = async (fixture: Awaited<ReturnType<typeof render>>, crop: AvatarCrop = placed) => {
    ngMocks.output(ngMocks.find(fixture, AvatarCropDialogComponent), 'confirmed').emit(crop);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  /**
   * What a failed upload says. It is handed to the dialog rather than drawn on the page, so the
   * user keeps the square they placed and can press Save again.
   */
  const dialogError = (fixture: Awaited<ReturnType<typeof render>>) =>
    ngMocks.input(ngMocks.find(fixture, AvatarCropDialogComponent), 'saveError');

  /**
   * The account menu's "Set a username" link lands on #username, and the page is expected to put
   * the caret in the field: the account loads first, so the field is not there to jump to on
   * arrival.
   */
  it('puts the caret in the username field when sent to it by fragment', async () => {
    fragment.next('username');
    const fixture = await render();

    expect(document.activeElement).toEqual(
      fixture.nativeElement.querySelector('#profile-username'),
    );
  });

  it('leaves the caret alone when it was not sent to the username field', async () => {
    const fixture = await render();

    expect(document.activeElement).not.toEqual(
      fixture.nativeElement.querySelector('#profile-username'),
    );
  });

  it('offers to upload a picture while the account has none', async () => {
    const fixture = await render();

    expect(text(fixture)).toContain('Upload picture');
    expect(text(fixture)).not.toContain('Remove');
    expect(fixture.nativeElement.querySelector('.avatar-preview')?.textContent?.trim()).toEqual(
      'A',
    );
  });

  /**
   * A picked file used to go straight up, cropped from its middle. The middle of a photo is not
   * where the subject of one is, and the square is all that is ever stored, so the placing happens
   * before the upload and nothing is sent until the user has seen it.
   */
  it('opens the crop dialog on the picked file and uploads nothing yet', async () => {
    const fixture = await render();

    await pick(fixture, picked);

    expect(cropDialog(fixture)).not.toBeNull();
    expect(ngMocks.input(ngMocks.find(fixture, AvatarCropDialogComponent), 'file')).toBe(picked);
    expect(prepare).not.toHaveBeenCalled();
    expect(setAvatar).not.toHaveBeenCalled();
  });

  it('uploads the square the user placed, and closes the dialog once it lands', async () => {
    const fixture = await render();

    await pick(fixture, picked);
    await place(fixture);

    expect(prepare).toHaveBeenCalledWith(picked, placed);
    expect(setAvatar).toHaveBeenCalledWith(prepared);
    expect(cropDialog(fixture)).toBeNull();
    expect(fixture.point.componentInstance.avatarError()).toBeNull();
    expect(fixture.point.componentInstance.isUploading()).toEqual(false);
  });

  it('uploads nothing when the dialog is closed without saving', async () => {
    const fixture = await render();

    await pick(fixture, picked);
    ngMocks.output(ngMocks.find(fixture, AvatarCropDialogComponent), 'closed').emit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(cropDialog(fixture)).toBeNull();
    expect(prepare).not.toHaveBeenCalled();
    expect(setAvatar).not.toHaveBeenCalled();
  });

  /**
   * The formats are no longer listed under the button, so this message is the only place the
   * page names them — and it has to arrive on the pick, not from a dialog opened on a picture
   * that would never appear in it.
   */
  it('names the formats it takes when the picked file is not one of them', async () => {
    const fixture = await render();

    await pick(fixture, new File(['GIF89a'], 'me.gif', { type: 'image/gif' }));

    expect(cropDialog(fixture)).toBeNull();
    expect(prepare).not.toHaveBeenCalled();
    expect(text(fixture)).toContain('Unsupported file format. Use a PNG, JPEG, or WebP image.');
  });

  it('says so when the dialog cannot draw the file at all', async () => {
    const fixture = await render();

    await pick(fixture, picked);
    ngMocks.output(ngMocks.find(fixture, AvatarCropDialogComponent), 'unreadable').emit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(cropDialog(fixture)).toBeNull();
    expect(setAvatar).not.toHaveBeenCalled();
    expect(text(fixture)).toContain('That file could not be read as an image');
  });

  it('says so when the file cannot be decoded at the moment it is saved', async () => {
    prepare.mockRejectedValue(new UnreadableImageError());
    const fixture = await render();

    await pick(fixture, picked);
    await place(fixture);

    expect(setAvatar).not.toHaveBeenCalled();
    expect(dialogError(fixture)).toContain('That file could not be read as an image');
  });

  it('no longer spends a line of help text on the formats it takes', async () => {
    const fixture = await render();

    expect(text(fixture)).not.toContain('cropped to a square');
  });

  it('reports an upload the server refused without closing the dialog on it', async () => {
    setAvatar.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, statusText: 'Bad Request' })),
    );
    const fixture = await render();

    await pick(fixture, picked);
    await place(fixture);

    expect(cropDialog(fixture)).not.toBeNull();
    expect(dialogError(fixture)).toContain("Couldn't save your picture");
    expect(fixture.point.componentInstance.isUploading()).toEqual(false);
  });

  it('blames the connection rather than the picture when the server is unreachable', async () => {
    setAvatar.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    const fixture = await render();

    await pick(fixture, picked);
    await place(fixture);

    expect(dialogError(fixture)).toContain("can't reach the server");
  });

  it('does nothing when the picker is dismissed without a file', async () => {
    const fixture = await render();

    await pick(fixture, null);

    expect(cropDialog(fixture)).toBeNull();
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

  describe('the username rule', () => {
    const usernameField = (fixture: Awaited<ReturnType<typeof render>>) =>
      fixture.nativeElement.querySelector('#profile-username') as HTMLInputElement;

    const type = async (fixture: Awaited<ReturnType<typeof render>>, value: string) => {
      const field = usernameField(fixture);
      field.value = value;
      field.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      fixture.detectChanges();
    };

    const leave = async (fixture: Awaited<ReturnType<typeof render>>) => {
      usernameField(fixture).dispatchEvent(new Event('blur'));
      await fixture.whenStable();
      fixture.detectChanges();
    };

    const RULE =
      'Username must be 3–20 characters and may contain only letters, numbers, and underscores.';

    /**
     * The card's heading says "Username" already, so drawing the label too said it twice. It is
     * kept in the markup regardless: it is what names the field for a screen reader.
     */
    it('keeps the field labelled without drawing the word a second time', async () => {
      const fixture = await render();
      const label = fixture.nativeElement.querySelector(
        'label[for="profile-username"]',
      ) as HTMLLabelElement;

      expect(label.textContent?.trim()).toEqual('Username');
      expect(label.className).toContain('visually-hidden');
    });

    it('says nothing about the rule until one is broken', async () => {
      const fixture = await render();

      expect(text(fixture)).not.toContain(RULE);
    });

    it('holds its tongue while a short name is still being typed', async () => {
      const fixture = await render();

      await type(fixture, 'al');

      expect(text(fixture)).not.toContain(RULE);
    });

    it('states the rule once a name that breaks it is left', async () => {
      const fixture = await render();

      await type(fixture, 'al');
      await leave(fixture);

      expect(text(fixture)).toContain(RULE);
      expect(usernameField(fixture).getAttribute('aria-invalid')).toEqual('true');
      expect(usernameField(fixture).getAttribute('aria-describedby')).toEqual(
        'profile-username-error',
      );
    });

    it('says it for a name with a character the rule does not allow', async () => {
      const fixture = await render();

      await type(fixture, 'alex smith');
      await leave(fixture);

      expect(text(fixture)).toContain(RULE);
    });

    it('drops it again as soon as the name is corrected', async () => {
      const fixture = await render();

      await type(fixture, 'al');
      await leave(fixture);
      expect(text(fixture)).toContain(RULE);

      await type(fixture, 'alex');

      expect(text(fixture)).not.toContain(RULE);
      expect(usernameField(fixture).getAttribute('aria-invalid')).toBeNull();
    });

    /** An empty field is a name not filled in yet, not a wrong one. */
    it('stays quiet for a field cleared back to empty', async () => {
      const fixture = await render();

      await type(fixture, 'al');
      await leave(fixture);
      await type(fixture, '');

      expect(text(fixture)).not.toContain(RULE);
    });
  });

  describe('signing out everywhere', () => {
    const button = (fixture: Awaited<ReturnType<typeof render>>) =>
      Array.from(
        fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
      ).find((candidate) => candidate.textContent?.includes('Sign out everywhere'));

    it('revokes every session when asked', async () => {
      const fixture = await render();

      button(fixture)?.click();

      expect(signOutEverywhere).toHaveBeenCalledTimes(1);
    });

    it('says the account is still signed in when the revoke fails', async () => {
      signOutEverywhere.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
      const fixture = await render();

      button(fixture)?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text(fixture)).toContain("You're still signed in.");
      expect(button(fixture)?.disabled).toEqual(false);
    });
  });
});
