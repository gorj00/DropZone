import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { Leaderboard, LeaderboardEntry, Path, Period } from '../../core/api/models';
import { PhotoLinks } from '../../core/photo-links';
import { SessionStore } from '../../core/session.store';
import { SocialActions } from '../../core/social';
import { ThemeService } from '../../core/theme.service';
import { UnitsService } from '../../core/units';
import { Avatar } from '../../ui/bits';
import { Icon } from '../../ui/icon';

interface Page {
  id: Period;
  dot: string;
  strip: string;
}

const PAGES: Page[] = [
  { id: 'WEEK', dot: 'Week', strip: '' },
  { id: 'MONTH', dot: 'Month', strip: 'violet' },
  { id: 'HALF_YEAR', dot: '6 months', strip: 'cyan' }
];

const GAP = 10;
const TOP = 10;

export function formatDelta(delta: number, path: Path, amount: string, unit: string): string {
  const change = path === 'GAIN' ? delta : -delta;
  const sign = change > 0 ? '+' : change < 0 ? '−' : '';
  return `${sign}${amount} ${unit.toUpperCase()}`;
}

export function formatPercent(percent: number): string {
  const sign = percent > 0 ? '+' : percent < 0 ? '−' : '';
  return `${sign}${Math.abs(percent).toFixed(1)}%`;
}

