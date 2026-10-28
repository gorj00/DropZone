import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { QuestType } from '../../core/api/models';
import { ConfigService, openExternal, playSubscriptionsUrl } from '../../core/config.service';
import { BillingService, PlanId, planLabel, planOf } from '../../core/native/billing';
import { LockService } from '../../core/native/lock';
import { SessionStore } from '../../core/session.store';
import { CatalogStore } from '../../core/stores';
import { ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';
import { trialBillingNote, trialEnd, trialLeft } from '../../core/trial';
import { ApWarning } from '../../ui/ap-warning';
import { AppTile, LOCKABLE_APPS } from '../../ui/app-tile';
import { Badge } from '../../ui/badge';
import { Icon } from '../../ui/icon';

interface Row {
  label: string;
  free: string | null;
  pro: string | null;
  apps?: boolean;
  freeCheck?: boolean;
}

export function mealRow(catalog: QuestType[], path: string): Row {
  const meals = catalog.filter(q => q.path === path && q.multiSlot);
  const free = meals.filter(q => q.free);
  const names = (free.length ? free : meals).map(q => `${q.name.toLowerCase()}s`).join(' & ');
  if (!names) return { label: 'Pick quest days', free: null, pro: null, freeCheck: true };
  return { label: `Pick days, multiple ${names} a day`, free: free.length ? null : 'Days only', pro: null, freeCheck: free.length > 0 };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppTile, Badge, Icon, ApWarning],
  template: `
    <div class="screen pb-[calc(28px+env(safe-area-inset-bottom))]"
      style="background: radial-gradient(circle at 50% 15%, rgba(var(--gold-rgb), .26), transparent 42%), radial-gradient(130% 55% at 50% 0%, var(--bg-top) 0%, transparent 60%), var(--bg)">
      <div class="relative pad pt-3"><button class="circ" (click)="close()" aria-label="Close"><app-icon name="close" /></button></div>
      <div class="relative flex flex-col items-center -mt-4">
        <span class="drop-shadow-[0_0_24px_rgba(var(--gold-rgb),.6)]"><app-badge tone="gold" [size]="64" icon="crown" /></span>
        <div class="h text-[42px] [[data-theme=stealth]_&]:text-[44px] mt-2.5">DropZone <span class="text-gold [text-shadow:0_0_22px_rgba(var(--gold-rgb),.55)]">Pro</span></div>
        <p class="text-[14.5px] text-mute mt-1.5 text-center px-10 leading-snug">Every quest, every lock, plus stats and community.</p>
        @if (trialLeftText(); as t) {
          <span class="chip mt-3 !text-gold" style="border-color: rgba(var(--gold-rgb), .45)"><app-icon name="hourglass" />Trial · {{ t }}</span>
        }
      </div>

      <div class="mx-5 mt-3.5 tcard">
        <div class="strip violet !pr-4"><span>Compare</span><span class="flex"><span class="w-[56px] text-center">Free</span><span class="w-[78px] text-center text-gold">Pro</span></span></div>
        <div class="px-4">
          @for (r of rows(); track r.label; let first = $first) {
            <div class="flex items-center min-h-[36px] py-1.5 gap-2" [class.border-t]="!first" [class.border-line]="!first">
              <span class="flex-1 font-semibold text-[13.5px] leading-tight">{{ r.label }}</span>
              @if (r.apps) {
                <span class="w-[56px] grid place-items-center"><app-tile key="ig" [size]="20" /></span>
                <span class="w-[78px] flex justify-center">
                  @for (a of apps; track a.pkg; let i = $index) { <span [class.-ml-1]="i > 0"><app-tile [key]="a.key" [size]="18" /></span> }
                </span>
              } @else {
                @if (r.freeCheck) {
                  <span class="w-[56px] grid place-items-center text-mute"><app-icon name="check" [size]="17" /></span>
                } @else {
                  <span class="w-[56px] text-center text-[12px] font-semibold leading-tight" [class.text-mute]="r.free" [class.opacity-40]="!r.free">{{ r.free ?? '—' }}</span>
                }
                <span class="w-[78px] grid place-items-center text-center text-[12px] text-gold font-bold leading-tight">
                  @if (r.pro) { {{ r.pro }} } @else { <app-icon name="check" [size]="17" /> }
                </span>
              }
            </div>
          }
        </div>
      </div>
      @if (trialEnds(); as e) {
        <p class="mx-5 mt-2.5 text-center text-[12px] text-mute">Your free trial ends {{ e }}.</p>
      }

      @switch (billing.prices()) {
        @case ('loading') {
          <div class="mx-5 mt-4 grid grid-cols-3 gap-2" aria-label="Loading prices">
            @for (i of [0, 1, 2]; track i) { <div class="skeleton h-[94px] !rounded-[16px]"></div> }
          </div>
        }
        @case ('failed') {
          <div class="mx-5 mt-4 card px-4 py-4 text-center text-[13.5px]">
            <span class="font-bold">Couldn't load prices</span> ·
            <button class="font-bold text-accent" (click)="retry()">Retry</button>
          </div>
        }
        @default {
          <div class="mx-5 mt-4 grid gap-2" [style.grid-template-columns]="'repeat(' + billing.plans().length + ', minmax(0, 1fr))'">
            @for (p of billing.plans(); track p.id) {
              <button class="relative card px-2 py-3 text-center !rounded-[16px] transition-colors" (click)="selected.set(p.id)" [attr.aria-pressed]="selected() === p.id"
                [style.border]="selected() === p.id ? '1.5px solid var(--gold)' : null"
                [style.background]="selected() === p.id ? selectedBg() : null"
                [style.box-shadow]="selected() === p.id ? '0 0 24px -8px rgba(var(--gold-rgb),.6)' : null">
                @if (p.id === current()) {
                  <span class="tag absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap !bg-ok !text-[var(--ok-ink)] !border-0">YOUR PLAN</span>
                } @else if (p.id === 'pro_yearly') {
                  <span class="tag absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap !bg-gold !text-[#2a1a00] !border-0">BEST VALUE</span>
                }
                <div class="lbl">{{ p.label }}</div>
                <div class="num text-[25px] [[data-theme=stealth]_&]:text-[26px] leading-none mt-1.5">{{ p.price }}</div>
                <div class="text-[11.5px] text-mute mt-1">{{ p.sub }}</div>
              </button>
            }
          </div>
        }
      }

      @if (!subscribed()) {
        <div class="pad mt-4"><app-ap-warning [purchase]="true" /></div>
      }

      <div class="mt-auto pad pt-6">
        @if (!buyable()) {
          <button class="btn btn-ghost" (click)="close()"><app-icon name="check" />You're PRO</button>
        } @else {
          @if (trialNote(); as note) {
            <p class="mb-3 text-center text-[12.5px] font-semibold text-gold leading-snug" data-test="trial-billing">{{ note }}</p>
          }
          <button class="btn btn-gold" [disabled]="busy() || !plan()" (click)="buy()">{{ switching() ? 'Switch to ' + plan()!.label : 'Subscribe' }}</button>
          @if (plan(); as p) {
            <div class="mt-3 text-center text-[11.5px] text-mute leading-snug space-y-1" data-test="terms">
              <p><span class="text-ink font-semibold">{{ p.price }} per {{ p.period }}.</span> Renews automatically until you cancel.</p>
              <p>Billed to your Google Play account.</p>
              <p>Cancel anytime in Google Play › Payments &amp; subscriptions; PRO stays until the end of the paid period.</p>
              @if (switching()) { <p>Google Play replaces your {{ currentLabel() }} plan.</p> }
            </div>
          }
        }
        @if (subscribed()) {
          <button class="block mx-auto mt-3 text-[13px] font-bold text-accent" (click)="manage()">Manage in Google Play</button>
        }
        @if (legal()?.termsUrl || legal()?.privacyUrl) {
          <div class="flex justify-center gap-3 mt-3 text-[12px] font-semibold text-mute">
            @if (legal()?.termsUrl; as url) { <button class="underline underline-offset-2" (click)="openLink(url)">Terms of Service</button> }
            @if (legal()?.privacyUrl; as url) { <button class="underline underline-offset-2" (click)="openLink(url)">Privacy Policy</button> }
          </div>
        }
        <button class="block mx-auto mt-2 text-[12.5px] font-semibold text-mute underline underline-offset-2" [disabled]="busy()" (click)="restore()">Restore purchases</button>
      </div>
    </div>
  `
})
export class PaywallPage {
  protected readonly billing = inject(BillingService);
  private readonly lock = inject(LockService);
  private readonly session = inject(SessionStore);
  private readonly catalog = inject(CatalogStore);
  private readonly configs = inject(ConfigService);
  private readonly theme = inject(ThemeService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  protected readonly apps = LOCKABLE_APPS;
  protected readonly legal = this.configs.config;
  protected readonly rows = computed<Row[]>(() => [
    { label: 'Daily quests', free: '3 basic', pro: 'All + custom' },
    mealRow(this.catalog.catalog(), this.session.path()),
    { label: 'App locks', free: null, pro: null, apps: true },
    { label: 'Minutes unlock', free: null, pro: null },
    { label: 'Progress chart & monthly stats', free: null, pro: null },
    { label: 'Slip-ups & heat maps', free: null, pro: null },
    { label: 'Before/after photos', free: 'Private', pro: 'Friends + public' },
    { label: 'Community: friends, feed, comments, likes, hypes', free: null, pro: null },
    { label: 'Leaderboard', free: null, pro: null },
    { label: 'Community verification & Friends check', free: null, pro: null },
    { label: 'Milestone rewards', free: 'Private', pro: 'Friends + public' }
  ]);
  protected readonly subscribed = this.session.subscribed;
  protected readonly current = computed(() => (this.subscribed() ? planOf(this.session.user()?.proProductId) : null));
  protected readonly currentLabel = computed(() => planLabel(this.session.user()?.proProductId) ?? 'current');
  protected readonly trialLeftText = computed(() => trialLeft(this.session.trialEndsAt()));
  protected readonly trialEnds = computed(() => {
    const e = this.session.trialEndsAt();
    return e && trialLeft(e) ? trialEnd(e) : null;
  });
  protected readonly trialNote = computed(() => trialBillingNote(this.session.trialEndsAt()));
  protected readonly selected = linkedSignal<PlanId>(() => {
    const plans = this.billing.plans();
    const want = this.current() ?? 'pro_yearly';
    return plans.some(p => p.id === want) ? want : plans.at(-1)?.id ?? want;
  });
  protected readonly busy = signal(false);
  protected readonly plan = computed(() => this.billing.plans().find(p => p.id === this.selected()) ?? null);
  protected readonly switching = computed(() => !!this.current() && !!this.plan() && this.plan()!.id !== this.current());
  protected readonly buyable = computed(() => !this.subscribed() || this.switching());
  protected readonly selectedBg = computed(() => this.theme.isNeon()
    ? 'linear-gradient(180deg,#2a2240,#1a1440)'
    : 'linear-gradient(#211b0c,#15130c)');

  constructor() {
    void (this.billing.prices() === 'failed' ? this.billing.retry() : this.billing.init().catch(() => undefined));
    void this.catalog.load().catch(() => undefined);
    if (!this.legal()) void this.configs.load();
    if (this.lock.native) void this.lock.refreshStatus().catch(() => undefined);
  }

  protected close(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl('/today');
  }

  protected retry(): void {
    void this.billing.retry();
  }

  protected manage(): void {
    openExternal(playSubscriptionsUrl(this.session.user()?.proProductId));
  }

  protected openLink(url: string): void {
    openExternal(url);
  }

  protected async buy(): Promise<void> {
    if (!this.billing.enabled) {
      this.toast.show(Capacitor.isNativePlatform() ? 'Purchases aren’t set up yet.' : 'Purchases work in the DropZone Android app.');
      return;
    }
    const switching = this.switching();
    this.busy.set(true);
    try {
      const result = await this.billing.purchase(this.selected());
      if (result === 'done') {
        this.toast.show(switching ? 'Plan changed. Google Play has the details.' : 'Welcome to PRO. Every quest is yours.');
        this.close();
      } else if (result === 'pending') {
        this.toast.show('Purchase received. PRO turns on as soon as Google Play confirms it.');
      }
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected async restore(): Promise<void> {
    this.busy.set(true);
    try {
      if (await this.billing.restore()) {
        this.toast.show('PRO restored.');
        this.close();
      } else {
        this.toast.show('No subscription found on this Google Play account.');
      }
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
