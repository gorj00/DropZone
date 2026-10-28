import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { CanActivateFn, GuardResult, Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiService, API_URL } from './api/api.service';
import { User } from './api/models';
import { PushService } from './native/push';
import { SessionStore } from './session.store';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionStore);
  const token = session.token();
  const isApi = req.url.startsWith(API_URL);
  const authed = token && isApi ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(authed).pipe(
    catchError((e: unknown) => {
      const current = e instanceof HttpErrorResponse && isApi && !!token && session.token() === token;
      if (current && e.status === 401 && !req.url.includes('/auth/') && !req.url.endsWith('/config')) void session.logout();
      if (current && e.status === 403 && (e.error as { code?: unknown } | null)?.code === 'SUSPENDED') session.markSuspended();
      return throwError(() => e);
    })
  );
};

export function isSignInCancelled(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === 'USER_CANCELLED';
}

const toWelcome = (router: Router, returnUrl: string) => router.createUrlTree(['/welcome'], { queryParams: { returnUrl } });

const settled = (session: SessionStore, check: () => GuardResult): GuardResult | Promise<GuardResult> =>
  session.offline() ? session.whenSettled().then(check) : check();

export const authGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  return settled(session, () => {
    if (!session.loggedIn()) return toWelcome(router, state.url);
    if (!session.user()?.onboarded) return router.parseUrl('/onboarding/profile');
    if (session.user()?.proEndPending) return router.parseUrl('/pro-ended');
    if (session.user()?.trialEndPending) return router.parseUrl('/trial-ended');
    return true;
  });
};

export const signedInGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  return settled(session, () => session.loggedIn() || toWelcome(router, state.url));
};

export const onboardingGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  return settled(session, () => {
    if (!session.loggedIn()) return router.parseUrl('/welcome');
    if (session.user()?.onboarded) return router.parseUrl('/today');
    return true;
  });
};

export const guestGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  return settled(session, () => {
    if (!session.loggedIn()) return true;
    return router.parseUrl(session.user()?.onboarded ? '/today' : '/onboarding/profile');
  });
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly push = inject(PushService);
  private initialized = false;

  readonly native = Capacitor.isNativePlatform();
  private readonly google = this.native || !!environment.googleWebClientId;

  async signInWithGoogle(): Promise<User> {
    if (!this.google) {
      if (environment.production) throw new Error('Google sign-in is not set up.');
      return this.devSignIn();
    }
    if (!this.initialized) {
      const redirectUrl = this.native ? undefined : `${window.location.origin}/welcome`;
      await SocialLogin.initialize({ google: { webClientId: environment.googleWebClientId, redirectUrl } });
      this.initialized = true;
    }
    const res = await SocialLogin.login({ provider: 'google', options: this.native ? {} : { scopes: ['email', 'profile'] } });
    const result = res.result as { idToken?: string | null };
    if (!result.idToken) throw new Error('Google did not return an ID token.');
    const { token, user } = await this.api.loginGoogle(result.idToken);
    await this.session.signIn(token, user);
    return user;
  }

  async devSignIn(email = 'alex@dropzone.dev', name = 'Alex K.'): Promise<User> {
    if (environment.production) throw new Error('Dev sign-in is not available.');
    const { token, user } = await this.api.loginDev(email, name);
    await this.session.signIn(token, user);
    return user;
  }

  async signOut(opts: { revoked?: boolean } = {}): Promise<void> {
    if (!opts.revoked) await this.push.unregister();
    if (this.google && this.initialized) {
      try { await SocialLogin.logout({ provider: 'google' }); } catch { }
    }
    await this.session.logout();
  }
}
