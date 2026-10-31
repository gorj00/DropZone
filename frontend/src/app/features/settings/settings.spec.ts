import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { API_URL } from '../../core/api/api.service';
import { User } from '../../core/api/models';
import { authInterceptor } from '../../core/auth';
import { LockService } from '../../core/native/lock';
import { DataExportService } from '../../core/data-export';
import { APP_SETTINGS, PUSH } from '../../core/native/push';
import { PromptService } from '../../core/prompt.service';
import { SessionStore } from '../../core/session.store';
import { ToastService } from '../../core/toast.service';
import { SettingsPage } from './settings';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const user = (patch: Partial<User> = {}) => ({
  id: 'u1', email: 'alex@test.dev', displayName: 'Alex', handle: 'alex', avatarUrl: null, onboarded: true, theme: 'NEON', timezone: tz, lockedApps: [], path: 'LOSE',
  pro: false, trial: false, trialEndsAt: null, proExpiresAt: null, unlockMode: 'WHOLE_DAY', minutesPerQuest: 30, weightUnit: 'KG', lengthUnit: 'CM', ...patch
}) as unknown as User;

async function render(patch: Partial<User>, receive = 'granted', native = true) {
  const plugin = {
    addListener: vi.fn().mockResolvedValue({ remove: () => Promise.resolve() }),
    checkPermissions: vi.fn().mockResolvedValue({ receive }),
    requestPermissions: vi.fn().mockResolvedValue({ receive: 'denied' }),
    register: vi.fn().mockResolvedValue(undefined)
  };
  const appSettings = { openNotificationSettings: vi.fn().mockResolvedValue(undefined) };
  const dataExport = { download: vi.fn().mockResolvedValue('saved') };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', children: [] }]),
      { provide: LockService, useValue: { native: false, blocked: () => false, status: signal(null), disable: vi.fn().mockResolvedValue(undefined) } },
      { provide: PUSH, useValue: { native, plugin } },
      { provide: APP_SETTINGS, useValue: appSettings },
      { provide: DataExportService, useValue: dataExport }
    ]
  });
  const session = TestBed.inject(SessionStore);
  await session.signIn('tok', user(patch));
  const fixture = TestBed.createComponent(SettingsPage);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await vi.waitFor(async () => {
    await settle();
    if (native) expect(plugin.checkPermissions).toHaveBeenCalled();
  });
  await settle();
  const text = () => el.textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (label: string) => [...el.querySelectorAll('button')].find(b => b.textContent?.replace(/\s+/g, ' ').trim().includes(label)) as HTMLButtonElement | undefined;
  return { session, http, el, text, button, settle, plugin, appSettings, dataExport };
}

describe('SettingsPage handle check', () => {
  beforeEach(() => localStorage.clear());

  it('checks the handle only after it is edited', async () => {
    const { el, http, settle, session } = await render({ handle: 'jake.lifts', displayName: 'Jake' });
    await new Promise(r => setTimeout(r, 450));
    http.expectNone(r => r.url.endsWith('/users/handle-available'));
    expect(el.textContent).not.toContain('Available');
    const input = el.querySelector('input[autocomplete="username"]') as HTMLInputElement;
    input.value = 'jake.lifts2';
    input.dispatchEvent(new Event('input'));
    await settle();
    const check = await vi.waitFor(() => http.expectOne(r => r.url.endsWith('/users/handle-available')));
    expect(check.request.body).toEqual({ handle: 'jake.lifts2' });
    check.flush({ handle: 'jake.lifts2', valid: true, available: true, message: null });
    await session.clear();
  });
});