@Component({
  selector: 'app-leaderboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, Icon],
  template: `
    <div #track class="mt-3 flex items-start gap-2.5 overflow-x-auto snap-x snap-mandatory px-5 scroll-px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" (scroll)="onScroll()">
      @for (p of pages; track p.id; let i = $index) {
        <div class="tcard w-[300px] max-w-[calc(100vw-60px)] flex-none snap-start transition-opacity duration-200" [class.opacity-60]="i !== page()">
          <div class="strip {{ p.strip }}"><span>{{ title(p.id) }} · top {{ top }}</span><span>{{ ends(p.id) }}</span></div>
          @if (failed()[p.id]) {
            <div class="h-[186px] px-6 flex flex-col items-center justify-center text-center">
              <span class="text-mute inline-flex"><app-icon name="trophy" [size]="30" /></span>
              <div class="font-bold text-[14.5px] mt-2">Couldn't load the ranking</div>
              <button class="chip on mt-3" (click)="load(p.id)"><app-icon name="refresh" />Retry</button>
            </div>
          } @else if (boards()[p.id]; as b) {
            @if (!alone(b)) {
              <div class="px-3 pt-4 flex items-end justify-center gap-2.5" [style.background]="glow()">
                @for (slot of podium(b); track slot.place) {
                  <div class="flex flex-col items-center" [style.width.px]="slot.place === 1 ? 88 : 80">
                    @if (slot.place === 1) { <span class="text-gold inline-flex drop-shadow-[0_0_8px_rgba(var(--gold-rgb),.8)]"><app-icon name="crown" [size]="22" /></span> }
                    @if (slot.e; as e) {
                      <button class="flex flex-col items-center max-w-full" [class.mt-1]="slot.place === 1" [disabled]="isMe(e)" (click)="openUser(e)" [attr.aria-label]="isMe(e) ? 'You' : e.user.displayName">
                        <app-avatar [url]="e.user.avatarUrl" [name]="e.user.displayName" [size]="slot.size" [ring]="ring(slot.place)" />
                        <div class="font-bold text-[13px] mt-1.5 max-w-full truncate">{{ isMe(e) ? 'You' : first(e.user.displayName) }}</div>
                      </button>
                      <div class="num text-[13px]" [class.text-gold]="slot.place === 1 && e.delta >= 0" [class.text-mute]="slot.place !== 1 && e.delta >= 0" [style.color]="e.delta < 0 ? 'var(--accent-light)' : null">{{ main(e, b) }}</div>
                      @if (secondary(e, b); as s) { <div class="text-[10.5px] text-mute font-semibold leading-tight">{{ s }}</div> }
                    } @else {
                      <span class="av bg-s2 text-mute" [style.width.px]="slot.size" [style.height.px]="slot.size">–</span>
                      <div class="font-bold text-[13px] mt-1.5 text-mute">Open</div>
                      <div class="num text-[13px] text-mute">–</div>
                    }
                    <div class="w-full mt-2 rounded-t-[10px] grid place-items-center h" [style.height.px]="slot.bar" [style.background]="barBg(slot.place)"
                      [style.box-shadow]="slot.place === 1 && theme.isNeon() ? '0 0 22px -4px rgba(var(--accent-rgb),.8)' : null"
                      [style.font-size.px]="slot.place === 1 ? 24 : slot.place === 2 ? 20 : 18">{{ slot.e?.rank ?? slot.place }}</div>
                  </div>
                }
              </div>
              @if (b.entries.length > 3 || b.me) {
                <div class="divide-y divide-line">
                  @for (e of b.entries.slice(3); track e.user.id) {
                    <button class="w-full flex items-center gap-2.5 px-3.5 h-[44px] text-left" [class.text-accent]="isMe(e)" [disabled]="isMe(e)" (click)="openUser(e)">
                      <span class="num text-[14px] w-5 text-mute">{{ e.rank }}</span>
                      <app-avatar [url]="e.user.avatarUrl" [name]="e.user.displayName" [size]="26" />
                      <span class="flex-1 font-semibold text-[13.5px] truncate">{{ isMe(e) ? 'You' : e.user.displayName }}</span>
                      @if (secondary(e, b); as s) { <span class="text-[11.5px] text-mute font-semibold">{{ s }}</span> }
                      <span class="num text-[13.5px]" [style.color]="e.delta < 0 ? 'var(--accent-light)' : null">{{ main(e, b) }}</span>
                    </button>
                  }
                  @if (b.me; as me) {
                    <div class="flex items-center gap-2.5 px-3.5 h-[44px] text-accent border-t border-dashed border-line">
                      <app-avatar [url]="me.user.avatarUrl" [name]="me.user.displayName" [size]="26" />
                      <span class="flex-1 font-semibold text-[13.5px] truncate">You · #{{ me.rank }}{{ hidden() ? ' (hidden from friends)' : '' }}</span>
                      @if (secondary(me, b); as s) { <span class="text-[11.5px] text-mute font-semibold">{{ s }}</span> }
                      <span class="num text-[13.5px]" [style.color]="me.delta < 0 ? 'var(--accent-light)' : null">{{ main(me, b) }}</span>
                    </div>
                  }
                </div>
              }
            } @else {
              <div class="h-[186px] px-6 flex flex-col items-center justify-center text-center">
                <span class="text-mute inline-flex"><app-icon name="trophy" [size]="30" /></span>
                <div class="font-bold text-[14.5px] mt-2">No ranking yet</div>
                <div class="text-[12px] text-mute mt-1">Add friends on the same path to compete.</div>
                <a class="chip on mt-3" routerLink="/squad/friends"><app-icon name="userplus" />Add friends</a>
              </div>
            }
          } @else {
            <div class="h-[186px] p-4"><div class="skeleton h-full"></div></div>
          }
        </div>
      }
    </div>
    <div class="flex justify-center items-center gap-3 mt-2.5 text-[10.5px] font-bold tracking-[.12em] uppercase">
      @for (p of pages; track p.id; let i = $index) {
        <button class="flex items-center gap-1.5" [class.text-accent]="i === page()" [class.text-mute]="i !== page()" (click)="goTo(i)">
          @if (i === page()) {
            <i class="block w-5 h-1.5 rounded-full bg-accent" [style.box-shadow]="theme.isNeon() ? '0 0 8px var(--accent)' : null"></i>
          } @else {
            <i class="block w-1.5 h-1.5 rounded-full bg-white/25"></i>
          }
          {{ p.dot }}
        </button>
      }
    </div>
  `
})
export class LeaderboardSwiper {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly social = inject(SocialActions);
  protected readonly theme = inject(ThemeService);
  private readonly units = inject(UnitsService);
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');

  protected readonly pages = PAGES;
  protected readonly page = signal(0);
  protected readonly top = TOP;
  protected readonly boards = signal<Partial<Record<Period, Leaderboard>>>({});
  protected readonly failed = signal<Partial<Record<Period, boolean>>>({});
  protected readonly glow = computed(() => this.theme.isNeon()
    ? 'radial-gradient(circle at 50% 70%, rgba(139,92,255,.3), transparent 70%)'
    : 'radial-gradient(circle at 50% 85%, rgba(var(--accent-rgb),.18), transparent 70%)');

