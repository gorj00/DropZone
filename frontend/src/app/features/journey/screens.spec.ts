import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { Checkpoint, Goal, ProofView, User } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { PromptService } from '../../core/prompt.service';
import { ProofService } from '../../core/proof.service';
import { SessionStore } from '../../core/session.store';
import { ToastService } from '../../core/toast.service';
import { CheckpointPage } from './checkpoint';
import { ClearedPage } from './cleared';
import { JourneyPage } from './journey';

const me = { id: 'me', displayName: 'Alex', handle: 'alex', avatarUrl: null, path: 'LOSE' as const };

const cp = (index: number, patch: Partial<Checkpoint> = {}): Checkpoint => ({
  id: `cp${index}`, index, targetValue: 90 - index * 2, deltaToEarn: index * 2, rewardTitle: `Reward ${index}`, rewardImageUrl: null, isPublic: false, visibility: 'PRIVATE',
  verification: 'AI', deadline: null, status: 'LOCKED', clearedAt: null, proofId: null, verifiedCount: 0, requiredVerifications: 0, ...patch
});

const goal = (checkpoints: Checkpoint[], patch: Partial<Goal> = {}): Goal => ({
  id: 'g1', path: 'LOSE', metric: 'WEIGHT', metricLabel: null, unit: 'kg', startValue: 90, goalValue: 82, currentValue: 87, progressValue: 3, totalValue: 8,
  checkpoints, ...patch
});

const pendingView = (patch: Partial<ProofView> = {}): ProofView => ({
  id: 'p1', kind: 'CHECKPOINT', status: 'PENDING', owner: me, relation: 'SELF', visible: true, post: null, reason: null, moderation: null,
  useAiFrom: new Date(Date.now() + 86_400_000).toISOString(), ...patch
});

function setup(api: Record<string, unknown>, pro = true) {
  const full = {
    measurements: vi.fn().mockResolvedValue([]),
    friends: vi.fn().mockResolvedValue([]),
    checkpointSocial: vi.fn().mockResolvedValue({ hypes: { count: 0, users: [] }, alsoChasing: { count: 0, users: [] } }),
    today: vi.fn().mockRejectedValue(new Error('not needed')),
    ...api
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: ApiService, useValue: full },
      { provide: ProofService, useValue: { checkpointProof: vi.fn().mockResolvedValue(null) } },
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  TestBed.inject(SessionStore).setUser({ ...me, pro, onboarded: true, theme: 'NEON', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, lockedApps: [], weightUnit: 'KG', lengthUnit: 'CM' } as unknown as User);
  return full;
}

async function renderMilestone(g: Goal | (() => Promise<Goal>), id = 'cp1', pro = true, extra: Record<string, unknown> = {}) {
  const api = setup({ goal: typeof g === 'function' ? vi.fn(g) : vi.fn().mockResolvedValue(g), ...extra }, pro);
  const fixture = TestBed.createComponent(CheckpointPage);
  fixture.componentRef.setInput('id', id);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const text = () => el.textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (label: string) => [...el.querySelectorAll('button')].find(b => b.textContent?.replace(/\s+/g, ' ').trim().includes(label)) as HTMLButtonElement | undefined;
  return { api, el, settle, text, button, fixture };
}

