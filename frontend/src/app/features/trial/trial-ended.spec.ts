import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { API_URL } from '../../core/api/api.service';
import { User } from '../../core/api/models';
import { authGuard, authInterceptor } from '../../core/auth';
import { LockService } from '../../core/native/lock';
import { SessionStore } from '../../core/session.store';
import { TrialEndedPage } from './trial-ended';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const user = (patch: Partial<User> = {}) => ({ id: 'u1', onboarded: true, theme: 'NEON', timezone: tz, lockedApps: [], pro: false, trial: false, ...patch }) as unknown as User;

async function setup(u: Partial<User>) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([
        { path: 'trial-ended', component: TrialEndedPage },
        { path: 'pro-ended', data: { kind: 'PRO' }, component: TrialEndedPage },
        { path: '**', children: [] }
      ]),
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  const session = TestBed.inject(SessionStore);
  await session.signIn('tok', user(u));
  return { session, http: TestBed.inject(HttpTestingController), router: TestBed.inject(Router) };
}

const guard = (url = '/today') => TestBed.runInInjectionContext(() => authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));

describe('PRO-ended routing', () => {
  beforeEach(() => localStorage.clear());

  it('sends an ended subscriber to the PRO-ended screen', async () => {
    const { session } = await setup({ proEndPending: true });
    const result = guard();
    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/pro-ended');
    await session.clear();
  });

  it('keeps the trial screen for users who never subscribed', async () => {
    const { session } = await setup({ trialEndPending: true });
    expect(String(guard())).toBe('/trial-ended');
    await session.clear();
  });

  it('lets everyone else through', async () => {
    const { session } = await setup({ pro: true });
    expect(guard()).toBe(true);
    await session.clear();
  });
});

describe('PRO-ended screen', () => {
  beforeEach(() => localStorage.clear());

  it('uses subscription wording and acknowledges with Continue with Free', async () => {
    const { session, http, router } = await setup({ proEndPending: true });
    const harness = await RouterTestingHarness.create('/pro-ended');
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.textContent).toContain('subscription ended');
    expect(el.textContent).not.toContain('this week');

    [...el.querySelectorAll('button')].find(b => b.textContent?.includes('Continue with Free'))!.click();
    const patch = await vi.waitFor(() => http.expectOne(r => r.method === 'PATCH' && r.url === `${API_URL}/me`));
    expect(patch.request.body).toEqual({ proEndAcknowledged: true });
    patch.flush(user({ proEndPending: false }));
    await vi.waitFor(() => expect(router.url).toBe('/today'));
    expect(session.user()?.proEndPending).toBe(false);
    await session.clear();
  });

  it('opens the plans', async () => {
    const { session, router } = await setup({ proEndPending: true });
    const harness = await RouterTestingHarness.create('/pro-ended');
    [...(harness.routeNativeElement as HTMLElement).querySelectorAll('button')].find(b => b.textContent?.includes('See plans'))!.click();
    await vi.waitFor(() => expect(router.url).toBe('/paywall'));
    await session.clear();
  });

  it('keeps the trial wording and acknowledgement on the trial screen', async () => {
    const { session, http } = await setup({ trialEndPending: true });
    const harness = await RouterTestingHarness.create('/trial-ended');
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.textContent).toContain('trial has ended');
    [...el.querySelectorAll('button')].find(b => b.textContent?.includes('Continue with Free'))!.click();
    const patch = await vi.waitFor(() => http.expectOne(r => r.method === 'PATCH' && r.url === `${API_URL}/me`));
    expect(patch.request.body).toEqual({ trialEndAcknowledged: true });
    patch.flush(user());
    await session.clear();
  });

  it('leaves when nothing is pending', async () => {
    const { session, router } = await setup({ pro: true });
    await RouterTestingHarness.create('/pro-ended');
    await vi.waitFor(() => expect(router.url).toBe('/today'));
    await session.clear();
  });
});
