import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { SlipUpType, Stats, StatsDay } from '../../core/api/models';
import { SessionStore } from '../../core/session.store';
import { Heatmap, ProTag } from '../../ui/bits';
import { BottomNav } from '../../ui/bottom-nav';
import { Icon } from '../../ui/icon';
import { ProLock } from '../paywall/pro-lock';
import { QuickAdd } from '../../ui/quick-add';
import { ProgressChart } from './progress-chart';

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

function monthLabel(key: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', opts);
}

function placeholderDays(key: string): StatsDay[] {
  const [y, m] = key.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  let s = 29;
  const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  return Array.from({ length: count }, (_, i) => ({
    date: `${key}-${String(i + 1).padStart(2, '0')}`,
    questLevel: Math.min(4, Math.floor(r() * 5)),
    slipUps: r() > 0.7 ? 1 : 0,
    future: i > 24
  }));
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Heatmap, BottomNav, Icon, ProTag, ProLock, QuickAdd, ProgressChart],
  template: `
    <div class="screen with-nav relative">
      @if (pro()) {
        <div class="pad pt-3 flex items-end justify-between">
          <div>
            <div class="flex items-center gap-1.5">
              <button class="text-mute inline-flex p-0.5 -ml-1" (click)="go(-1)" aria-label="Previous month"><app-icon name="back" [size]="14" /></button>
              <span class="lbl">{{ label() }}</span>
              <button class="text-mute inline-flex p-0.5 disabled:opacity-30" (click)="go(1)" [disabled]="isCurrent()" aria-label="Next month"><app-icon name="chev" [size]="14" /></button>
            </div>
            <div class="h text-[38px] [[data-theme=stealth]_&]:text-[42px] mt-1">Stats</div>
          </div>
        </div>

        @if (stats(); as s) {
          <div class="mx-5 mt-3 card p-3.5">
            <div class="flex items-center justify-between">
              <span class="font-bold text-[15px]">Quests cleared</span>
              <div class="legend">Less<i class="bg-s2"></i><i class="bg-[rgba(var(--accent-rgb),.2)]"></i><i class="bg-[rgba(var(--accent-rgb),.42)]"></i><i class="bg-[rgba(var(--accent-rgb),.7)]"></i><i class="bg-accent"></i>More</div>
            </div>
            <div class="flex gap-3 mt-3">
              <div><app-heatmap [days]="s.days" kind="quests" (dayClick)="openDay($event)" /></div>
              <div class="flex-1 flex flex-col justify-between py-4">
                <div><div class="num text-[24px] leading-none text-accent">{{ round(s.clearedPct) }}%</div><div class="text-[11px] text-mute mt-1">cleared</div></div>
                <div><div class="num text-[24px] leading-none">{{ s.bestStreak }}</div><div class="text-[11px] text-mute mt-1">best streak</div></div>
                <div><div class="num text-[24px] leading-none">{{ s.questsDone }}</div><div class="text-[11px] text-mute mt-1">quests</div></div>
              </div>
            </div>
          </div>

          @if (tracking()) {
            <div class="mx-5 mt-2.5 card p-3.5">
              <div class="flex items-center justify-between">
                <span class="font-bold text-[15px]">Slip-ups</span>
                <div class="legend">Less<i class="bg-s2"></i><i class="bg-[rgba(var(--accent-2-rgb),.18)]"></i><i class="bg-[rgba(var(--accent-2-rgb),.38)]"></i><i class="bg-[rgba(var(--accent-2-rgb),.62)]"></i><i class="bg-accent2"></i>More</div>
              </div>
              <div class="flex gap-3 mt-3">
                <div><app-heatmap [days]="s.days" kind="slips" (dayClick)="openDay($event)" /></div>
                <div class="flex-1 flex flex-col justify-between py-4">
                  <div><div class="num text-[24px] leading-none text-accent2">{{ s.slipUpCount }}</div><div class="text-[11px] text-mute mt-1">slip-ups</div></div>
                  <div>
                    <div class="num text-[24px] leading-none" [class.text-ok]="(s.slipUpChangePct ?? 0) <= 0" [class.text-accent]="(s.slipUpChangePct ?? 0) > 0">{{ change() }}</div>
                    <div class="text-[11px] text-mute mt-1">vs {{ prevShort() }}</div>
                  </div>
                  <div><div class="num text-[24px] leading-none">{{ s.cleanDays }}</div><div class="text-[11px] text-mute mt-1">clean days</div></div>
                </div>
              </div>
            </div>
            @if (s.topSlipUps.length) {
              <div class="pad mt-2.5 flex flex-wrap gap-1.5">
                @for (t of s.topSlipUps.slice(0, 3); track t.type) {
                  <span class="chip"><span class="text-accent2 inline-flex"><app-icon [name]="iconFor(t.type)" /></span>{{ t.name }} ×{{ t.count }}</span>
                }
              </div>
            }
          } @else {
            <a class="mx-5 mt-2.5 card px-3.5 h-[56px] flex items-center gap-3" routerLink="/settings">
              <span class="qi !w-[34px] !h-[34px] !rounded-[10px] bg-[rgba(var(--accent-2-rgb),.12)] text-accent2"><app-icon name="eyeoff" [size]="17" /></span>
              <span class="flex-1"><span class="block font-bold text-[14.5px] leading-tight">Slip-up tracking is off</span><span class="block text-[12px] text-mute">Turn it on in Settings</span></span>
              <span class="text-mute inline-flex"><app-icon name="chev" [size]="16" /></span>
            </a>
          }
        } @else if (failed()) {
          <div class="mx-5 mt-3 card p-5 text-center">
            <div class="font-bold">Couldn't load stats</div>
            <p class="text-[13px] text-mute mt-1">Check your connection and try again.</p>
            <button class="btn btn-ghost btn-sm mx-auto mt-3" (click)="refresh()"><app-icon name="refresh" />Retry</button>
          </div>
        } @else {
          <div class="mx-5 mt-3 skeleton h-[250px]"></div>
          <div class="mx-5 mt-2.5 skeleton h-[250px]"></div>
        }

        <app-progress-chart />

        <app-quick-add (logged)="refresh()" />
      } @else {
        <div class="pad pt-3">
          <div class="lbl">{{ label() }}</div>
          <div class="flex items-center gap-2 mt-1"><div class="h text-[38px] [[data-theme=stealth]_&]:text-[42px]">Stats</div><app-pro-tag /></div>
        </div>
        <div class="mx-5 mt-3 card p-3.5 blur-[5px] opacity-55 pointer-events-none" aria-hidden="true">
          <div class="font-bold text-[15px]">Quests cleared</div>
          <div class="flex gap-3 mt-3"><app-heatmap [days]="preview" kind="quests" /><div class="flex-1 space-y-5 py-3"><div class="num text-[24px] text-accent">86%</div><div class="num text-[24px]">12</div></div></div>
        </div>
        <div class="mx-5 mt-2.5 card h-[160px] blur-[5px] opacity-40" aria-hidden="true"></div>
        <div class="absolute left-5 right-5 top-[calc(168px+env(safe-area-inset-top))] z-10">
          <app-pro-lock section="Stats" title="See your patterns" text="Unlock heat maps and slip-up tracking." icon="lock"
            [features]="['Quest heat map by day', 'Slip-up tracking & trends', 'Best streaks & monthly recap']" />
        </div>
      }
      <app-bottom-nav />
    </div>

  `
})
export class StatsPage {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  protected readonly pro = this.session.pro;
  protected readonly round = Math.round;
  protected readonly tracking = computed(() => this.session.user()?.slipUpTracking ?? false);
  protected readonly month = signal(monthKey(new Date()));
  protected readonly stats = signal<Stats | null>(null);
  protected readonly failed = signal(false);
  protected readonly types = signal<SlipUpType[]>([]);
  protected readonly preview = placeholderDays(monthKey(new Date()));