describe('Milestone screen', () => {
  it('shows an active milestone with the proof button and what is left', async () => {
    const { text, button, el } = await renderMilestone(goal([cp(1, { status: 'ACTIVE', deltaToEarn: 4 }), cp(2)]));
    expect(text()).toContain('Milestone 01 / 02');
    expect(text()).toContain('Reward 1');
    expect(text()).toContain('1.0 kg to go');
    expect(button('I made it · upload proof')?.disabled).toBe(false);
    expect(el.querySelector('[data-test=seen-by]')?.textContent).toContain('Private');
    expect(text()).toContain('Instant, private');
    expect(el.querySelector('[data-test=pending-actions]')).toBeNull();
    expect(el.querySelector('[data-test=reported]')).toBeNull();
  });

  it('says who sees a shared milestone', async () => {
    const { el } = await renderMilestone(goal([cp(1, { status: 'ACTIVE', visibility: 'EVERYONE', isPublic: true }), cp(2)]));
    expect(el.querySelector('[data-test=seen-by]')?.textContent).toContain('Everyone sees');
  });

  it('keeps a locked milestone closed until the one before is cleared', async () => {
    const { button } = await renderMilestone(goal([cp(1, { status: 'ACTIVE' }), cp(2)]), 'cp2');
    expect(button('Clear milestone 01 first')?.disabled).toBe(true);
    expect(button('I made it')).toBeUndefined();
  });

  it('shows a pending proof with its progress and withdraws it', async () => {
    const pending = goal([cp(1, { status: 'PENDING_VERIFICATION', visibility: 'FRIENDS', verification: 'COMMUNITY', proofId: 'p1', verifiedCount: 1, requiredVerifications: 3 }), cp(2)]);
    const reopened = goal([cp(1, { status: 'ACTIVE', visibility: 'FRIENDS', verification: 'COMMUNITY' }), cp(2)]);
    let current = pending;
    const withdrawProof = vi.fn(() => {
      current = reopened;
      return Promise.resolve(pendingView({ status: 'WITHDRAWN' }));
    });
    const { el, text, button, settle } = await renderMilestone(() => Promise.resolve(current), 'cp1', true, { proof: vi.fn().mockResolvedValue(pendingView()), withdrawProof });

    await vi.waitFor(async () => {
      await settle();
      expect(el.querySelector('[data-test=pending-actions]')).not.toBeNull();
    });
    expect(text()).toContain('Verifying');
    expect(text()).toContain('Proof is live · 1/3');
    expect(text()).toContain('3 verifies from your friends');
    expect(el.querySelector('[data-test=use-ai-hint]')?.textContent).toContain('switch to the AI check');
    expect(button('Use AI check instead')).toBeUndefined();

    button('Withdraw proof')!.click();
    const prompt = TestBed.inject(PromptService);
    await vi.waitFor(() => expect(prompt.confirmation()?.title).toBe('Withdraw this proof?'));
    expect(prompt.confirmation()?.message).toContain('The milestone is active again');
    prompt.answer(true);

    await vi.waitFor(() => expect(withdrawProof).toHaveBeenCalledWith('p1'));
    await vi.waitFor(async () => {
      await settle();
      expect(button('I made it · upload proof')).toBeDefined();
    });
    expect(el.querySelector('[data-test=pending-actions]')).toBeNull();
    expect(TestBed.inject(ToastService).message()?.text).toBe('Proof withdrawn.');
  });

  it('keeps the proof when the withdrawal is cancelled', async () => {
    const withdrawProof = vi.fn();
    const g = goal([cp(1, { status: 'PENDING_VERIFICATION', visibility: 'FRIENDS', verification: 'COMMUNITY', proofId: 'p1', verifiedCount: 0, requiredVerifications: 3 }), cp(2)]);
    const { el, button, settle } = await renderMilestone(g, 'cp1', true, { proof: vi.fn().mockResolvedValue(pendingView()), withdrawProof });
    await vi.waitFor(async () => {
      await settle();
      expect(el.querySelector('[data-test=pending-actions]')).not.toBeNull();
    });
    button('Withdraw proof')!.click();
    const prompt = TestBed.inject(PromptService);
    await vi.waitFor(() => expect(prompt.confirmation()).not.toBeNull());
    prompt.answer(false);
    await settle();
    expect(withdrawProof).not.toHaveBeenCalled();
    expect(button('Withdraw proof')).toBeDefined();
  });

  it('shows a cleared milestone with its proof badge and the reward link', async () => {
    const { el, text } = await renderMilestone(goal([cp(1, { status: 'CLEARED', clearedAt: '2026-10-20T10:00:00Z', proofId: 'p1', aiChecked: true }), cp(2, { status: 'ACTIVE' })]));
    expect(text()).toContain('Cleared');
    expect(text()).toContain('Reached');
    expect(el.querySelector('[data-test=proof-badge]')?.textContent?.trim()).toBe('AI verified');
    const link = [...el.querySelectorAll('a')].find(a => a.textContent?.includes('Reward unlocked'));
    expect(link?.getAttribute('href')).toBe('/journey/cp1/cleared');
  });

  it('flags a reported milestone and explains it', async () => {
    const { el } = await renderMilestone(goal([cp(1, { status: 'ACTIVE', visibility: 'FRIENDS', moderation: 'REMOVED' }), cp(2)]));
    const flag = el.querySelector('[data-test=reported]');
    expect(flag?.textContent).toContain('Reported');
    expect(flag?.textContent).toContain('Removed for breaking the community rules.');
  });
});

