import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { Checkpoint, Goal, PastGoal, User } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { ProofService } from '../../core/proof.service';
import { SessionStore } from '../../core/session.store';
import { GoalStore } from '../../core/stores';
import { ToastService } from '../../core/toast.service';
import { ProfilePage } from '../profile/profile';
import { JourneyPage } from './journey';
import { NewGoalPage, suggestedTarget } from './new-goal';

const cp = (index: number, patch: Partial<Checkpoint> = {}): Checkpoint => ({
  id: `cp${index}`, index, targetValue: 90 - index * 3, deltaToEarn: index * 3, rewardTitle: null, rewardImageUrl: null, isPublic: false, visibility: 'PRIVATE',
  verification: 'AI', deadline: null, status: 'CLEARED', clearedAt: '2026-10-20', proofId: null, verifiedCount: 0, requiredVerifications: 0, ...patch
});

const reached = (patch: Partial<Goal> = {}): Goal => ({
  id: 'g1', path: 'LOSE', metric: 'WEIGHT', metricLabel: null, unit: 'kg', startValue: 90, goalValue: 78, currentValue: 78, progressValue: 12, totalValue: 12,
  checkpoints: [cp(1), cp(2), cp(3), cp(4)], reached: true, ...patch
});

function setup(api: Record<string, unknown>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: ApiService, useValue: api },
      { provide: ProofService, useValue: {} },
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  TestBed.inject(SessionStore).setUser({ id: 'me', pro: false, onboarded: true, theme: 'NEON', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, lockedApps: [], weightUnit: 'KG', lengthUnit: 'CM' } as unknown as User);
}

describe('Goal reached', () => {
  beforeAll(() => {
    if (!('ResizeObserver' in globalThis)) Object.assign(globalThis, { ResizeObserver: class { observe() { } disconnect() { } } });
  });

  it('celebrates on the journey and links to a new goal', async () => {
    setup({ goal: vi.fn().mockResolvedValue(reached()), measurements: vi.fn().mockResolvedValue([]), friends: vi.fn().mockResolvedValue([]) });
    const fixture = TestBed.createComponent(JourneyPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const panel = (fixture.nativeElement as HTMLElement).querySelector('[data-test=goal-reached]');
    expect(panel?.textContent).toContain('Goal reached');
    expect(panel?.textContent).toContain('−12.0 kg');
    expect(panel?.querySelector('[data-test=new-goal]')?.getAttribute('href')).toBe('/goal/new');
  });

  it('shows no celebration while the goal is still open', async () => {
    setup({ goal: vi.fn().mockResolvedValue(reached({ reached: false, checkpoints: [cp(1), cp(2, { status: 'ACTIVE' })] })), measurements: vi.fn().mockResolvedValue([]), friends: vi.fn().mockResolvedValue([]) });
    const fixture = TestBed.createComponent(JourneyPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-test=goal-reached]')).toBeNull();
  });

  it('starts the new goal at the current value and sends the goal and milestone count', async () => {
    const next = reached({ id: 'g2', startValue: 78, goalValue: 73.5, reached: false, checkpoints: [cp(1, { status: 'ACTIVE' })] });
    const api = { goal: vi.fn().mockResolvedValue(reached()), newGoal: vi.fn().mockResolvedValue(next) };
    setup(api);
    const fixture = TestBed.createComponent(NewGoalPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-test=start]')?.textContent?.trim()).toBe('78.0');
    expect(el.querySelector<HTMLInputElement>('input[aria-label="New goal"]')?.value).toBe('73.5');
    expect(el.querySelector('[data-test=problem]')).toBeNull();
    const three = [...el.querySelectorAll<HTMLButtonElement>('button.opt')].find(b => b.textContent?.trim() === '3')!;
    three.click();
    fixture.detectChanges();
    [...el.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Start new goal')!.click();
    await vi.waitFor(() => expect(api.newGoal).toHaveBeenCalledWith({ goalValue: 73.5, checkpoints: 3 }));
    await vi.waitFor(() => expect(TestBed.inject(GoalStore).goal()?.id).toBe('g2'));
    expect(TestBed.inject(ToastService).message()?.text).toBe('New goal set. Pick rewards for your milestones.');
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/journey'));
  });

  it('refuses a new goal on the wrong side of the current value', async () => {
    setup({ goal: vi.fn().mockResolvedValue(reached()), newGoal: vi.fn() });
    const fixture = TestBed.createComponent(NewGoalPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('input[aria-label="New goal"]')!;
    input.value = '80';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelector('[data-test=problem]')?.textContent?.trim()).toBe('Your new goal has to be below where you are now.');
    expect([...el.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === 'Start new goal')!.disabled).toBe(true);
  });

  it('sends the user back to the journey when the goal is not reached yet', async () => {
    setup({ goal: vi.fn().mockResolvedValue(reached({ reached: false })) });
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const fixture = TestBed.createComponent(NewGoalPage);
    fixture.detectChanges();
    await vi.waitFor(() => expect(nav).toHaveBeenCalledWith('/journey', { replaceUrl: true }));
  });

  it('suggests a goal a few percent beyond the current value', () => {
    expect(suggestedTarget(reached(), 0.5, 1, v => v)).toBe(73.5);
    expect(suggestedTarget(reached({ path: 'GAIN', metric: 'STRENGTH', currentValue: 100 }), 2.5, 1, v => v)).toBe(110);
  });

  it('lists past goals on the profile', async () => {
    const past: PastGoal = {
      id: 'old', path: 'LOSE', metric: 'WEIGHT', metricLabel: null, unit: 'kg', startValue: 90, goalValue: 78, endValue: 78, startedAt: '2026-03-01T10:00:00Z',
      endedAt: '2026-10-28T10:00:00Z', reachedAt: '2026-10-27T10:00:00Z', reached: true, milestones: 4, milestonesCleared: 4
    };
    setup({
      goal: vi.fn().mockResolvedValue(reached({ id: 'g2', reached: false })), transformations: vi.fn().mockResolvedValue([]), pastGoals: vi.fn().mockResolvedValue([past]),
      stats: vi.fn().mockResolvedValue(null)
    });
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const list = (fixture.nativeElement as HTMLElement).querySelector('[data-test=past-goals]');
    expect(list?.textContent).toContain('90.0 → 78.0 kg');
    expect(list?.textContent).toContain('Mar 1, 2026 – Oct 27, 2026 · 4/4 milestones');
    expect(list?.textContent).toContain('Reached');
  });
});