describe('SettingsPage plan', () => {
  beforeEach(() => localStorage.clear());

  it('says Renews only while the subscription renews and names the plan', async () => {
    const { text, session } = await render({ pro: true, proExpiresAt: '2026-11-27T10:00:00Z', willRenew: true, proProductId: 'pro_monthly:monthly' });
    expect(text()).toContain('DropZone PRO · Monthly');
    expect(text()).toContain('Renews Nov 27, 2026');
    await session.clear();
  });

  it('says Ends · Resubscribe for a cancelled subscription and opens the plans', async () => {
    const { text, button, session } = await render({ pro: true, proExpiresAt: '2026-11-27T10:00:00Z', willRenew: false, proProductId: 'pro_yearly:yearly' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    expect(text()).toContain('Ends Nov 27, 2026 · Resubscribe');
    expect(text()).not.toContain('Renews');
    button('DropZone PRO · Yearly')!.click();
    expect(navigate).toHaveBeenCalledWith('/paywall');
    await session.clear();
  });

  it('shows the payment problem banner with the Play link', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { button, session } = await render({ pro: true, proExpiresAt: '2026-11-27T10:00:00Z', willRenew: true, billingIssue: true, proProductId: 'pro_monthly:monthly' });
    button('Payment problem — fix it in Google Play to keep PRO')!.click();
    expect(open).toHaveBeenCalledWith('https://play.google.com/store/account/subscriptions?sku=pro_monthly&package=com.dropzone.app', '_blank');
    open.mockRestore();
    await session.clear();
  });

  it('shows the account-hold banner with the Play link', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { button, session } = await render({ pro: false, billingHold: true, proProductId: 'pro_monthly:monthly' });
    button('PRO is on hold — fix your payment in Google Play to get it back')!.click();
    expect(open).toHaveBeenCalledWith('https://play.google.com/store/account/subscriptions?sku=pro_monthly&package=com.dropzone.app', '_blank');
    open.mockRestore();
    await session.clear();
  });

  it('shows a scheduled plan switch instead of the renewal', async () => {
    const { text, session } = await render({ pro: true, proExpiresAt: '2027-03-01T12:00:00Z', willRenew: true, proProductId: 'pro_yearly:yearly', pendingPlanId: 'pro_weekly', pendingPlanAt: '2027-03-01T12:00:00Z' });
    expect(text()).toContain('DropZone PRO · Yearly');
    expect(text()).toContain('Switches to Weekly on Mar 1, 2027');
    expect(text()).not.toContain('Renews');
    await session.clear();
  });

  it('shows a lifetime grant as active PRO without a renewal date', async () => {
    const { text, session } = await render({ pro: true, proExpiresAt: null, willRenew: false, proProductId: 'rc_promo_pro_lifetime' });
    expect(text()).toContain('DropZone PRO');
    expect(text()).toContain('Active');
    expect(text()).not.toContain('Renews');
    expect(text()).not.toContain('Resubscribe');
    await session.clear();
  });

  it('tells a trial user without a purchase that no subscription was found', async () => {
    const { button, http, session } = await render({ pro: true, trial: true, trialEndsAt: new Date(Date.now() + 86_400_000).toISOString() });
    button('Restore purchases')!.click();
    (await vi.waitFor(() => http.expectOne(`${API_URL}/billing/refresh`))).flush(user({ pro: true, trial: true }));
    await vi.waitFor(() => expect(TestBed.inject(ToastService).message()?.text).toBe('No subscription found on this Google Play account.'));
    await session.clear();
  });
});

describe('SettingsPage notifications', () => {
  beforeEach(() => localStorage.clear());

  it('shows On when allowed', async () => {
    const { el, session } = await render({}, 'granted');
    const row = [...el.querySelectorAll('div')].find(d => d.textContent?.trim().startsWith('Notifications'))!;
    expect(row.textContent).toContain('On');
    await session.clear();
  });

  it('asks Android when it still can and opens the notification settings when blocked', async () => {
    const { button, plugin, appSettings, session } = await render({}, 'prompt');
    button('Turn on')!.click();
    await vi.waitFor(() => expect(plugin.requestPermissions).toHaveBeenCalled());
    const prompt = TestBed.inject(PromptService);
    await vi.waitFor(() => expect(prompt.confirmation()?.title).toBe('Notifications are off'));
    expect(prompt.confirmation()?.yes).toBe('Open settings');
    prompt.answer(true);
    await vi.waitFor(() => expect(appSettings.openNotificationSettings).toHaveBeenCalledTimes(1));
    await session.clear();
  });

  it('opens the app notification settings from the Notification settings row on Android', async () => {
    const { button, appSettings, session } = await render({}, 'granted');
    button('Notification settings')!.click();
    await vi.waitFor(() => expect(appSettings.openNotificationSettings).toHaveBeenCalledTimes(1));
    await session.clear();
  });

  it('hides the Notification settings row on the web', async () => {
    const { button, text, session } = await render({}, 'granted', false);
    expect(text()).toContain('Android only');
    expect(button('Notification settings')).toBeUndefined();
    await session.clear();
  });
});

