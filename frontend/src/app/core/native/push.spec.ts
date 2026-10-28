import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { API_URL } from '../api/api.service';
import { User } from '../api/models';
import { AuthService, authInterceptor } from '../auth';
import { pushLink } from '../links';
import { PromptService } from '../prompt.service';
import { SessionStore } from '../session.store';
import { ToastService } from '../toast.service';
import { LockService } from './lock';
import { PUSH, PUSH_ASKED_KEY, PushService } from './push';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const user = (patch: Partial<User> = {}) => ({ id: 'u1', onboarded: true, theme: 'NEON', timezone: tz, lockedApps: [], pro: true, ...patch }) as unknown as User;
const PLAY = 'https://play.google.com/store/account/subscriptions?sku=pro_monthly&package=com.dropzone.app';

describe('pushLink', () => {
  it('routes every push type', () => {
    const table: [Record<string, string>, string][] = [
      [{ type: 'DAILY_REMINDER' }, '/today'],
      [{ type: 'VERIFY_REQUEST', proofId: 'p1', feedItemId: 'f1' }, '/p/p1'],
      [{ type: 'VERIFIED', proofId: 'p2', completed: 'true' }, '/p/p2'],
      [{ type: 'PROOF_REJECTED', proofId: 'p3' }, '/p/p3'],
      [{ type: 'HYPE', feedItemId: 'f2' }, '/post/f2'],
      [{ type: 'COMMENT', feedItemId: 'f3' }, '/post/f3'],
      [{ type: 'FRIEND_REQUEST', requestId: 'r1', userId: 'u2' }, '/squad/friends'],
      [{ type: 'FRIEND_ACCEPTED' }, '/squad/friends'],
      [{ type: 'ADMIN_REPORT', targetType: 'POST', targetId: 'f4' }, '/admin/reports/POST/f4'],
      [{ type: 'ADMIN_REPORT', targetType: 'USER', targetId: 'u9' }, '/admin/reports/USER/u9'],
      [{ type: 'TRIAL_ENDING' }, '/paywall'],
      [{ type: 'TRIAL_ENDED', link: '/paywall' }, '/paywall'],
      [{ type: 'PRO_ENDED', link: '/paywall' }, '/paywall'],
      [{ type: 'BILLING_ISSUE', link: PLAY }, PLAY],
      [{ type: 'PRO_BACK' }, '/today'],
      [{ type: 'DEADLINE_REMINDER', checkpointId: 'cp7', link: '/journey/cp7' }, '/journey/cp7'],
      [{ type: 'ACCOUNT_DELETION' }, '/today'],
      [{ type: 'ACCOUNT_SUSPENDED' }, '/today'],
      [{ type: 'COMMENT', feedItemId: 'f9', commentId: 'c1' }, '/post/f9'],
      [{ type: 'VERIFY_REQUEST', proofId: 'p1', feedItemId: 'f1', count: '1' }, '/p/p1'],
      [{ type: 'VERIFY_REQUEST', proofId: 'p1', feedItemId: 'f1', count: '4' }, '/squad?show=verify']
    ];
    for (const [data, link] of table) expect(pushLink(data), data['type']).toBe(link);
  });

  it('falls back to the milestone or the journey for a deadline reminder without a usable link', () => {
    expect(pushLink({ type: 'DEADLINE_REMINDER', checkpointId: 'cp7' })).toBe('/journey/cp7');
    expect(pushLink({ type: 'DEADLINE_REMINDER', checkpointId: 'cp7', link: 'https://evil.test/x' })).toBe('/journey/cp7');
    expect(pushLink({ type: 'DEADLINE_REMINDER' })).toBe('/journey');
  });

  it('falls back when ids or links are missing or foreign', () => {
    expect(pushLink({ type: 'VERIFY_REQUEST' })).toBe('/squad');
    expect(pushLink({ type: 'VERIFIED' })).toBe('/journey');
    expect(pushLink({ type: 'HYPE' })).toBe('/squad');
    expect(pushLink({ type: 'ADMIN_REPORT', targetType: 'OTHER', targetId: 'x' })).toBe('/admin/reports');
    expect(pushLink({ type: 'PRO_ENDED', link: 'https://evil.test' })).toBe('/paywall');
    expect(pushLink({ type: 'BILLING_ISSUE', link: 'https://evil.test' }, 'pro_yearly:y')).toBe('https://play.google.com/store/account/subscriptions?sku=pro_yearly&package=com.dropzone.app');
    expect(pushLink({ type: 'BILLING_ISSUE' })).toBe('https://play.google.com/store/account/subscriptions?package=com.dropzone.app');
    expect(pushLink(null)).toBe('/today');
  });
});

