import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { Today, TodayQuest, User } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { AppLockStatus } from '../../core/native/plugins';
import { ThemeService } from '../../core/theme.service';
import { ProofService } from '../../core/proof.service';
import { SessionStore } from '../../core/session.store';
import { GoalStore, TodayStore } from '../../core/stores';
import { TodayPage, dayLabel } from './today';

describe('dayLabel', () => {
  it('names the weekday and date of the given moment', () => {
    expect(dayLabel(new Date(2026, 9, 27, 23, 59))).toBe('Tue · Oct 27');
  });

  it('moves to the next day after midnight', () => {
    expect(dayLabel(new Date(2026, 9, 28, 0, 1))).toBe('Wed · Oct 28');
  });
});

describe('TodayPage date label', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the new date when the page reloads after midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 27, 23, 59));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: { slipUps: vi.fn().mockResolvedValue([]) } },
        { provide: LockService, useValue: { native: false, status: signal(null), disable: vi.fn().mockResolvedValue(undefined) } },
        { provide: TodayStore, useValue: { today: signal(null), left: signal(0), load: vi.fn().mockRejectedValue(new Error('offline')) } },
        { provide: GoalStore, useValue: { goal: signal(null), active: signal(null), load: vi.fn().mockResolvedValue(null) } },
        { provide: ProofService, useValue: { syncAuto: vi.fn(), isPending: () => false } }
      ]
    });
    const fixture = TestBed.createComponent(TodayPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const label = () => (fixture.nativeElement as HTMLElement).querySelector('.lbl')?.textContent?.trim();
    expect(label()).toBe('Tue · Oct 27');

    vi.setSystemTime(new Date(2026, 9, 28, 0, 1));
    document.dispatchEvent(new Event('visibilitychange'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(label()).toBe('Wed · Oct 28');
  });
});

const quest = (id: string, status: 'TODO' | 'DONE') => ({
  quest: { id, code: id, name: id, icon: 'meal', group: 'BURN_FUEL', proof: 'CHECKIN', autoSource: null, target: null, custom: false, days: [], squadCheck: false, perDay: 1, multiSlot: false },
  status, progress: null, target: null, completionId: null, proofId: null, verifiedCount: 0, requiredVerifications: 0, summary: null, value: null, slot: 1, slots: 1
}) as TodayQuest;

const day = (patch: Partial<Today>): Today => ({
  date: '2026-10-28', quests: [], doneCount: 0, totalCount: 0, unlocked: false, unlockedUntil: null, minutesEarned: 0, streak: 3, friendsCleared: null, ...patch
});

async function renderDay(t: Today, opts: { theme?: 'NEON' | 'STEALTH'; mode?: 'WHOLE_DAY' | 'MINUTES'; minutesLeft?: number | null } = {}) {
  const status = signal<AppLockStatus | null>(null);
  const refreshStatus = vi.fn(async () => {
    const s = { serviceEnabled: true, overlayPermission: true, usagePermission: true, advancedProtection: false, minutesUsed: 7, minutesLeft: opts.minutesLeft ?? 0 } as AppLockStatus;
    if (opts.minutesLeft !== null && opts.minutesLeft !== undefined) status.set(s);
    return s;
  });
  const today = signal<Today | null>(t);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ApiService, useValue: { slipUps: vi.fn().mockResolvedValue([]), unreadNotifications: vi.fn().mockResolvedValue({ count: 0 }) } },
      { provide: LockService, useValue: { native: true, status, refreshStatus, incomplete: () => false, disable: vi.fn().mockResolvedValue(undefined) } },
      { provide: TodayStore, useValue: { today, left: computed(() => Math.max(0, (today()?.totalCount ?? 0) - (today()?.doneCount ?? 0))), load: vi.fn().mockResolvedValue(t) } },
      { provide: GoalStore, useValue: { goal: signal(null), active: signal(null), load: vi.fn().mockResolvedValue(null) } },
      { provide: ProofService, useValue: { syncAuto: vi.fn().mockResolvedValue(undefined), isPending: () => false } }
    ]
  });
  TestBed.inject(ThemeService).set(opts.theme ?? 'STEALTH');
  TestBed.inject(SessionStore).user.set({ id: 'u1', pro: true, lockedApps: ['com.instagram.android'], unlockMode: opts.mode ?? 'WHOLE_DAY', minutesPerQuest: 30, streak: 3 } as unknown as User);
  const fixture = TestBed.createComponent(TodayPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const text = () => el.textContent?.replace(/\s+/g, ' ') ?? '';
  return { fixture, el, text, refreshStatus, status };
}

