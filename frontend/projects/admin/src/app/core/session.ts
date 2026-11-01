import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_URL, ApiService } from './api';
import type { User } from './models';

export const TOKEN_KEY = 'dz-admin-token';

function readToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { }
}

@Injectable({ providedIn: 'root' })
export class Session {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(readToken());
  readonly user = signal<User | null>(null);
  readonly ready = signal(false);
  readonly loggedIn = computed(() => !!this.token() && !!this.user()?.admin);

  async init(): Promise<void> {
    if (this.token()) {
      try {
        const { user, token } = await this.api.me();
        if (user.admin) {
          this.user.set(user);
          if (token) this.store(token);
        } else {
          this.clear();
        }
      } catch (e) {
        if (e instanceof HttpErrorResponse && (e.status === 401 || e.status === 403)) this.clear();
      }
    }
    this.ready.set(true);
  }

  signIn(token: string, user: User): void {
    if (!user.admin) throw new Error('This account is not an admin.');
    this.store(token);
    this.user.set(user);
  }

  signOut(): void {
    this.clear();
    void this.router.navigateByUrl('/login');
  }

  clear(): void {
    this.user.set(null);
    this.store(null);
  }

  private store(token: string | null): void {
    this.token.set(token);
    writeToken(token);
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(Session);
  const token = session.token();
  const isApi = req.url.startsWith(API_URL);
  const authed = token && isApi && !req.url.includes('/auth/') ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(authed).pipe(
    catchError((e: unknown) => {
      if (e instanceof HttpErrorResponse && isApi && token && e.status === 401 && !req.url.includes('/auth/')) session.signOut();
      return throwError(() => e);
    })
  );
};

export const adminGuard: CanActivateFn = (_route, state) => {
  const session = inject(Session);
  const router = inject(Router);
  return session.loggedIn() || router.createUrlTree(['/login'], { queryParams: state.url && state.url !== '/' ? { returnUrl: state.url } : {} });
};

export const guestGuard: CanActivateFn = () => {
  const session = inject(Session);
  const router = inject(Router);
  return !session.loggedIn() || router.parseUrl('/');
};
