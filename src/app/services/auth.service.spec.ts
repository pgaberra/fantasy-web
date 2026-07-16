import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MockBuilder } from 'ng-mocks';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { AnalyticsService } from './analytics.service';
import { Api } from '../api/api';
import { AuthResponse } from '../api/models';

const identify = vi.fn();
const reset = vi.fn();
const capture = vi.fn();
const invoke = vi.fn();

function jwtWith(claims: Record<string, string>): string {
  // base64url: swap the two alphabet characters and drop the padding, which only ever
  // trails (so splitting on '=' is enough — a regex here trips sonarjs/super-linear-regex).
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .split('=')[0];
  return `header.${payload}.signature`;
}

function authResponse(token: string): AuthResponse {
  return {
    token,
    refreshToken: 'refresh-token',
    expiresInSeconds: 900,
    refreshExpiresInSeconds: 86400,
    admin: false,
    emailVerified: true,
  };
}

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    localStorage.clear();
    identify.mockClear();
    reset.mockClear();
    capture.mockClear();
    invoke.mockReset();

    await MockBuilder(AuthService)
      .provide({ provide: Api, useValue: { invoke } })
      .provide({ provide: Router, useValue: { navigate: vi.fn() } })
      .provide({ provide: AnalyticsService, useValue: { identify, reset, capture } });

    service = TestBed.inject(AuthService);
  });

  describe('getUserId', () => {
    it('reads the account UUID from the JWT sub claim', () => {
      localStorage.setItem('auth_token', jwtWith({ sub: 'account-uuid', email: 'a@example.com' }));

      expect(service.getUserId()).toEqual('account-uuid');
    });

    // The email claim rides in the same payload; sending it to analytics would stamp PII
    // onto every event row.
    it('does not mistake the email claim for the user id', () => {
      localStorage.setItem('auth_token', jwtWith({ sub: 'account-uuid', email: 'a@example.com' }));

      expect(service.getUserId()).toEqual('account-uuid');
      expect(service.getEmail()).toEqual('a@example.com');
    });

    it('returns null with no token', () => {
      expect(service.getUserId()).toEqual(null);
    });

    it('returns null for an undecodable token', () => {
      localStorage.setItem('auth_token', 'not-a-jwt');

      expect(service.getUserId()).toEqual(null);
    });
  });

  it('identifies the user by UUID on sign-in', async () => {
    invoke.mockResolvedValue(
      authResponse(jwtWith({ sub: 'account-uuid', email: 'a@example.com' })),
    );

    await firstValueFrom(service.login({ email: 'a@example.com', password: 'secret' }));

    expect(identify).toHaveBeenCalledWith('account-uuid');
  });

  it('captures a registration', async () => {
    invoke.mockResolvedValue(
      authResponse(jwtWith({ sub: 'account-uuid', email: 'a@example.com' })),
    );

    await firstValueFrom(service.register({ email: 'a@example.com', password: 'secret' }));

    expect(capture).toHaveBeenCalledWith('user_registered');
  });

  it('resets analytics on logout so the next user does not inherit the identity', () => {
    service.logout();

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
