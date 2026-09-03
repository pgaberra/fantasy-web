import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MockBuilder } from 'ng-mocks';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountService } from './account.service';
import { AuthService } from './auth.service';
import { Api } from '../api/api';
import { getAccount } from '../api/fn/account/get-account';
import { getAvatar } from '../api/fn/account/get-avatar';
import { removeAvatar } from '../api/fn/account/remove-avatar';
import { setAvatar } from '../api/fn/account/set-avatar';
import { AccountResponse } from '../api/models/account-response';

const invoke = vi.fn();
const isLoggedIn = signal(false);
const getEmail = vi.fn<() => string | null>();

const named: AccountResponse = { email: 'owner@example.com', username: 'alex' };
const picture = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });

/** jsdom has no object URLs; each call hands out a distinct fake so revocation can be checked. */
let objectUrls = 0;
const createObjectURL = vi.fn(() => `blob:fake/${++objectUrls}`);
const revokeObjectURL = vi.fn();

function answer(fn: unknown, result: unknown): void {
  invoke.mockImplementation((called: unknown) =>
    called === fn ? Promise.resolve(result) : Promise.resolve(null),
  );
}

/** The two calls a session start makes, answered as an account with a picture. */
function answerProfileAndPicture(): void {
  invoke.mockImplementation((called: unknown) => {
    if (called === getAccount) {
      return Promise.resolve(named);
    }
    if (called === getAvatar) {
      return Promise.resolve(picture);
    }
    return Promise.resolve(null);
  });
}

describe('AccountService', () => {
  beforeEach(async () => {
    invoke.mockReset();
    invoke.mockResolvedValue(null);
    isLoggedIn.set(false);
    getEmail.mockReset();
    getEmail.mockReturnValue('token@example.com');
    objectUrls = 0;
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    await MockBuilder(AccountService)
      .provide({ provide: Api, useValue: { invoke } })
      .mock(AuthService, { isLoggedIn, getEmail });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const service = () => TestBed.inject(AccountService);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('shows the email from the token until the profile has loaded', () => {
    expect(service().email()).toEqual('token@example.com');
  });

  it('loads the profile and the picture as soon as a session starts', async () => {
    answerProfileAndPicture();
    const account = service();

    isLoggedIn.set(true);
    TestBed.tick();
    await settle();

    expect(account.username()).toEqual('alex');
    expect(account.email()).toEqual('owner@example.com');
    expect(account.avatarUrl()).toEqual('blob:fake/1');
  });

  it('reads an empty answer as no picture', async () => {
    const account = service();
    invoke.mockResolvedValue(null);

    await firstValueFrom(account.loadAvatar());

    expect(account.avatarUrl()).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('uploads the picture as the file part and shows it straight away', async () => {
    const account = service();
    answer(setAvatar, undefined);

    await firstValueFrom(account.setAvatar(picture));

    expect(invoke).toHaveBeenCalledWith(setAvatar, { body: { file: picture } });
    expect(createObjectURL).toHaveBeenCalledWith(picture);
    expect(account.avatarUrl()).toEqual('blob:fake/1');
  });

  it('lets go of the previous picture when a new one replaces it', async () => {
    const account = service();
    answer(setAvatar, undefined);

    await firstValueFrom(account.setAvatar(picture));
    await firstValueFrom(account.setAvatar(picture));

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake/1');
    expect(account.avatarUrl()).toEqual('blob:fake/2');
  });

  it('removes the picture', async () => {
    const account = service();
    answer(setAvatar, undefined);
    await firstValueFrom(account.setAvatar(picture));
    answer(removeAvatar, undefined);

    await firstValueFrom(account.removeAvatar());

    expect(invoke).toHaveBeenCalledWith(removeAvatar, {});
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake/1');
    expect(account.avatarUrl()).toBeNull();
  });

  /**
   * The next person to sign in on this browser must not see the last one's name or face, even
   * for the moment before their own profile arrives.
   */
  it('drops the profile and the picture when the session ends', async () => {
    answerProfileAndPicture();
    const account = service();
    isLoggedIn.set(true);
    TestBed.tick();
    await settle();

    isLoggedIn.set(false);
    TestBed.tick();

    expect(account.username()).toBeNull();
    expect(account.avatarUrl()).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake/1');
  });
});