  constructor() {
    for (const p of PAGES) this.load(p.id);
    inject(PhotoLinks).onStale(() => { for (const p of PAGES) this.load(p.id); });
  }

  protected load(period: Period): void {
    this.failed.update(m => ({ ...m, [period]: false }));
    this.api.leaderboard(period)
      .then(b => this.boards.update(m => ({ ...m, [period]: b })))
      .catch(() => this.failed.update(m => ({ ...m, [period]: true })));
  }

  protected alone(b: Leaderboard): boolean {
    return b.entries.every(e => this.isMe(e));
  }

  protected async openUser(e: LeaderboardEntry): Promise<void> {
    if (this.isMe(e)) return;
    if ((await this.social.userMenu(e.user)) === 'blocked') {
      for (const p of PAGES) if (this.boards()[p.id]) this.load(p.id);
    }
  }

  protected title(p: Period): string {
    const word = this.session.path() === 'GAIN' ? 'gains' : 'drop';
    return `${p === 'WEEK' ? 'Weekly' : p === 'MONTH' ? 'Monthly' : '6-month'} ${word}`;
  }

  protected ends(p: Period): string {
    const b = this.boards()[p];
    if (!b) return '';
    const end = new Date(b.endsAt);
    if (p === 'MONTH') return new Date(end.getTime() - 1).toLocaleString('en-US', { month: 'long' });
    const ms = end.getTime() - Date.now();
    if (ms <= 0) return 'Ended';
    const days = Math.floor(ms / 86400000);
    return days >= 1 ? `Ends in ${days}d` : `Ends in ${Math.max(1, Math.ceil(ms / 3600000))}h`;
  }

  protected podium(b: Leaderboard): { place: number; e: LeaderboardEntry | null; size: number; bar: number }[] {
    const at = (place: number) => b.entries[place - 1] ?? null;
    return [
      { place: 2, e: at(2), size: 48, bar: 46 },
      { place: 1, e: at(1), size: 60, bar: 66 },
      { place: 3, e: at(3), size: 44, bar: 32 }
    ];
  }

  protected ring(place: number): string | null {
    if (place === 1) return 'var(--gold)';
    if (!this.theme.isNeon()) return null;
    return place === 2 ? '#b49cff' : 'var(--accent-2)';
  }

  protected barBg(place: number): string {
    if (place === 1) return 'var(--accent-grad)';
    if (this.theme.isNeon()) return place === 2 ? 'linear-gradient(180deg,#6a3df0,#3a2296)' : 'linear-gradient(180deg,#2c8fc0,#1b5d8a)';
    return place === 2 ? 'var(--s3)' : 'var(--s2)';
  }

  protected readonly hidden = computed(() => !!this.session.user()?.hiddenFromLeaderboards);

  protected main(e: LeaderboardEntry, b: Leaderboard): string {
    return b.path === 'GAIN' && e.percent != null ? formatPercent(e.percent) : this.delta(e, b);
  }

  protected secondary(e: LeaderboardEntry, b: Leaderboard): string | null {
    return b.path === 'GAIN' && e.percent != null ? this.delta(e, b) : null;
  }

  private delta(e: LeaderboardEntry, b: Leaderboard): string {
    return formatDelta(e.delta, b.path, this.units.fmt(Math.abs(e.delta), e.unit || b.unit), this.units.label(e.unit || b.unit));
  }

  protected isMe(e: LeaderboardEntry): boolean {
    return e.user.id === this.session.user()?.id;
  }

  protected first(name: string): string {
    return name.split(/\s+/)[0] || name;
  }

  protected onScroll(): void {
    const el = this.track().nativeElement;
    const card = el.firstElementChild as HTMLElement | null;
    if (!card) return;
    const i = Math.round(el.scrollLeft / (card.offsetWidth + GAP));
    this.page.set(Math.max(0, Math.min(PAGES.length - 1, i)));
  }

  protected goTo(i: number): void {
    const el = this.track().nativeElement;
    const card = el.firstElementChild as HTMLElement | null;
    if (!card) return;
    el.scrollTo({ left: i * (card.offsetWidth + GAP), behavior: 'smooth' });
    this.page.set(i);
  }
}
