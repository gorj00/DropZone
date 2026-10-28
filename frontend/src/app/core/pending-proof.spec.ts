import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PendingActions } from '../ui/pending-actions';
import { ApiService } from './api/api.service';
import { ProofView } from './api/models';
import { PendingProofs, canUseAi, canWithdraw, useAiHint } from './pending-proof';
import { PromptService } from './prompt.service';
import { SessionStore } from './session.store';
import { GoalStore, TodayStore } from './stores';
import { ToastService } from './toast.service';

const HOUR = 3_600_000;
const owner = { id: 'me', displayName: 'Alex', handle: 'alex', avatarUrl: null, path: 'LOSE' as const };

function view(patch: Partial<ProofView> = {}): ProofView {
  return {
    id: 'p1', kind: 'QUEST', status: 'PENDING', owner, relation: 'SELF', visible: true, reason: null, moderation: null,
    useAiFrom: new Date(Date.now() + 20 * HOUR).toISOString(),
    post: { id: 'f1', verification: { required: 3, count: 1, verifiedByMe: false, canVerify: false } } as ProofView['post'],
    ...patch
  };
}

describe('pending proof rules', () => {
  it('lets the owner withdraw a pending proof at any time', () => {
    expect(canWithdraw(view())).toBe(true);
    expect(canWithdraw(view({ relation: 'FRIEND' }))).toBe(false);
    expect(canWithdraw(view({ status: 'VERIFIED' }))).toBe(false);
    expect(canWithdraw(view({ status: 'WITHDRAWN' }))).toBe(false);
    expect(canWithdraw(null)).toBe(false);
  });

  it('offers the AI check only once the proof is 48 hours old', () => {
    const now = Date.now();
    expect(canUseAi(view({ useAiFrom: new Date(now + HOUR).toISOString() }), now)).toBe(false);
    expect(canUseAi(view({ useAiFrom: new Date(now - HOUR).toISOString() }), now)).toBe(true);
    expect(canUseAi(view({ useAiFrom: null }), now)).toBe(false);
    expect(canUseAi(view({ relation: 'NONE', useAiFrom: new Date(now - HOUR).toISOString() }), now)).toBe(false);
    expect(useAiHint(view({ useAiFrom: new Date(now + HOUR).toISOString() }), now)).toContain('You can switch to the AI check then.');
    expect(useAiHint(view({ useAiFrom: new Date(now - HOUR).toISOString() }), now)).toBeNull();
  });
});

describe('PendingProofs', () => {
  function setup(v: ProofView) {
    const api = {
      proof: vi.fn().mockResolvedValue(v),
      withdrawProof: vi.fn().mockResolvedValue({ ...v, status: 'WITHDRAWN' }),
      useAiCheck: vi.fn().mockResolvedValue({ ...v, status: 'VERIFIED' })
    };
    const today = { load: vi.fn().mockResolvedValue(null) };
    const goals = { load: vi.fn().mockResolvedValue(null) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: ApiService, useValue: api },
        { provide: TodayStore, useValue: today },
        { provide: GoalStore, useValue: goals },
        { provide: SessionStore, useValue: { refresh: vi.fn().mockResolvedValue(null) } }
      ]
    });
    return { api, today, goals, prompt: TestBed.inject(PromptService), toast: TestBed.inject(ToastService), pending: TestBed.inject(PendingProofs) };
  }

  it('asks before withdrawing and reloads Today and the goal', async () => {
    const { api, today, goals, prompt, toast, pending } = setup(view());
    const done = pending.withdraw('p1', 'QUEST');
    await vi.waitFor(() => expect(prompt.confirmation()?.title).toBe('Withdraw this proof?'));
    expect(prompt.confirmation()?.message).toContain('The quest is open again');
    prompt.answer(true);
    expect((await done)?.status).toBe('WITHDRAWN');
    expect(api.withdrawProof).toHaveBeenCalledWith('p1');
    expect(today.load).toHaveBeenCalled();
    expect(goals.load).toHaveBeenCalled();
    expect(toast.message()?.text).toBe('Proof withdrawn.');
  });

  it('does nothing when the withdraw is cancelled', async () => {
    const { api, prompt, pending } = setup(view());
    const done = pending.withdraw('p1', 'CHECKPOINT');
    await vi.waitFor(() => expect(prompt.confirmation()?.message).toContain('The milestone is active again'));
    prompt.answer(false);
    expect(await done).toBeNull();
    expect(api.withdrawProof).not.toHaveBeenCalled();
  });

  it('shows Use AI check instead in the quest menu only after 48 hours', async () => {
    const early = setup(view());
    const menu = early.pending.menu('p1', 'QUEST', '/log/c1');
    await vi.waitFor(() => expect(early.prompt.choice()?.options.map(o => o.label)).toEqual(['See proof', 'Withdraw proof']));
    expect(early.prompt.choice()?.message).toContain('1 of 3 verifies so far.');
    early.prompt.pick('details');
    await menu;
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/log/c1'));
    TestBed.resetTestingModule();

    const late = setup(view({ useAiFrom: new Date(Date.now() - HOUR).toISOString() }));
    const run = late.pending.menu('p1', 'QUEST');
    await vi.waitFor(() => expect(late.prompt.choice()?.options.map(o => o.label)).toEqual(['See proof', 'Use AI check instead', 'Withdraw proof']));
    late.prompt.pick('ai');
    await vi.waitFor(() => expect(late.prompt.confirmation()?.title).toBe('Use the AI check instead?'));
    late.prompt.answer(true);
    expect((await run)?.status).toBe('VERIFIED');
    expect(late.api.useAiCheck).toHaveBeenCalledWith('p1');
  });
});

describe('PendingActions', () => {
  function render(v: ProofView | null) {
    TestBed.configureTestingModule({ providers: [{ provide: PendingProofs, useValue: { withdraw: vi.fn(), useAi: vi.fn() } }] });
    const fixture = TestBed.createComponent(PendingActions);
    fixture.componentRef.setInput('view', v);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { el, labels: () => [...el.querySelectorAll('button')].map(b => b.textContent?.trim()) };
  }

  it('shows Withdraw at once and the AI check after 48 hours', () => {
    const fresh = render(view());
    expect(fresh.labels()).toEqual(['Withdraw proof']);
    expect(fresh.el.querySelector('[data-test=use-ai-hint]')).not.toBeNull();
    TestBed.resetTestingModule();
    expect(render(view({ useAiFrom: new Date(Date.now() - HOUR).toISOString() })).labels()).toEqual(['Use AI check instead', 'Withdraw proof']);
  });

  it('shows nothing to people other than the owner or for a finished proof', () => {
    expect(render(view({ relation: 'FRIEND' })).el.querySelector('[data-test=pending-actions]')).toBeNull();
    TestBed.resetTestingModule();
    expect(render(view({ status: 'VERIFIED' })).el.querySelector('[data-test=pending-actions]')).toBeNull();
  });
});
