import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api/api.service';
import { ProofView } from './api/models';
import { ChoiceOption, PromptService } from './prompt.service';
import { SessionStore } from './session.store';
import { GoalStore, TodayStore } from './stores';
import { ToastService } from './toast.service';

export type ProofKind = ProofView['kind'];

export function canWithdraw(v: ProofView | null | undefined): boolean {
  return !!v && v.relation === 'SELF' && v.status === 'PENDING';
}

export function canUseAi(v: ProofView | null | undefined, now = Date.now()): boolean {
  return canWithdraw(v) && !!v?.useAiFrom && Date.parse(v.useAiFrom) <= now;
}

export function useAiHint(v: ProofView | null | undefined, now = Date.now()): string | null {
  if (!canWithdraw(v) || !v?.useAiFrom || Date.parse(v.useAiFrom) <= now) return null;
  const at = new Date(v.useAiFrom).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `No verifies by ${at}? You can switch to the AI check then.`;
}

@Injectable({ providedIn: 'root' })
export class PendingProofs {
  private readonly api = inject(ApiService);
  private readonly prompt = inject(PromptService);
  private readonly toast = inject(ToastService);
  private readonly today = inject(TodayStore);
  private readonly goals = inject(GoalStore);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  async withdraw(proofId: string, kind: ProofKind): Promise<ProofView | null> {
    const ok = await this.prompt.confirm('Withdraw this proof?',
      kind === 'CHECKPOINT'
        ? 'Its post is taken down and nobody can verify it any more. The milestone is active again, so you can send a new proof.'
        : 'Its post is taken down and nobody can verify it any more. The quest is open again, so you can send a new proof.',
      'Withdraw', 'Keep it');
    if (!ok) return null;
    return this.run(() => this.api.withdrawProof(proofId), 'Proof withdrawn.');
  }

  async useAi(proofId: string, kind: ProofKind): Promise<ProofView | null> {
    const ok = await this.prompt.confirm('Use the AI check instead?',
      `It wasn't fully verified within 48 hours. The AI checks your photo and the ${kind === 'CHECKPOINT' ? 'milestone' : 'quest'} counts right away.`,
      'Use AI check', 'Keep waiting');
    if (!ok) return null;
    return this.run(() => this.api.useAiCheck(proofId), kind === 'CHECKPOINT' ? 'Milestone cleared with the AI check.' : 'Quest cleared with the AI check.');
  }

  async menu(proofId: string, kind: ProofKind, details?: string): Promise<ProofView | null> {
    let view: ProofView;
    try {
      view = await this.api.proof(proofId);
    } catch (e) {
      this.toast.error(e);
      return null;
    }
    if (!canWithdraw(view)) {
      if (details) void this.router.navigateByUrl(details);
      return null;
    }
    const post = view.post?.verification;
    const options: ChoiceOption[] = [{ key: 'details', label: 'See proof', icon: 'camera' }];
    if (canUseAi(view)) options.push({ key: 'ai', label: 'Use AI check instead', icon: 'ai' });
    options.push({ key: 'withdraw', label: 'Withdraw proof', icon: 'close', danger: true });
    const done = post ? `${post.count} of ${post.required} verifies so far.` : 'Waiting for verifies.';
    const choice = await this.prompt.choose('Waiting for verifies', options, [done, useAiHint(view)].filter(Boolean).join(' '));
    if (choice === 'details') void this.router.navigateByUrl(details ?? `/p/${proofId}`);
    else if (choice === 'ai') return this.useAi(proofId, kind);
    else if (choice === 'withdraw') return this.withdraw(proofId, kind);
    return null;
  }

  private async run(call: () => Promise<ProofView>, done: string): Promise<ProofView | null> {
    try {
      const view = await call();
      await Promise.all([this.today.load().catch(() => null), this.goals.load()]);
      void this.session.refresh().catch(() => undefined);
      this.toast.show(done);
      return view;
    } catch (e) {
      this.toast.error(e);
      return null;
    }
  }
}
