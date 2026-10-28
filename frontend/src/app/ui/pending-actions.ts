import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { ProofView } from '../core/api/models';
import { PendingProofs, canUseAi, canWithdraw, useAiHint } from '../core/pending-proof';
import { Icon } from './icon';

@Component({
  selector: 'app-pending-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    @if (view(); as v) {
      @if (withdrawable(v)) {
        <div class="space-y-2" data-test="pending-actions">
          @if (aiReady(v)) {
            <button class="btn btn-ghost" [disabled]="busy()" (click)="useAi(v)"><app-icon name="ai" />Use AI check instead</button>
          }
          <button class="btn btn-ghost" [disabled]="busy()" (click)="withdraw(v)"><app-icon name="close" />Withdraw proof</button>
          @if (hint(v); as h) { <p class="text-[12px] text-mute text-center leading-snug" data-test="use-ai-hint">{{ h }}</p> }
        </div>
      }
    }
  `
})
export class PendingActions {
  private readonly pending = inject(PendingProofs);

  readonly view = input<ProofView | null>(null);
  readonly changed = output<ProofView>();

  protected readonly busy = signal(false);
  protected readonly withdrawable = canWithdraw;
  protected readonly aiReady = (v: ProofView) => canUseAi(v);
  protected readonly hint = (v: ProofView) => useAiHint(v);

  protected withdraw(v: ProofView): Promise<void> {
    return this.run(() => this.pending.withdraw(v.id, v.kind));
  }

  protected useAi(v: ProofView): Promise<void> {
    return this.run(() => this.pending.useAi(v.id, v.kind));
  }

  private async run(call: () => Promise<ProofView | null>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const updated = await call();
      if (updated) this.changed.emit(updated);
    } finally {
      this.busy.set(false);
    }
  }
}