function fakePlugin(receive = 'prompt') {
  const handlers: Record<string, (e: unknown) => void> = {};
  return {
    handlers,
    addListener: vi.fn((event: string, fn: (e: unknown) => void) => {
      handlers[event] = fn;
      return Promise.resolve({ remove: () => Promise.resolve() });
    }),
    checkPermissions: vi.fn().mockResolvedValue({ receive }),
    requestPermissions: vi.fn().mockResolvedValue({ receive: 'granted' }),
    register: vi.fn(() => {
      handlers['registration']?.({ value: 'fcm-1' });
      return Promise.resolve();
    })
  };
}

async function setup(plugin = fakePlugin()) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', children: [] }]),
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } },
      { provide: PUSH, useValue: { native: true, plugin } }
    ]
  });
  const session = TestBed.inject(SessionStore);
  await session.signIn('tok', user());
  return {
    plugin,
    session,
    push: TestBed.inject(PushService),
    http: TestBed.inject(HttpTestingController),
    prompt: TestBed.inject(PromptService),
    auth: TestBed.inject(AuthService)
  };
}

const putToken = (http: HttpTestingController) => vi.waitFor(() => http.expectOne(r => r.method === 'PUT' && r.url === `${API_URL}/me/push-token`));

describe('PushService registration', () => {
  beforeEach(() => localStorage.clear());

  it('explains before the system prompt and asks only once', async () => {
    const { push, plugin, prompt, http, session } = await setup();
    const started = push.start();
    await vi.waitFor(() => expect(prompt.confirmation()?.title).toBe('Turn on notifications?'));
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
    prompt.answer(true);
    await started;

    expect(plugin.requestPermissions).toHaveBeenCalledTimes(1);
    expect(push.permission()).toBe('granted');
    const put = await putToken(http);
    expect(put.request.body).toEqual({ token: 'fcm-1' });
    put.flush(null);
    expect((await Preferences.get({ key: PUSH_ASKED_KEY })).value).toBe('1');

    await session.clear();
    await session.signIn('tok2', user({ id: 'u2' }));
    plugin.checkPermissions.mockResolvedValue({ receive: 'prompt' });
    await push.start();
    expect(prompt.confirmation()).toBeNull();
    expect(plugin.requestPermissions).toHaveBeenCalledTimes(1);
    await session.clear();
  });

  it('registers again after every sign-in', async () => {
    const { push, plugin, http, session } = await setup(fakePlugin('granted'));
    await push.start();
    const first = await putToken(http);
    expect(first.request.headers.get('Authorization')).toBe('Bearer tok');
    first.flush(null);

    await session.clear();
    await session.signIn('tok-b', user({ id: 'u2' }));
    await push.start();
    const second = await putToken(http);
    expect(second.request.headers.get('Authorization')).toBe('Bearer tok-b');
    second.flush(null);
    expect(plugin.register).toHaveBeenCalledTimes(2);
    expect(plugin.addListener).toHaveBeenCalledTimes(3);
    await session.clear();
  });

  it('removes the token on sign-out before the JWT is dropped', async () => {
    const { push, http, auth, session } = await setup(fakePlugin('granted'));
    await push.start();
    (await putToken(http)).flush(null);

    const signOut = auth.signOut();
    const del = await vi.waitFor(() => http.expectOne(r => r.method === 'DELETE' && r.url === `${API_URL}/me/push-token`));
    expect(del.request.body).toEqual({ token: 'fcm-1' });
    expect(del.request.headers.get('Authorization')).toBe('Bearer tok');
    expect(session.token()).toBe('tok');
    del.flush({ code: 'INTERNAL', message: 'Down' }, { status: 500, statusText: 'Error' });
    await signOut;
    expect(session.token()).toBeNull();
  });

  it('skips the removal when the server already revoked the session', async () => {
    const { push, http, auth, session } = await setup(fakePlugin('granted'));
    await push.start();
    (await putToken(http)).flush(null);
    await auth.signOut({ revoked: true });
    http.expectNone(r => r.method === 'DELETE');
    expect(session.token()).toBeNull();
  });

  it('turns notifications on from Settings when Android can still ask', async () => {
    const { push, plugin, http, session } = await setup(fakePlugin('prompt'));
    expect(await push.enable()).toBe('granted');
    expect(plugin.requestPermissions).toHaveBeenCalledTimes(1);
    (await putToken(http)).flush(null);
    await session.clear();
  });
});

