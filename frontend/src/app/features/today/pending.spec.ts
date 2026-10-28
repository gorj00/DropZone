import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { QuestStatus, Today, TodayQuest, User } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { PendingProofs } from '../../core/pending-proof';
import { ProofService } from '../../core/proof.service';
import { SessionStore } from '../../core/session.store';
import { GoalStore, TodayStore } from '../../core/stores';
import { ThemeService } from '../../core/theme.service';
import { TodayPage } from './today';

const quest = (id: string, status: QuestStatus, patch: Partial<TodayQuest> = {}) => ({
  quest: { id, code: 'HEALTHY_MEAL', name: 'Healthy meal', icon: 'meal', group: 'BURN_FUEL', proof: 'PHOTO', autoSource: null, target: null, custom: false, days: [], squadCheck: true, perDay: 1, multiSlot: false, checkAudience: 'FRIENDS' },
  status, progress: null, target: null, completionId: `c-${id}`, proofId: status === 'PENDING' ? `p-${id}` : null, verifiedCount: 1, requiredVerifications: 3,
  summary: null, value: null, slot: 1, slots: 1, ...patch
}) as TodayQuest;

async function render(t: Today) {
  const pending = { menu: vi.fn().mockResolvedValue(null) };
  const today = signal<Today | null>(t);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ApiService, useValue: { slipUps: vi.fn().mockResolvedValue([]), unreadNotifications: vi.fn().mockResolvedValue({ count: 0 }) } },
      { provide: LockService, useValue: { native: false, status: signal(null), disable: vi.fn().mockResolvedValue(undefined) } },
      { provide: TodayStore, useValue: { today, left: computed(() => Math.max(0, (today()?.totalCount ?? 0) - (today()?.doneCount ?? 0))), load: vi.fn().mockResolvedValue(t) } },
      { provide: GoalStore, useValue: { goal: signal(null), active: signal(null), load: vi.fn().mockResolvedValue(null) } },
      { provide: ProofService, useValue: { syncAuto: vi.fn().mockResolvedValue(undefined), isPending: () => false } },
      { provide: PendingProofs, useValue: pending }
    ]
  });
  TestBed.inject(ThemeService).set('STEALTH');
  TestBed.inject(SessionStore).user.set({ id: 'u1', pro: true, lockedApps: ['com.instagram.android'], unlockMode: 'WHOLE_DAY', minutesPerQuest: 30, streak: 3 } as unknown as User);
  const fixture = TestBed.createComponent(TodayPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { el, pending, text: () => el.textContent?.replace(/\s+/g, ' ') ?? '' };
}

describe('TodayPage pending Friends check', () => {
  const day: Today = {
    date: '2026-10-28', quests: [quest('a', 'DONE'), quest('b', 'PENDING')], doneCount: 1, totalCount: 2, unlocked: true,
    unlockedUntil: '2026-10-28T23:00:00Z', minutesEarned: 0, streak: 3, friendsCleared: null
  };

  it('shows the day unlocked while the streak waits for the verifies', async () => {
    const { el, text } = await render(day);
    expect(text()).toContain('Unlocked');
    expect(el.querySelector('[data-test=kept-unlock]')).toBeNull();
    expect(el.querySelector('[data-test=stealth-footer]')?.textContent?.trim()).toBe('Open till midnight · streak counts once verified');
    expect(text()).toContain('Friends are verifying · tap to withdraw');
  });

  it('opens the withdraw and AI check menu from the pending quest card', async () => {
    const { el, pending } = await render(day);
    const card = [...el.querySelectorAll<HTMLElement>('.q[role=button]')].find(c => c.textContent?.includes('verifying'))!;
    card.click();
    expect(pending.menu).toHaveBeenCalledWith('p-b', 'QUEST', '/log/c-b');
  });
});
