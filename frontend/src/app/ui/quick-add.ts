import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SessionStore } from '../core/session.store';
import { ToastService } from '../core/toast.service';
import { Icon } from './icon';
import { SlipUpSheet } from './slip-up-sheet';

@Component({
  selector: 'app-quick-add',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, SlipUpSheet],
  template: `
    <div class="mx-5 mt-4 grid grid-cols-2 gap-2.5">
      <button class="card h-[52px] flex items-center justify-center gap-2 font-bold text-[14px]" (click)="slipUp()">
        <span class="text-accent2 inline-flex"><app-icon name="plus" [size]="16" /></span>Slip-up
        @if (!pro()) { <span class="text-gold inline-flex"><app-icon name="crown" [size]="14" /></span> }
      </button>
      <button class="card h-[52px] flex items-center justify-center gap-2 font-bold text-[14px]" (click)="customQuest()">
        <span class="text-accent inline-flex"><app-icon name="plus" [size]="16" /></span>Custom quest
        @if (!pro()) { <span class="text-gold inline-flex"><app-icon name="crown" [size]="14" /></span> }
      </button>
    </div>
    @if (sheet()) { <app-slip-up-sheet (closed)="sheet.set(false)" (logged)="logged.emit()" /> }
  `
})
export class QuickAdd {
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly logged = output<void>();
  protected readonly pro = this.session.pro;
  protected readonly tracking = computed(() => !!this.session.user()?.slipUpTracking);
  protected readonly sheet = signal(false);

  protected slipUp(): void {
    if (!this.pro()) {
      void this.router.navigateByUrl('/paywall');
      return;
    }
    if (!this.tracking()) {
      this.toast.show('Turn on slip-up tracking in Settings first.');
      void this.router.navigateByUrl('/settings');
      return;
    }
    this.sheet.set(true);
  }

  protected customQuest(): void {
    void this.router.navigateByUrl(this.pro() ? '/stats/custom-quest' : '/paywall');
  }
}
