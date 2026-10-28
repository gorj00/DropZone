import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { API_URL } from './api/api.service';
import { Goal, QuestType, Today, User } from './api/models';
import { authInterceptor } from './auth';
import { LockService } from './native/lock';
import { EXPIRY_REFRESH_DELAY_MS, RENEWAL_LEEWAY_MS, SessionStore, expiryRefreshIn } from './session.store';
import { NotificationsStore } from './social';
import { CatalogStore, GoalStore, TodayStore } from './stores';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

function makeUser(patch: Partial<User> = {}): User {
  return {
    id: 'u1', email: 'alex@test.dev', displayName: 'Alex', handle: 'alex', avatarUrl: null, theme: 'NEON', path: 'LOSE', pro: false,
    proExpiresAt: null, unlockMode: 'WHOLE_DAY', minutesPerQuest: 30, publicByDefault: false, defaultVerification: 'AI', slipUpTracking: false,
    lockedApps: [], onboarded: true, streak: 0, bestStreak: 0, inviteCode: 'ABC', timezone: tz, trial: false, trialEndsAt: null,
    weightUnit: 'KG', lengthUnit: 'CM', admin: false, bio: null, ...patch
  };
}

function setup() {
  const lock = { native: false, disable: vi.fn().mockResolvedValue(undefined), sync: vi.fn().mockResolvedValue(undefined) };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([{ path: 'welcome', children: [] }, { path: '**', children: [] }]),
      { provide: LockService, useValue: lock }
    ]
  });
  return { session: TestBed.inject(SessionStore), http: TestBed.inject(HttpTestingController), lock };
}

const me = (http: HttpTestingController): Promise<TestRequest> => vi.waitFor(() => http.expectOne(`${API_URL}/me`));
const stored = async () => (await Preferences.get({ key: 'dz-token' })).value;

describe('SessionStore start-up', () => {
  beforeEach(async () => {
    localStorage.clear();
    await Preferences.set({ key: 'dz-token', value: 'tok' });
  });

  it('keeps the token and shows the offline state when /me fails with a network error', async () => {
    const { session, http, lock } = setup();
    const init = session.init();
    (await me(http)).error(new ProgressEvent('error'));
    await init;

    expect(session.token()).toBe('tok');
    expect(await stored()).toBe('tok');
    expect(session.offline()).toBe(true);
    expect(session.user()).toBeNull();
    expect(session.ready()).toBe(true);
    expect(lock.disable).not.toHaveBeenCalled();
    await session.clear();
  });

  it('keeps the token when the server answers with a 5xx', async () => {
    const { session, http } = setup();
    const init = session.init();
    (await me(http)).flush({ code: 'INTERNAL', message: 'Down' }, { status: 503, statusText: 'Unavailable' });
    await init;

    expect(session.token()).toBe('tok');
    expect(session.offline()).toBe(true);
    await session.clear();
  });

  it('clears the token and disables the lock on 401', async () => {
    const { session, http, lock } = setup();
    const init = session.init();
    (await me(http)).flush({ code: 'UNAUTHORIZED', message: 'Sign in again' }, { status: 401, statusText: 'Unauthorized' });
    await init;

    expect(session.token()).toBeNull();
    expect(await stored()).toBeNull();
    expect(session.offline()).toBe(false);
    expect(lock.disable).toHaveBeenCalled();
  });

  it('retries after a network error and settles when the server answers', async () => {
    const { session, http } = setup();
    const init = session.init();
    (await me(http)).error(new ProgressEvent('error'));
    await init;

    const settled = session.whenSettled();
    const retry = session.retry();
    (await me(http)).flush(makeUser());
    expect(await retry).toBe(true);
    await settled;

    expect(session.offline()).toBe(false);
    expect(session.loggedIn()).toBe(true);
    await session.clear();
  });

  it('stores a renewed token from the X-Auth-Token header', async () => {
    const { session, http } = setup();
    const init = session.init();
    (await me(http)).flush(makeUser(), { headers: { 'X-Auth-Token': 'renewed' } });
    await init;

    expect(session.token()).toBe('renewed');
    expect(await stored()).toBe('renewed');
    await session.clear();
  });

  it('ignores a renewed token that arrives after sign-out', async () => {
    const { session, http } = setup();
    const init = session.init();
    const req = await me(http);
    await session.clear();
    req.flush(makeUser(), { headers: { 'X-Auth-Token': 'renewed' } });
    await init;

    expect(session.token()).toBeNull();
    expect(await stored()).toBeNull();
    expect(session.user()).toBeNull();
  });
});