  protected readonly label = computed(() => monthLabel(this.month(), { month: 'long', year: 'numeric' }));
  protected readonly prevShort = computed(() => monthLabel(shiftMonth(this.month(), -1), { month: 'short' }));
  protected readonly isCurrent = computed(() => this.month() === monthKey(new Date()));
  protected readonly change = computed(() => {
    const p = this.stats()?.slipUpChangePct;
    if (p === null || p === undefined) return '–';
    const r = Math.round(p);
    return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)}%`;
  });

  constructor() {
    if (this.pro()) {
      void this.load();
      void this.api.slipUpTypes().then(t => this.types.set(t)).catch(() => undefined);
    }
  }

  protected iconFor(code: string): string {
    return this.types().find(t => t.code === code)?.icon ?? 'minus';
  }

  protected go(delta: number): void {
    if (delta > 0 && this.isCurrent()) return;
    this.month.update(m => shiftMonth(m, delta));
    void this.load();
  }

  protected openDay(date: string): void {
    void this.router.navigateByUrl(`/logs/${date}`);
  }

  protected refresh(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const m = this.month();
    this.stats.set(null);
    this.failed.set(false);
    try {
      const s = await this.api.stats(m);
      if (this.month() === m) this.stats.set(s);
    } catch {
      if (this.month() === m) this.failed.set(true);
    }
  }
}
