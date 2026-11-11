import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Type, signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { API_URL } from '../../core/api/api.service';
import { QuestType, User } from '../../core/api/models';
import { authInterceptor } from '../../core/auth';
import { LockService } from '../../core/native/lock';
import { SessionStore } from '../../core/session.store';
import { CatalogStore } from '../../core/stores';
import { LockPage } from './lock';
import { OnboardingState } from './onboarding.state';
import { QuestsPage } from './quests';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const user = (patch: Partial<User> = {}) => ({
  id: 'u1', onboarded: false, theme: 'NEON', timezone: tz, lockedApps: [], path: null, pro: false, trial: false, trialEndsAt: null, ...patch
}) as unknown as User;
const quest = (code: string, name: string, free: boolean): QuestType => ({
  code, name, path: 'LOSE', icon: 'steps', group: 'BURN_FUEL', proof: 'PHOTO', free, autoSource: null, target: null, multiSlot: false, defaultDays: [1, 2, 3, 4, 5, 6, 7], defaultPerDay: 1
});

async function setup(u: Partial<User>) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', children: [] }]),
      { provide: LockService, useValue: { native: false, blocked: () => false, ready: () => true, allowed: (a: { free: boolean }, pro: boolean) => pro || a.free, status: signal(null), disable: vi.fn().mockResolvedValue(undefined), sync: vi.fn() } }
    ]
  });
  const session = TestBed.inject(SessionStore);
  await session.signIn('tok', user(u));
  TestBed.inject(CatalogStore).catalog.set([quest('STEPS', 'Steps', true), quest('GYM', 'Gym session', false)]);
  const router = TestBed.inject(Router);
  const nav = vi.spyOn(router, 'navigateByUrl');
  return { session, router, nav, state: TestBed.inject(OnboardingState), http: TestBed.inject(HttpTestingController) };
}

async function mount<T>(type: Type<T>) {
  const fixture = TestBed.createComponent(type);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = (label: string) => [...el.querySelectorAll('button')].find(b => b.textContent?.includes(label)) as HTMLButtonElement;
  return { fixture, el, button };
}

describe('onboarding before the trial starts', () => {
  beforeEach(() => localStorage.clear());

  it('offers PRO quests without a paywall to a brand-new account', async () => {
    const { state, nav, session } = await setup({});
    expect(session.trialAhead()).toBe(true);
    const { fixture, el, button } = await mount(QuestsPage);
    expect(el.querySelector('.tile.pro')).toBeNull();
    expect(el.querySelector('.pro-badge')).toBeNull();

    button('Gym session').click();
    fixture.detectChanges();
    expect(state.questCodes()).toContain('GYM');
    expect(nav).not.toHaveBeenCalledWith('/paywall');
    await session.clear();
  });

  it('still gates PRO quests once a trial has ended', async () => {
    const { state, nav, session } = await setup({ trialEndsAt: '2026-01-01T00:00:00Z' });
    expect(session.trialAhead()).toBe(false);
    const { el, button } = await mount(QuestsPage);
    expect(el.querySelector('.tile.pro')).not.toBeNull();

    button('Gym session').click();
    expect(state.questCodes()).not.toContain('GYM');
    expect(nav).toHaveBeenCalledWith('/paywall');
    await session.clear();
  });

  it('keeps PRO apps and Minutes on the lock step and opens the trial page with the real end', async () => {
    const { state, nav, session, http } = await setup({});
    state.lockedApps.set(['com.instagram.android', 'com.zhiliaoapp.musically']);
    state.unlockMode.set('MINUTES');
    state.questCodes.set(['STEPS', 'GYM']);
    const { button } = await mount(LockPage);

    expect(state.lockedApps()).toEqual(['com.instagram.android', 'com.zhiliaoapp.musically']);
    expect(state.unlockMode()).toBe('MINUTES');
    const minutes = button('Minutes per quest');
    expect(minutes.textContent).not.toContain('PRO');
    button('YouTube').click();
    expect(state.lockedApps()).toContain('com.google.android.youtube');
    expect(nav).not.toHaveBeenCalledWith('/paywall');

    button('Lock it in').click();
    const req = await vi.waitFor(() => http.expectOne(`${API_URL}/onboarding`));
    expect(req.request.body).toMatchObject({ questCodes: ['STEPS', 'GYM'], unlockMode: 'MINUTES', lockedApps: ['com.instagram.android', 'com.zhiliaoapp.musically', 'com.google.android.youtube'] });
    const ends = new Date(Date.now() + 7 * 86_400_000).toISOString();
    req.flush({ user: user({ onboarded: true, pro: true, trial: true, trialEndsAt: ends, path: 'LOSE' }), goal: { checkpoints: [] } });
    await vi.waitFor(() => expect(nav).toHaveBeenCalledWith('/trial', { replaceUrl: true }));
    expect(session.trialEndsAt()).toBe(ends);
    await session.clear();
  });
});