describe('SessionStore.clear', () => {
  beforeEach(() => localStorage.clear());

  it('resets the stores of the previous user and disables the lock', async () => {
    const { session, lock } = setup();
    const today = TestBed.inject(TodayStore);
    const goals = TestBed.inject(GoalStore);
    const catalog = TestBed.inject(CatalogStore);
    const notifications = TestBed.inject(NotificationsStore);
    await session.signIn('tok', makeUser());
    today.today.set({ totalCount: 3, doneCount: 1 } as Today);
    goals.goal.set({ id: 'g1', checkpoints: [] } as unknown as Goal);
    goals.error.set(true);
    catalog.catalog.set([{ code: 'WALK' } as QuestType]);
    notifications.unread.set(4);

    await session.clear();

    expect(session.loggedIn()).toBe(false);
    expect(await stored()).toBeNull();
    expect(today.today()).toBeNull();
    expect(goals.goal()).toBeNull();
    expect(goals.error()).toBe(false);
    expect(catalog.catalog()).toEqual([]);
    expect(notifications.unread()).toBe(0);
    expect(lock.disable).toHaveBeenCalled();
  });
});

describe('expiry timer', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('refreshes at the trial end, a minute after the paid period, or after the renewal leeway', () => {
    const now = Date.parse('2026-10-27T12:00:00Z');
    const hour = 3_600_000;
    expect(expiryRefreshIn(makeUser({ pro: true, trial: true, trialEndsAt: '2026-10-27T12:30:00Z' }), now)).toBe(hour / 2 + 1000);
    expect(expiryRefreshIn(makeUser({ pro: true, proExpiresAt: '2026-10-27T13:00:00Z', willRenew: false }), now)).toBe(hour + EXPIRY_REFRESH_DELAY_MS);
    expect(expiryRefreshIn(makeUser({ pro: true, proExpiresAt: '2026-10-27T11:00:00Z', willRenew: true }), now)).toBe(RENEWAL_LEEWAY_MS - hour + EXPIRY_REFRESH_DELAY_MS);
    expect(expiryRefreshIn(makeUser({ pro: true, proExpiresAt: '2026-10-27T11:00:00Z', willRenew: false }), now)).toBeNull();
    expect(expiryRefreshIn(makeUser({ pro: false, proExpiresAt: '2026-10-27T13:00:00Z' }), now)).toBeNull();
  });

  it('reloads /me a minute after proExpiresAt so an open app switches to Free', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const { session, http } = setup();
    await session.signIn('tok', makeUser({ pro: true, proExpiresAt: new Date(Date.now() + 5000).toISOString(), willRenew: false }));

    await vi.advanceTimersByTimeAsync(5000 + EXPIRY_REFRESH_DELAY_MS - 1000);
    http.expectNone(`${API_URL}/me`);
    await vi.advanceTimersByTimeAsync(1000);
    http.expectOne(`${API_URL}/me`).flush(makeUser({ pro: false, proExpiresAt: null, proEndPending: true }));
    await vi.waitFor(() => expect(session.pro()).toBe(false));
    expect(session.user()?.proEndPending).toBe(true);
    await session.clear();
  });

  it('drops the timer on sign-out', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const { session, http } = setup();
    await session.signIn('tok', makeUser({ pro: true, proExpiresAt: new Date(Date.now() + 5000).toISOString(), willRenew: false }));
    await session.clear();
    await vi.advanceTimersByTimeAsync(5000 + EXPIRY_REFRESH_DELAY_MS + 1000);
    http.expectNone(`${API_URL}/me`);
  });
});
