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
  pro: true, trial: false, trialEndsAt: null, proExpiresAt: null, unlockMode: 'WHOLE_DAY', minutesPerQuest: 30, weightUnit: 'KG', lengthUnit: 'CM',
  publicByDefault: false, defaultVerification: 'AI', ...patch
}) as unknown as User;

const meal = { code: 'HEALTHY_MEAL', path: 'LOSE', name: 'Healthy meal', icon: 'meal', group: 'BURN_FUEL', proof: 'PHOTO', free: true, autoSource: null, target: null, multiSlot: true, defaultDays: [1, 2, 3, 4, 5, 6, 7], defaultPerDay: 3 };
const mealQuest = (patch: Record<string, unknown> = {}) => ({
  id: 'q1', code: 'HEALTHY_MEAL', name: 'Healthy meal', icon: 'meal', group: 'BURN_FUEL', proof: 'PHOTO', autoSource: null, target: null, custom: false,
  days: [1, 2, 3, 4, 5, 6, 7], squadCheck: false, perDay: 1, multiSlot: true, checkAudience: 'FRIENDS', ...patch
});
const NEED_FRIENDS = { status: 400, code: 'VALIDATION', message: 'You need at least 3 friends for Friends check, or choose Everyone' };

async function render(patch: Partial<User> = {}) {
  const plugin = {
    addListener: vi.fn().mockResolvedValue({ remove: () => Promise.resolve() }),
    checkPermissions: vi.fn().mockResolvedValue({ receive: 'granted' }),
    requestPermissions: vi.fn(),
    register: vi.fn().mockResolvedValue(undefined)
  };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', children: [] }]),
      { provide: LockService, useValue: { native: false, blocked: () => false, status: signal(null), disable: vi.fn().mockResolvedValue(undefined) } },
      { provide: PUSH, useValue: { native: false, plugin } },
      { provide: APP_SETTINGS, useValue: { openNotificationSettings: vi.fn() } },
      { provide: DataExportService, useValue: { download: vi.fn() } }
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
  await settle();
  const text = () => el.textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (label: string) => [...el.querySelectorAll('button')].find(b => b.textContent?.replace(/\s+/g, ' ').trim().includes(label)) as HTMLButtonElement | undefined;
  return { session, http, el, text, button, settle, prompt: TestBed.inject(PromptService), toast: TestBed.inject(ToastService) };
}

type Rendered = Awaited<ReturnType<typeof render>>;

async function openQuests(r: Rendered, quest = mealQuest()) {
  (await vi.waitFor(() => r.http.expectOne(`${API_URL}/quests`))).flush([quest]);
  (await vi.waitFor(() => r.http.expectOne(`${API_URL}/quests/catalog`))).flush([meal]);
  await r.settle();
  r.button('Daily quests')!.click();
  await r.settle();
  return () => r.el.querySelector<HTMLButtonElement>('[aria-label="Friends check Healthy meal"]')!;
}

describe('SettingsPage Friends check', () => {
  beforeEach(() => localStorage.clear());

  it('explains how it works, asks Friends or Everyone and offers Everyone when there are fewer than 3 friends', async () => {
    const r = await render();
    const squad = await openQuests(r);
    squad().click();
    await vi.waitFor(() => expect(r.prompt.choice()?.title).toBe('Friends check'));
    expect(r.prompt.choice()?.message).toContain('3 people verify each photo. Until then the day counts as unlocked');
    expect(r.prompt.choice()?.message).toContain('your streak counts once');
    expect(r.prompt.choice()?.options.map(o => o.label)).toEqual(['Friends', 'Everyone']);
    r.prompt.pick('FRIENDS');

    const first = await vi.waitFor(() => r.http.expectOne(req => req.method === 'PATCH' && req.url === `${API_URL}/quests/q1`));
    expect(first.request.body).toEqual({ squadCheck: true, checkAudience: 'FRIENDS' });
    first.flush(NEED_FRIENDS, { status: 400, statusText: 'Bad Request' });

    await vi.waitFor(() => expect(r.prompt.choice()?.title).toBe('Add 3 friends first'));
    expect(r.prompt.choice()?.message).toBe('Friends check needs at least 3 friends to verify your photos. Add friends, or let everyone verify instead.');
    expect(r.prompt.choice()?.options.map(o => o.label)).toEqual(['Add friends', 'Let everyone verify']);
    r.prompt.pick('everyone');

    const second = await vi.waitFor(() => r.http.expectOne(req => req.method === 'PATCH' && req.url === `${API_URL}/quests/q1`));
    expect(second.request.body).toEqual({ squadCheck: true, checkAudience: 'EVERYONE' });
    second.flush(mealQuest({ squadCheck: true, checkAudience: 'EVERYONE' }));
    await vi.waitFor(() => expect(r.toast.message()?.text).toBe('Healthy meal: everyone can verify it'));
    await r.settle();
    expect(r.text()).toContain('Everyone verifies');
    await r.session.clear();
  });

  it('sends the user to Add friends from the 3-friends message', async () => {
    const r = await render();
    const squad = await openQuests(r);
    squad().click();
    await vi.waitFor(() => expect(r.prompt.choice()?.title).toBe('Friends check'));
    r.prompt.pick('FRIENDS');
    (await vi.waitFor(() => r.http.expectOne(req => req.method === 'PATCH'))).flush(NEED_FRIENDS, { status: 400, statusText: 'Bad Request' });
    await vi.waitFor(() => expect(r.prompt.choice()?.title).toBe('Add 3 friends first'));
    r.prompt.pick('friends');
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/squad/friends'));
    r.http.expectNone(req => req.method === 'PATCH');
    await r.session.clear();
  });

  it('lets the user switch the audience or turn the check off', async () => {
    const r = await render();
    const squad = await openQuests(r, mealQuest({ squadCheck: true, checkAudience: 'FRIENDS' }));
    squad().click();
    await vi.waitFor(() => expect(r.prompt.choice()?.options.map(o => o.label)).toEqual(['Friends · current', 'Everyone', 'Turn Friends check off']));
    r.prompt.pick('OFF');
    const req = await vi.waitFor(() => r.http.expectOne(x => x.method === 'PATCH' && x.url === `${API_URL}/quests/q1`));
    expect(req.request.body).toEqual({ squadCheck: false });
    req.flush(mealQuest({ squadCheck: false }));
    await vi.waitFor(() => expect(r.toast.message()?.text).toBe('Healthy meal: Friends check off'));
    await r.session.clear();
  });
});