describe('PushService messages', () => {
  beforeEach(() => localStorage.clear());

  it('bumps the bell and shows a toast for a push in the foreground', async () => {
    const { push, plugin, http, session } = await setup(fakePlugin('granted'));
    await push.start();
    (await putToken(http)).flush(null);

    plugin.handlers['pushNotificationReceived']({ title: 'Mia hyped your post', body: 'Day 4', data: { type: 'HYPE', feedItemId: 'f1' } });
    (await vi.waitFor(() => http.expectOne(`${API_URL}/notifications/unread-count`))).flush({ count: 3 });
    expect(TestBed.inject(ToastService).message()?.text).toBe('Mia hyped your post');
    http.expectNone(`${API_URL}/me`);
    await session.clear();
  });

  it('reloads the account on billing pushes', async () => {
    const { push, http, session } = await setup(fakePlugin('granted'));
    push.received({ id: 'n', title: 'Your PRO subscription ended', data: { type: 'PRO_ENDED', link: '/paywall' } });
    (await vi.waitFor(() => http.expectOne(`${API_URL}/notifications/unread-count`))).flush({ count: 1 });
    (await vi.waitFor(() => http.expectOne(`${API_URL}/me`))).flush(user({ pro: false, proEndPending: true }));
    await vi.waitFor(() => expect(session.pro()).toBe(false));
    await session.clear();
  });

  it('reloads the account on a suspension push and when it is tapped', async () => {
    const { push, http, session } = await setup(fakePlugin('granted'));
    push.received({ id: 'n', title: 'Your DropZone account is suspended', data: { type: 'ACCOUNT_SUSPENDED' } });
    (await vi.waitFor(() => http.expectOne(`${API_URL}/notifications/unread-count`))).flush({ count: 0 });
    (await vi.waitFor(() => http.expectOne(`${API_URL}/me`))).flush(user({ suspended: true }));
    await vi.waitFor(() => expect(session.suspended()).toBe(true));

    session.setUser(user());
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const opened = push.open({ type: 'ACCOUNT_SUSPENDED' });
    (await vi.waitFor(() => http.expectOne(`${API_URL}/me`))).flush(user({ suspended: true }));
    await opened;
    expect(session.suspended()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/today');
    await session.clear();
  });

  it('opens the to-verify list for a batched verify request', async () => {
    const { push, session } = await setup(fakePlugin('granted'));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    await push.open({ type: 'VERIFY_REQUEST', proofId: 'p7', feedItemId: 'f7', count: '3' });
    expect(navigate).toHaveBeenCalledWith('/squad?show=verify');
    await session.clear();
  });

  it('opens the item of a tapped push', async () => {
    const { plugin, push, session, http } = await setup(fakePlugin('granted'));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await push.start();
    (await putToken(http)).flush(null);

    plugin.handlers['pushNotificationActionPerformed']({ actionId: 'tap', notification: { id: '1', data: { type: 'VERIFY_REQUEST', proofId: 'p7' } } });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/p/p7'));

    plugin.handlers['pushNotificationActionPerformed']({ actionId: 'tap', notification: { id: '2', data: { type: 'BILLING_ISSUE', link: PLAY } } });
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith(PLAY, '_blank'));
    open.mockRestore();
    await session.clear();
  });
});
