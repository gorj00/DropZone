import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { firstValueFrom } from 'rxjs';
import { API_URL } from './api/api.service';
import { User } from './api/models';
import { authGuard, authInterceptor, isSignInCancelled } from './auth';
import { LockService } from './native/lock';
import { SessionStore } from './session.store';
import { ToastService } from './toast.service';

const user = { id: 'u1', onboarded: true, theme: 'NEON', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, lockedApps: [] } as unknown as User;

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([{ path: 'welcome', children: [] }, { path: '**', children: [] }]),
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  return {
    session: TestBed.inject(SessionStore),
    http: TestBed.inject(HttpClient),
    backend: TestBed.inject(HttpTestingController),
    router: TestBed.inject(Router)
  };
}

describe('authInterceptor', () => {
  beforeEach(() => localStorage.clear());

  it('sends the token only to the API', async () => {
    const { session, http, backend } = setup();
    await session.signIn('tok', user);

    void firstValueFrom(http.get(`${API_URL}/goal`));
    expect(backend.expectOne(`${API_URL}/goal`).request.headers.get('Authorization')).toBe('Bearer tok');

    void firstValueFrom(http.get('https://images.example.test/a.jpg'));
    expect(backend.expectOne('https://images.example.test/a.jpg').request.headers.has('Authorization')).toBe(false);
  });

  it('signs out on 401 from the API', async () => {
    const { session, http, backend, router } = setup();
    await session.signIn('tok', user);

    const call = firstValueFrom(http.get(`${API_URL}/today`)).catch(e => e);
    backend.expectOne(`${API_URL}/today`).flush({ code: 'UNAUTHORIZED', message: 'Expired' }, { status: 401, statusText: 'Unauthorized' });
    expect((await call).status).toBe(401);

    await vi.waitFor(() => expect(router.url).toBe('/welcome'));
    expect(session.token()).toBeNull();
    expect(session.loggedIn()).toBe(false);
    expect((await Preferences.get({ key: 'dz-token' })).value).toBeNull();
  });

  it('does not sign out on 401 from a sign-in call', async () => {
    const { session, http, backend } = setup();
    await session.signIn('tok', user);

    const call = firstValueFrom(http.post(`${API_URL}/auth/google`, {})).catch(e => e);
    backend.expectOne(`${API_URL}/auth/google`).flush({ code: 'UNAUTHORIZED', message: 'Bad token' }, { status: 401, statusText: 'Unauthorized' });
    await call;

    expect(session.token()).toBe('tok');
  });

  it('ignores 401 from the public config and from calls made without a token', async () => {
    const { session, http, backend, router } = setup();
    const anonymous = firstValueFrom(http.get(`${API_URL}/today`)).catch(e => e);
    backend.expectOne(`${API_URL}/today`).flush({ code: 'UNAUTHORIZED', message: 'No' }, { status: 401, statusText: 'Unauthorized' });
    await anonymous;

    await session.signIn('tok', user);
    const config = firstValueFrom(http.get(`${API_URL}/config`)).catch(e => e);
    backend.expectOne(`${API_URL}/config`).flush({ code: 'UNAUTHORIZED', message: 'No' }, { status: 401, statusText: 'Unauthorized' });
    await config;

    expect(session.token()).toBe('tok');
    expect(router.url).toBe('/');
  });

  it('keeps the session on other errors', async () => {
    const { session, http, backend } = setup();
    await session.signIn('tok', user);

    const call = firstValueFrom(http.get(`${API_URL}/today`)).catch(e => e);
    backend.expectOne(`${API_URL}/today`).error(new ProgressEvent('error'));
    expect((await call).status).toBe(0);

    expect(session.loggedIn()).toBe(true);
  });

  it('keeps the session on 429 and shows the server message', async () => {
    const { session, http, backend } = setup();
    await session.signIn('tok', user);
    const message = 'Slow down a little — try again in a few minutes.';

    for (const url of [`${API_URL}/feed/f1/comments`, `${API_URL}/auth/google`]) {
      const call = firstValueFrom(http.post(url, {})).catch(e => e);
      backend.expectOne(url).flush({ status: 429, code: 'RATE_LIMITED', message }, { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '60' } });
      TestBed.inject(ToastService).error(await call);
      expect(TestBed.inject(ToastService).message()).toEqual({ text: message, error: true });
    }

    expect(session.loggedIn()).toBe(true);
    expect(session.token()).toBe('tok');
  });
});

describe('authGuard', () => {
  beforeEach(() => localStorage.clear());

  it('waits while the session is offline and continues once it is back', async () => {
    const { session, backend } = setup();
    await Preferences.set({ key: 'dz-token', value: 'tok' });
    const init = session.init();
    (await vi.waitFor(() => backend.expectOne(`${API_URL}/me`))).error(new ProgressEvent('error'));
    await init;
    expect(session.offline()).toBe(true);

    const result = TestBed.runInInjectionContext(() => authGuard({} as ActivatedRouteSnapshot, { url: '/today' } as RouterStateSnapshot));
    expect(result).toBeInstanceOf(Promise);

    const retry = session.retry();
    (await vi.waitFor(() => backend.expectOne(`${API_URL}/me`))).flush(user);
    await retry;

    expect(await result).toBe(true);
    await session.clear();
  });

  it('sends a signed-out user to welcome with the return URL', () => {
    setup();
    const result = TestBed.runInInjectionContext(() => authGuard({} as ActivatedRouteSnapshot, { url: '/invite/ABC' } as RouterStateSnapshot));
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/welcome?returnUrl=%2Finvite%2FABC');
  });
});

describe('isSignInCancelled', () => {
  it('recognises the plugin cancel code', () => {
    expect(isSignInCancelled(Object.assign(new Error('Google Sign-In cancelled by user'), { code: 'USER_CANCELLED' }))).toBe(true);
    expect(isSignInCancelled({ code: 'USER_CANCELLED', message: 'Popup closed' })).toBe(true);
    expect(isSignInCancelled(new Error('Network error'))).toBe(false);
    expect(isSignInCancelled(null)).toBe(false);
  });
});
