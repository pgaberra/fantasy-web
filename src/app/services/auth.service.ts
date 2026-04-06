import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { AuthResponse, LoginRequest, RegisterRequest } from '../api/models';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly baseUrl = 'http://localhost:8080/api/v1/auth';
  private readonly tokenKey = 'auth_token';

  readonly isLoggedIn = signal<boolean>(!!localStorage.getItem(this.tokenKey));

  login(credentials: LoginRequest) {
    return this.http.post<AuthResponse>(`${this.baseUrl}/login`, credentials).pipe(
      tap(response => {
        if (response.token) localStorage.setItem(this.tokenKey, response.token);
        this.isLoggedIn.set(true);
        this.router.navigate(['/draft-projection']);
      }),
    );
  }

  register(request: RegisterRequest) {
    return this.http.post<void>(`${this.baseUrl}/register`, request).pipe(
      tap(() => this.router.navigate(['/login'])),
    );
  }

  logout() {
    localStorage.removeItem(this.tokenKey);
    this.isLoggedIn.set(false);
    void this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }
}