describe('TodayPage minutes left', () => {
  const partly = day({ quests: [quest('a', 'DONE'), quest('b', 'TODO')], doneCount: 1, totalCount: 2, unlocked: true, minutesEarned: 30 });

  it('shows the minutes left from the lock in Minutes mode (stealth)', async () => {
    const { el, text } = await renderDay(partly, { mode: 'MINUTES', minutesLeft: 23 });
    expect(el.querySelector('[data-test=stealth-footer]')?.textContent?.trim()).toBe('23 min left · clear more quests to earn more');
    expect(text()).toContain('Unlocked');
  });

  it('shows the minutes left under the raid card (neon)', async () => {
    const { el, text } = await renderDay(partly, { theme: 'NEON', mode: 'MINUTES', minutesLeft: 23 });
    expect(el.querySelector('[data-test=minutes-left]')?.textContent?.trim()).toBe('23 min left · clear more quests to earn more');
    expect(text()).toContain('30 min earned');
  });

  it('shows the apps as locked once the earned minutes are used up', async () => {
    const { el, text } = await renderDay(partly, { mode: 'MINUTES', minutesLeft: 0 });
    expect(el.querySelector('[data-test=stealth-footer]')?.textContent?.trim()).toBe('0 min left · clear more quests to earn more');
    expect(text()).toContain('Locked');
    expect(text()).not.toContain('Unlocked');
  });

  it('refreshes the lock status on load and when the app comes back', async () => {
    const { fixture, refreshStatus } = await renderDay(partly, { mode: 'MINUTES', minutesLeft: 23 });
    expect(refreshStatus).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('visibilitychange'));
    await fixture.whenStable();
    expect(refreshStatus).toHaveBeenCalledTimes(2);
  });

  it('says nothing about minutes while the native status is unknown', async () => {
    const { el } = await renderDay(partly, { mode: 'MINUTES', minutesLeft: null });
    expect(el.querySelector('[data-test=stealth-footer]')?.textContent?.trim()).toBe('30 min earned · +30 min per quest');
  });

  it('shows open till midnight once every quest is done in Minutes mode', async () => {
    const done = day({ quests: [quest('a', 'DONE')], doneCount: 1, totalCount: 1, unlocked: true, unlockedUntil: '2026-10-28T23:00:00Z', minutesEarned: 30 });
    const { el } = await renderDay(done, { mode: 'MINUTES', minutesLeft: 5 });
    expect(el.querySelector('[data-test=stealth-footer]')?.textContent?.trim()).toBe('All clear · open till midnight');
  });
});

describe('TodayPage day kept unlocked', () => {
  const kept = { unlocked: true, unlockedUntil: '2026-10-28T23:00:00Z' };

  it('shows an unlocked day without 0/0 when the list is empty', async () => {
    const { el, text } = await renderDay(day(kept));
    expect(text()).not.toContain('0/0');
    expect(text()).toContain('Unlocked');
    expect(el.querySelector('svg text')).toBeNull();
    expect(el.querySelector('[data-test=stealth-footer]')?.textContent?.trim()).toBe('All clear · open till midnight');
    expect(text()).toContain('Rest day');
  });

  it('explains open free quests on a day cleared before PRO ended (neon)', async () => {
    const { el, text } = await renderDay(day({ ...kept, quests: [quest('a', 'TODO'), quest('b', 'TODO')], totalCount: 2 }), { theme: 'NEON' });
    expect(text()).toContain('Unlocked');
    expect(text()).toContain('All clear');
    expect(text()).not.toContain('0 cleared');
    expect(el.querySelector('[data-test=kept-unlock]')?.textContent).toContain('Today is already cleared.');
    expect(el.querySelectorAll('.hs.ok').length).toBe(1);
  });

  it('shows the count for a normally cleared day', async () => {
    const { el, text } = await renderDay(day({ ...kept, quests: [quest('a', 'DONE')], doneCount: 1, totalCount: 1 }));
    expect(text()).toContain('1/1');
    expect(el.querySelector('[data-test=kept-unlock]')).toBeNull();
  });

  it('shows "no quests today" in the neon raid strip', async () => {
    const { text } = await renderDay(day(kept), { theme: 'NEON' });
    expect(text()).toContain('Daily raid · no quests today');
    expect(text()).not.toContain('0 quests');
  });
});

describe('TodayPage billing banner', () => {
  it('links a payment problem to the Play subscription page', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: { slipUps: vi.fn().mockResolvedValue([]), unreadNotifications: vi.fn().mockResolvedValue({ count: 0 }) } },
        { provide: LockService, useValue: { native: false, status: signal(null), disable: vi.fn().mockResolvedValue(undefined) } },
        { provide: TodayStore, useValue: { today: signal(null), left: signal(0), load: vi.fn().mockRejectedValue(new Error('offline')) } },
        { provide: GoalStore, useValue: { goal: signal(null), active: signal(null), load: vi.fn().mockResolvedValue(null) } },
        { provide: ProofService, useValue: { syncAuto: vi.fn(), isPending: () => false } }
      ]
    });
    TestBed.inject(SessionStore).user.set({ id: 'u1', pro: true, billingIssue: true, proProductId: 'pro_monthly:monthly', lockedApps: [] } as unknown as User);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const fixture = TestBed.createComponent(TodayPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const banner = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(b => b.textContent?.includes('Payment problem — fix it in Google Play to keep PRO'));
    banner!.click();
    expect(open).toHaveBeenCalledWith('https://play.google.com/store/account/subscriptions?sku=pro_monthly&package=com.dropzone.app', '_blank');
    open.mockRestore();
  });

  it('links an account hold to the Play subscription page', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: { slipUps: vi.fn().mockResolvedValue([]), unreadNotifications: vi.fn().mockResolvedValue({ count: 0 }) } },
        { provide: LockService, useValue: { native: false, status: signal(null), disable: vi.fn().mockResolvedValue(undefined) } },
        { provide: TodayStore, useValue: { today: signal(null), left: signal(0), load: vi.fn().mockRejectedValue(new Error('offline')) } },
        { provide: GoalStore, useValue: { goal: signal(null), active: signal(null), load: vi.fn().mockResolvedValue(null) } },
        { provide: ProofService, useValue: { syncAuto: vi.fn(), isPending: () => false } }
      ]
    });
    TestBed.inject(SessionStore).user.set({ id: 'u1', pro: false, billingHold: true, proProductId: 'pro_monthly:monthly', lockedApps: [] } as unknown as User);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const fixture = TestBed.createComponent(TodayPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const banner = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(b => b.textContent?.includes('PRO is on hold — fix your payment in Google Play to get it back'));
    banner!.click();
    expect(open).toHaveBeenCalledWith('https://play.google.com/store/account/subscriptions?sku=pro_monthly&package=com.dropzone.app', '_blank');
    open.mockRestore();
  });
});
