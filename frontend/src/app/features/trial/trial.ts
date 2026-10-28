import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionStore } from '../../core/session.store';
import { ThemeService } from '../../core/theme.service';
import { trialEnd, trialLeft } from '../../core/trial';
import { AppTile, LOCKABLE_APPS } from '../../ui/app-tile';
import { Badge } from '../../ui/badge';
import { ProTag } from '../../ui/bits';
import { Icon } from '../../ui/icon';

interface Perk {
  icon: string;
  title: string;
  text: string;
  apps?: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AppTile, Badge, ProTag, Icon],
  template: `
    <div class="screen pb-[calc(24px+env(safe-area-inset-bottom))]"
      style="background: radial-gradient(circle at 50% 14%, rgba(var(--gold-rgb), .24), transparent 40%), radial-gradient(130% 55% at 50% 0%, var(--bg-top) 0%, transparent 60%), var(--bg)">
      <div class="flex flex-col items-center pt-6 pad text-center">
        <span class="drop-shadow-[0_0_26px_rgba(var(--gold-rgb),.6)]"><app-badge tone="gold" [size]="68" icon="crown" [glowing]="true" /></span>
        <div class="mt-3"><app-pro-tag /></div>
        <div class="h text-[38px] [[data-theme=stealth]_&]:text-[40px] mt-3 leading-[.95]">
          Your <span class="text-gold [text-shadow:0_0_22px_rgba(var(--gold-rgb),.55)]">PRO</span> trial is on
        </div>
        @if (ends(); as e) {
          <p class="text-[14px] text-mute mt-2.5">Full access until <span class="text-ink font-semibold">{{ e }}</span>@if (left(); as l) { · {{ l }} }</p>
        }
      </div>

      <div class="mx-5 mt-5 shadow-[0_30px_60px_-20px_rgba(0,0,0,.85)]" [class]="theme.isNeon() ? 'tcard' : 'card-gold'"
        [style.border-color]="theme.isNeon() ? 'rgba(var(--gold-rgb),.45)' : null">
        @if (theme.isNeon()) {
          <div class="strip gold"><span>Unlocked for you</span><span class="flex items-center gap-1"><app-icon name="crown" [size]="13" />PRO</span></div>
        }
        <div class="px-4 py-1.5">
          @for (p of perks; track p.title; let first = $first) {
            <div class="flex items-center gap-3 py-2" [class.border-t]="!first" [class.border-line]="!first">
              <span class="qi !w-[36px] !h-[36px] !rounded-[11px] bg-[rgba(var(--gold-rgb),.12)] text-gold"><app-icon [name]="p.icon" [size]="18" /></span>
              <span class="flex-1 min-w-0">
                <span class="block font-bold text-[14.5px] leading-tight">{{ p.title }}</span>
                <span class="block text-[12px] text-mute mt-0.5">{{ p.text }}</span>
              </span>
              @if (p.apps) {
                <span class="flex">
                  @for (a of apps; track a.pkg; let i = $index) { <span [class.-ml-1.5]="i > 0"><app-tile [key]="a.key" [size]="20" /></span> }
                </span>
              }
            </div>
          }
        </div>
      </div>

      <div class="mx-5 mt-4 card px-4 py-3.5 flex gap-3">
        <span class="text-mute inline-flex mt-0.5"><app-icon name="hourglass" [size]="18" /></span>
        <p class="text-[13px] text-mute leading-snug">
          After {{ endDay() }} you keep the free plan: 3 basic quests and the Instagram lock.
          <span class="text-ink font-semibold">No card needed for the trial. Subscribing starts billing right away and ends the trial.</span>
        </p>
      </div>

      <div class="mt-auto pad pt-5">
        <button class="btn btn-gold" (click)="go()">Let's go</button>
        <a class="block text-center mt-3 text-[13px] font-semibold text-mute underline underline-offset-2" routerLink="/paywall">See plans</a>
      </div>
    </div>
  `
})
export class TrialPage {
  protected readonly theme = inject(ThemeService);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  protected readonly apps = LOCKABLE_APPS.filter(a => !a.free);
  protected readonly perks: Perk[] = [
    { icon: 'target', title: 'Every quest + your own', text: 'The full quest list and custom quests' },
    { icon: 'lock', title: 'Lock more apps', text: 'TikTok, YouTube and Snapchat too', apps: true },
    { icon: 'timer', title: 'Minutes unlock', text: 'Earn screen time per quest' },
    { icon: 'chart', title: 'Slip-ups & heat maps', text: 'See your patterns month by month' },
    { icon: 'users', title: 'Community & verification', text: 'Friends, hypes, leaderboards, shared milestones' }
  ];
  protected readonly ends = computed(() => {
    const e = this.session.trialEndsAt();
    return e ? trialEnd(e) : null;
  });
  protected readonly endDay = computed(() => {
    const e = this.session.trialEndsAt();
    return e ? trialEnd(e, false) : 'your trial';
  });
  protected readonly left = computed(() => trialLeft(this.session.trialEndsAt()));

  constructor() {
    if (!trialLeft(this.session.trialEndsAt())) void this.router.navigateByUrl('/today', { replaceUrl: true });
  }

  protected go(): void {
    void this.router.navigateByUrl('/today', { replaceUrl: true });
  }
}