describe('Journey map', () => {
  beforeAll(() => {
    if (!('ResizeObserver' in globalThis)) Object.assign(globalThis, { ResizeObserver: class { observe() { } disconnect() { } } });
  });

  async function renderMap(g: Goal) {
    setup({ goal: vi.fn().mockResolvedValue(g) });
    const fixture = TestBed.createComponent(JourneyPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const card = (id: string) => [...el.querySelectorAll(`a.jc`)].find(a => a.getAttribute('href') === `/journey/${id}`)?.textContent?.replace(/\s+/g, ' ') ?? '';
    return { el, card };
  }

  it('shows every milestone state on the map', async () => {
    const { el, card } = await renderMap(goal([
      cp(1, { status: 'CLEARED', clearedAt: '2026-10-10T10:00:00Z' }),
      cp(2, { status: 'PENDING_VERIFICATION', visibility: 'FRIENDS', verification: 'COMMUNITY', proofId: 'p2', verifiedCount: 2, requiredVerifications: 3 }),
      cp(3, { status: 'ACTIVE', deltaToEarn: 6 }),
      cp(4)
    ], { progressValue: 3 }));
    expect(card('cp1')).toContain('Unlocked');
    expect(card('cp2')).toContain('Verifying 2/3');
    expect(card('cp3')).toContain('to go');
    expect(card('cp4')).toContain('Final');
    expect(el.querySelector('[data-test=goal-reached]')).toBeNull();
  });

  it('celebrates a reached goal above the finished map', async () => {
    const { el, card } = await renderMap(goal([
      cp(1, { status: 'CLEARED' }), cp(2, { status: 'CLEARED' })
    ], { currentValue: 82, progressValue: 8, reached: true }));
    const panel = el.querySelector('[data-test=goal-reached]');
    expect(panel?.textContent).toContain('Goal reached');
    expect(panel?.querySelector('[data-test=new-goal]')?.getAttribute('href')).toBe('/goal/new');
    expect(card('cp2')).toContain('Final');
  });
});

describe('Cleared screen', () => {
  async function renderCleared(c: Checkpoint) {
    setup({ goal: vi.fn().mockResolvedValue(goal([c, cp(2, { status: 'ACTIVE' })])) });
    const fixture = TestBed.createComponent(ClearedPage);
    fixture.componentRef.setInput('id', 'cp1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { el, back: [...el.querySelectorAll('a')].find(a => a.getAttribute('href') === '/journey')?.textContent?.trim() };
  }

  it('offers to keep a private milestone private', async () => {
    const { back } = await renderCleared(cp(1, { status: 'CLEARED', proofId: 'p1', aiChecked: true }));
    expect(back).toBe('Keep it private');
  });

  it('does not promise privacy for a milestone that is already shared', async () => {
    const { back, el } = await renderCleared(cp(1, { status: 'CLEARED', proofId: 'p1', visibility: 'FRIENDS', verification: 'COMMUNITY', requiredVerifications: 3 }));
    expect(back).toBe('Back to journey');
    expect(el.querySelector('[data-test=proof-badge]')?.textContent?.trim()).toBe('Verified by 3 people');
  });
});