describe('SettingsPage streak and data', () => {
  beforeEach(() => localStorage.clear());

  it('switches Skip days with nothing scheduled and explains the streak effect', async () => {
    const { button, http, text, settle, session } = await render({ skipRestDays: false, streak: 2 });
    expect(text()).toContain("When on, days without quests don't break your streak.");
    const toggle = button('Skip days with nothing scheduled')!;
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    toggle.click();
    const req = await vi.waitFor(() => http.expectOne(r => r.method === 'PATCH' && r.url === `${API_URL}/me`));
    expect(req.request.body).toEqual({ skipRestDays: true });
    req.flush(user({ skipRestDays: true, streak: 5 }));
    await vi.waitFor(() => expect(session.user()?.streak).toBe(5));
    (await vi.waitFor(() => http.expectOne(r => r.url.startsWith(`${API_URL}/today`)))).flush({ date: '2026-10-28', quests: [], doneCount: 0, totalCount: 0, unlocked: true, unlockedUntil: null, minutesEarned: 0, streak: 5, friendsCleared: null });
    await settle();
    expect(button('Skip days with nothing scheduled')!.getAttribute('aria-checked')).toBe('true');
    await session.clear();
  });

  it('downloads the data export from Account', async () => {
    const { button, dataExport, session } = await render({});
    button('Download my data')!.click();
    await vi.waitFor(() => expect(dataExport.download).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(TestBed.inject(ToastService).message()?.text).toBe('Your data was downloaded.'));
    await session.clear();
  });
});

describe('SettingsPage privacy and push switches', () => {
  beforeEach(() => localStorage.clear());

  const patchOnce = async (http: HttpTestingController) => vi.waitFor(() => http.expectOne(r => r.method === 'PATCH' && r.url === `${API_URL}/me`));

  it('turns Hide me from search and Hide me from leaderboards on for free users', async () => {
    const { button, http, settle, session, text } = await render({ hiddenFromSearch: false, hiddenFromLeaderboards: false });
    expect(text()).toContain('Your invite link still works.');

    const search = button('Hide me from search')!;
    expect(search.getAttribute('aria-checked')).toBe('false');
    search.click();
    let req = await patchOnce(http);
    expect(req.request.body).toEqual({ hiddenFromSearch: true });
    req.flush(user({ hiddenFromSearch: true }));
    await settle();
    expect(button('Hide me from search')!.getAttribute('aria-checked')).toBe('true');

    button('Hide me from leaderboards')!.click();
    req = await patchOnce(http);
    expect(req.request.body).toEqual({ hiddenFromLeaderboards: true });
    req.flush(user({ hiddenFromSearch: true, hiddenFromLeaderboards: true }));
    await settle();
    expect(button('Hide me from leaderboards')!.getAttribute('aria-checked')).toBe('true');
    await session.clear();
  });

  it('shows Verify requests on by default under Notifications and mutes them', async () => {
    const { button, http, settle, session, el } = await render({});
    const labels = [...el.querySelectorAll('.lbl')].map(l => l.textContent?.trim());
    expect(labels).toContain('Notifications');
    const toggle = button('Verify requests')!;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    toggle.click();
    const req = await patchOnce(http);
    expect(req.request.body).toEqual({ verifyRequestPushes: false });
    req.flush(user({ verifyRequestPushes: false }));
    await settle();
    expect(button('Verify requests')!.getAttribute('aria-checked')).toBe('false');
    await session.clear();
  });

  it('shows Comments pushes on by default and turns them off', async () => {
    const { button, http, settle, session } = await render({});
    const toggle = button('Comments')!;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    toggle.click();
    const req = await patchOnce(http);
    expect(req.request.body).toEqual({ commentPushes: false });
    req.flush(user({ commentPushes: false }));
    await settle();
    expect(button('Comments')!.getAttribute('aria-checked')).toBe('false');
    await session.clear();
  });
});
