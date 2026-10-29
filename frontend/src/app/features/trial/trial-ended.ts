import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionStore } from '../../core/session.store';
import { ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';
import { AppTile, LOCKABLE_APPS } from '../../ui/app-tile';
import { Badge } from '../../ui/badge';
import { Icon } from '../../ui/icon';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppTile, Badge, Icon],
  template: `
    <div class="screen pb-[calc(24px+env(safe-area-inset-bottom))]"
      style="background: radial-gradient(circle at 50% 14%, rgba(var(--gold-rgb), .18), transparent 40%), radial-gradient(130% 55% at 50% 0%, var(--bg-top) 0%, transparent 60%), var(--bg)">
      <div class="flex flex-col items-center pt-8 pad text-center">
        <app-badge tone="gold" [size]="64" [icon]="copy.icon" />
        <div class="h text-[36px] [[data-theme=stealth]_&]:text-[38px] mt-4 leading-[.95]">
          Your <span class="text-gold">PRO</span> {{ copy.title }}
        </div>
        <p class="text-[14px] text-mute mt-2.5 max-w-[300px]">{{ copy.text }}</p>
      </div>

      <div class="mx-5 mt-5" [class]="theme.isNeon() ? 'tcard' : 'card-gold'" [style.border-color]="theme.isNeon() ? 'rgba(var(--gold-rgb),.45)' : null">
        @if (theme.isNeon()) {
          <div class="strip gold"><span>With PRO you keep</span><span class="flex items-center gap-1"><app-icon name="crown" [size]="13" />PRO</span></div>
        }
        <div class="px-4 py-1.5">
          @for (p of keep; track p.title; let first = $first) {
            <div class="flex items-center gap-3 py-2" [class.border-t]="!first" [class.border-line]="!first">
              <span class="qi !w-[34px] !h-[34px] !rounded-[10px] bg-[rgba(var(--gold-rgb),.12)] text-gold"><app-icon [name]="p.icon" [size]="17" /></span>
              <span class="flex-1 min-w-0 font-bold text-[14px] leading-tight">{{ p.title }}</span>
              @if (p.apps) {
                <span class="flex">
                  @for (a of apps; track a.pkg; let i = $index) { <span [class.-ml-1.5]="i > 0"><app-tile [key]="a.key" [size]="20" /></span> }
                </span>
              }
            </div>
          }
        </div>
      </div>

      <div class="mx-5 mt-3 card px-4 py-3.5">
        <div class="lbl">Free plan</div>
        <p class="text-[13px] text-mute mt-1.5 leading-snug">3 basic quests, the Instagram lock, and private goals and photos. Your PRO settings are saved and come back when you subscribe.</p>
      </div>

      <div class="mt-auto pad pt-5">
        <button class="btn btn-gold" [disabled]="busy()" (click)="plans()"><app-icon name="crown" />See plans</button>
        <button class="btn btn-ghost mt-2.5" [disabled]="busy()" (click)="free()">Continue with Free</button>
      </div>
    </div>
  `
})
export class TrialEndedPage {
  protected readonly theme = inject(ThemeService);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly busy = signal(false);
  protected readonly apps = LOCKABLE_APPS.filter(a => !a.free);
  protected readonly keep = [
    { icon: 'target', title: 'Every quest + your own' },
    { icon: 'lock', title: 'TikTok, YouTube & Snapchat locks', apps: true },
    { icon: 'timer', title: 'Minutes unlock' },
    { icon: 'chart', title: 'Slip-ups & heat maps' },
    { icon: 'users', title: 'Community, Friends check & shared milestones' }
  ];

  protected readonly pro = inject(ActivatedRoute).snapshot.data['kind'] === 'PRO';
  protected readonly copy = this.pro
    ? { icon: 'crown', title: 'subscription ended', text: 'Resubscribe to keep everything PRO, or carry on with the free plan.' }
    : { icon: 'hourglass', title: 'trial has ended', text: 'Keep everything you used this week, or carry on with the free plan.' };

  constructor() {
    effect(() => {
      const u = this.session.user();
      if (!(this.pro ? u?.proEndPending : u?.trialEndPending)) untracked(() => void this.router.navigateByUrl('/today', { replaceUrl: true }));
    });
  }

  protected plans(): void {
    void this.router.navigateByUrl('/paywall');
  }

  protected async free(): Promise<void> {
    this.busy.set(true);
    try {
      await this.session.update(this.pro ? { proEndAcknowledged: true } : { trialEndAcknowledged: true });
      await this.router.navigateByUrl('/today', { replaceUrl: true });
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