describe('SettingsPage privacy defaults', () => {
  beforeEach(() => localStorage.clear());

  const cp = (index: number, status: string) => ({
    id: `cp${index}`, index, targetValue: 70 - index, deltaToEarn: index, rewardTitle: null, rewardImageUrl: null, isPublic: false, visibility: 'PRIVATE',
    verification: 'AI', deadline: null, status, clearedAt: null, proofId: null, verifiedCount: 0, requiredVerifications: 0
  });
  const goal = { id: 'g1', path: 'LOSE', metric: 'WEIGHT', metricLabel: null, unit: 'kg', startValue: 70, goalValue: 66, currentValue: 69, progressValue: 1, totalValue: 4, checkpoints: [cp(1, 'CLEARED'), cp(2, 'ACTIVE'), cp(3, 'LOCKED')] };

  it('asks to apply a changed default to the remaining milestones and toasts the count', async () => {
    const r = await render();
    r.button('Public milestone rewards')!.click();
    const patch = await vi.waitFor(() => r.http.expectOne(x => x.method === 'PATCH' && x.url === `${API_URL}/me`));
    expect(patch.request.body).toEqual({ publicByDefault: true });
    patch.flush(user({ publicByDefault: true }));
    (await vi.waitFor(() => r.http.expectOne(`${API_URL}/goal`))).flush(goal);
    await vi.waitFor(() => expect(r.prompt.confirmation()?.title).toBe('Apply to your 2 remaining milestones?'));
    r.prompt.answer(true);
    const apply = await vi.waitFor(() => r.http.expectOne(`${API_URL}/goal/apply-defaults`));
    expect(apply.request.method).toBe('POST');
    apply.flush({ count: 2 });
    await vi.waitFor(() => expect(r.toast.message()?.text).toBe('Updated 2 milestones.'));
    (await vi.waitFor(() => r.http.expectOne(`${API_URL}/goal`))).flush(goal);
    await r.session.clear();
  });

  it('asks after a Verification change too and keeps the milestones on Not now', async () => {
    const r = await render();
    r.button('Verification')!.click();
    await r.settle();
    r.button('Community3 people verify it')!.click();
    const patch = await vi.waitFor(() => r.http.expectOne(x => x.method === 'PATCH' && x.url === `${API_URL}/me`));
    expect(patch.request.body).toEqual({ defaultVerification: 'COMMUNITY' });
    patch.flush(user({ defaultVerification: 'COMMUNITY' }));
    (await vi.waitFor(() => r.http.expectOne(`${API_URL}/goal`))).flush(goal);
    await vi.waitFor(() => expect(r.prompt.confirmation()?.title).toBe('Apply to your 2 remaining milestones?'));
    r.prompt.answer(false);
    await r.settle();
    r.http.expectNone(`${API_URL}/goal/apply-defaults`);
    await r.session.clear();
  });

  it('does not ask when no milestone is left', async () => {
    const r = await render();
    r.button('Public milestone rewards')!.click();
    (await vi.waitFor(() => r.http.expectOne(x => x.method === 'PATCH' && x.url === `${API_URL}/me`))).flush(user({ publicByDefault: true }));
    (await vi.waitFor(() => r.http.expectOne(`${API_URL}/goal`))).flush({ ...goal, checkpoints: [cp(1, 'CLEARED')] });
    await r.settle();
    expect(r.prompt.confirmation()).toBeNull();
    await r.session.clear();
  });
});
