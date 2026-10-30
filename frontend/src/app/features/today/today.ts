import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { SlipUp, TodayQuest } from '../../core/api/models';
import { openExternal, playSubscriptionsUrl } from '../../core/config.service';
import { LockService } from '../../core/native/lock';
import { PendingProofs } from '../../core/pending-proof';
import { PromptService } from '../../core/prompt.service';
import { ProofService } from '../../core/proof.service';
import { SessionStore } from '../../core/session.store';
import { NotificationsStore } from '../../core/social';
import { GoalStore, TodayStore, localDate } from '../../core/stores';
import { ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';
import { UnitsService } from '../../core/units';
import { AppTile, LOCKABLE_APPS } from '../../ui/app-tile';
import { Badge } from '../../ui/badge';
import { Avatar } from '../../ui/bits';
import { NotificationBell } from '../../ui/bell';
import { BottomNav } from '../../ui/bottom-nav';
import { Icon } from '../../ui/icon';
import { QuickAdd } from '../../ui/quick-add';
import { DEFAULT_REPS, goalText } from '../../ui/quest-schedule';

const busy = signal<string | null>(null);

function hours(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

const TONES: Record<string, [string, string]> = {
  cyan: ['rgba(var(--accent-2-rgb),.12)', 'var(--accent-2)'],
  accent: ['rgba(var(--accent-rgb),.14)', 'var(--accent-light)'],
  ok: ['rgba(var(--ok-rgb),.1)', 'var(--ok)'],
  gold: ['rgba(var(--gold-rgb),.1)', 'var(--gold)'],
  violet: ['rgba(139,92,255,.16)', '#b49cff'],
  pink: ['rgba(255,111,174,.12)', '#ff6fae']
};

const ICON_TONE: Record<string, string> = {
  scale: 'cyan', reps: 'accent', meal: 'ok', protein: 'ok', steps: 'gold', hike: 'gold', gym: 'violet', trend: 'violet',
  bike: 'ok', ball: 'accent', swim: 'cyan', palette: 'pink', film: 'pink', users: 'pink', drop: 'cyan', moon: 'violet', yoga: 'ok'
};

const RING = 2 * Math.PI * 26;

export function dayLabel(d: Date): string {
  const wd = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d);
  const md = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
  return `${wd} · ${md}`;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, AppTile, Badge, Avatar, BottomNav, NotificationBell, QuickAdd],
  template: `
    <div class="screen with-nav">
      @if (theme.isNeon()) {
        <div class="pad pt-3 flex items-center gap-3">
          <app-avatar [url]="user()?.avatarUrl" [name]="user()?.displayName ?? ''" [size]="44" ring="var(--accent)" />
          <div class="flex-1 min-w-0"><div class="lbl">{{ dateLabel() }}</div><div class="h text-[30px] mt-0.5">Today</div></div>
          @if (showBell()) { <app-bell /> }
          <div class="card h-[36px] px-2.5 flex items-center gap-1.5 rounded-xl">
            <span class="text-accent drop-shadow-[0_0_6px_rgba(var(--accent-rgb),.9)]"><app-icon name="flame" [size]="17" /></span>
            <span class="num text-[18px]">{{ streak() }}</span>
          </div>
          <a routerLink="/journey" aria-label="Journey">
            @if (goals.active(); as cp) { <app-badge tone="violet" [text]="'' + cp.index" [size]="34" /> }
            @else if (goals.goal()) { <app-badge tone="gold" icon="trophy" [size]="34" [glowing]="true" /> }
          </a>
        </div>
      } @else {
        <div class="pad pt-3 flex items-end justify-between">
          <div><div class="lbl">{{ dateLabel() }}</div><div class="h text-[42px] mt-1">Today</div></div>
          <div class="flex gap-2 pb-1 items-center">
            @if (showBell()) { <app-bell /> }
            <div class="card h-[36px] px-2.5 flex items-center gap-1.5 rounded-xl">
              <span class="text-accent"><app-icon name="flame" [size]="17" /></span><span class="num text-[19px]">{{ streak() }}</span>
            </div>
            @if (goals.goal(); as g) {
              <a routerLink="/journey" class="card h-[36px] px-2.5 flex items-center gap-1.5 rounded-xl">
                <span class="text-ok"><app-icon name="chute" [size]="16" /></span>
                <span class="num text-[17px]">GOAL {{ goals.active()?.index ?? g.checkpoints.length }}/{{ g.checkpoints.length }}</span>
              </a>
            }
          </div>
        </div>
      }

      @if (user()?.billingIssue || user()?.billingHold) {
        <button class="mx-5 mt-3 w-[calc(100%-40px)] card-gold p-3.5 flex items-center gap-3 text-left" (click)="fixPayment()">
          <span class="qi bg-[rgba(var(--gold-rgb),.12)] text-gold"><app-icon name="coins" /></span>
          <span class="flex-1 min-w-0 font-bold text-[14px] leading-snug">{{ user()?.billingHold ? 'PRO is on hold — fix your payment in Google Play to get it back' : 'Payment problem — fix it in Google Play to keep PRO' }}</span>
          <span class="qbtn soft">Fix</span>
        </button>
      }

      @if (store.today(); as t) {
        @if (theme.isNeon()) {
          <div class="mx-5 mt-3 tcard">
            <div class="strip">
              <span>Daily raid · {{ t.totalCount ? t.totalCount + (t.totalCount === 1 ? ' quest' : ' quests') : 'no quests today' }}</span>
              <span class="flex items-center gap-1"><app-icon [name]="appsOpen() ? 'check' : 'lock'" [size]="13" />{{ appsOpen() ? 'Unlocked' : 'Unlock reward' }}</span>
            </div>
            <div class="px-4 pt-4 pb-3 bg-[radial-gradient(circle_at_50%_40%,rgba(139,92,255,.28),transparent_70%)]">
              <div class="flex items-center justify-between">
                <div class="flex flex-col items-center gap-1.5 w-[76px]">
                  <app-avatar [url]="user()?.avatarUrl" [name]="user()?.displayName ?? ''" [size]="56" ring="var(--accent-2)" />
                  <span class="h text-[14px]">You</span>
                </div>
                <div class="vs">VS</div>
                <div class="flex flex-col items-center gap-1.5 w-[76px]">
                  <div class="relative" [style.filter]="appsOpen() ? null : 'saturate(.75)'">
                    <app-tile [key]="lockApp().key" [size]="56" />
                    <span class="absolute -right-2 -bottom-2 w-7 h-7 rounded-full grid place-items-center"
                          [style.background]="appsOpen() ? 'var(--ok)' : 'var(--accent)'" [style.color]="appsOpen() ? 'var(--ok-ink)' : '#fff'"
                          [style.box-shadow]="'0 0 0 3px var(--s1), 0 0 14px ' + (appsOpen() ? 'rgba(var(--ok-rgb),.8)' : 'rgba(var(--accent-rgb),.9)')">
                      <app-icon [name]="appsOpen() ? 'check' : 'lock'" [size]="14" />
                    </span>
                  </div>
                  <span class="h text-[14px] whitespace-nowrap">{{ lockApp().name }}{{ extraApps() ? ' +' + extraApps() : '' }}</span>
                </div>
              </div>
              <div class="flex gap-1.5 mt-3.5">
                @for (s of segments(); track $index) { <i class="hs" [class.ok]="s === 'ok'" [class.wait]="s === 'wait'"></i> }
              </div>
              <div class="flex justify-between mt-2 text-[12px] text-mute font-semibold">
                <span>{{ allClear() ? 'All clear' : t.doneCount + ' cleared' + (pending() ? ' · ' + pending() + ' checking' : '') }}</span>
                <span class="flex items-center gap-1"><app-icon [name]="minutesMode() ? 'timer' : 'moon'" [size]="13" />{{ unlockText() }}</span>
              </div>
              @if (minutesNote(); as n) {
                <div class="mt-1.5 text-[12px] font-semibold" [class.text-accent2]="minutesLeft() !== 0" [class.text-accent]="minutesLeft() === 0" data-test="minutes-left">{{ n }}</div>
              }
            </div>
          </div>
        } @else {
          <div class="mx-5 mt-4 card-hi p-4 relative overflow-hidden bg-[radial-gradient(circle_at_100%_0%,rgba(var(--accent-rgb),.22),transparent_55%)]">
            <div class="flex items-center gap-4">
              <div class="relative">
                <app-tile [key]="lockApp().key" [size]="56" />
                <span class="absolute -right-2 -bottom-2 w-7 h-7 rounded-full grid place-items-center"
                      [style.background]="appsOpen() ? 'var(--ok)' : 'var(--accent)'" [style.color]="appsOpen() ? 'var(--ok-ink)' : '#fff'"
                      style="box-shadow:0 0 0 3px var(--s1)">
                  <app-icon [name]="appsOpen() ? 'check' : 'lock'" [size]="14" />
                </span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="lbl">{{ lockApp().name }}{{ extraApps() ? ' +' + extraApps() : '' }}</div>
                <div class="h text-[38px] mt-0.5">{{ appsOpen() ? 'Unlocked' : 'Locked' }}</div>
              </div>
              <svg width="62" height="62" viewBox="0 0 62 62" aria-hidden="true">
                <circle cx="31" cy="31" r="26" fill="none" stroke="var(--s3)" stroke-width="6"/>
                <circle cx="31" cy="31" r="26" fill="none" stroke="var(--ok)" stroke-width="6" stroke-linecap="round" [attr.stroke-dasharray]="ring().done + ' ' + ringC" transform="rotate(-90 31 31)"/>
                <circle cx="31" cy="31" r="26" fill="none" stroke="var(--gold)" stroke-width="6" [attr.stroke-dasharray]="ring().wait + ' ' + ringC" [attr.stroke-dashoffset]="-ring().done" transform="rotate(-90 31 31)" opacity=".85"/>
                @if (allClear()) {
                  <path d="M21 31.5l6.5 6.5 13.5-13.5" fill="none" stroke="var(--ok)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                } @else {
                  <text x="31" y="37" text-anchor="middle" class="num" font-size="18" fill="var(--text)">{{ t.doneCount }}/{{ t.totalCount }}</text>
                }
              </svg>
            </div>
            <div class="flex items-center gap-2 mt-3.5 pt-3 border-t border-line text-[12.5px] text-mute font-medium" data-test="stealth-footer">
              <app-icon [name]="minutesMode() ? 'timer' : 'moon'" [size]="15" />{{ stealthFooter() }}
            </div>
          </div>
        }

        @if (lockOff()) {
          <div class="mx-5 mt-3 card-gold p-3.5 flex items-center gap-3">
            <span class="qi bg-[rgba(var(--gold-rgb),.12)] text-gold"><app-icon name="lock" /></span>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-[14.5px]">App lock is off — turn it on</div>
              <p class="text-[12.5px] text-mute leading-snug mt-0.5">Your apps aren't locked right now. Allow DropZone in Accessibility again.</p>
            </div>
            <button class="qbtn soft" (click)="enableLock()">Enable</button>
          </div>
        }

        @if (pro()) {
          @if (t.friendsCleared && t.friendsCleared.total > 0) {
            <a routerLink="/squad" class="mx-5 mt-3 card px-3.5 h-[54px] flex items-center gap-3">
              <div class="stack">
                @for (a of t.friendsCleared.avatars.slice(0, 4); track $index) { <img class="av w-7 h-7" [src]="a" alt="" (error)="$any($event.target).style.visibility = 'hidden'"> }
              </div>
              <div class="flex-1 text-[13px] leading-tight"><b>{{ t.friendsCleared.count }} of {{ t.friendsCleared.total }} friends</b><div class="text-mute">already cleared today</div></div>
              <span class="text-mute"><app-icon name="chev" [size]="16" /></span>
            </a>
          } @else {
            <a routerLink="/squad/friends" class="mx-5 mt-3 card px-3.5 h-[54px] flex items-center gap-3">
              <span class="qi w-8 h-8 bg-s2 text-accent2"><app-icon name="userplus" [size]="16" /></span>
              <div class="flex-1 text-[13px] leading-tight"><b>Build your community</b><div class="text-mute">Friends keep you honest</div></div>
              <span class="text-mute"><app-icon name="chev" [size]="16" /></span>
            </a>
          }
        } @else {
          <a routerLink="/paywall" class="mx-5 mt-3 card px-3.5 h-[54px] flex items-center gap-3">
            <div class="stack">
              @for (i of [0, 1, 2, 3]; track i) { <span class="av w-7 h-7 bg-s3 text-mute"><app-icon name="user" [size]="13" /></span> }
            </div>
            <div class="flex-1 text-[13px] leading-tight"><b>Community progress</b><div class="text-mute">See who cleared today</div></div>
            <span class="tag tag-pro"><app-icon name="crown" />PRO</span>
            <span class="text-mute"><app-icon name="chev" [size]="16" /></span>
          </a>
        }

        <div class="pad mt-4 mb-2.5 flex items-center justify-between">
          <span class="lbl">Today's quests</span>
          @if (t.totalCount) { <span class="num text-mute text-[14px]">{{ t.doneCount }}/{{ t.totalCount }}</span> }
        </div>
        @if (allClear() && t.totalCount) {
          <div class="mx-5 mb-2.5 card-ok px-3.5 py-3 flex items-center gap-3" data-test="kept-unlock">
            <span class="qok"><app-icon name="check" /></span>
            <p class="flex-1 text-[13px] leading-snug"><b>Today is already cleared.</b> <span class="text-mute">You cleared it while on PRO, so your apps stay open till midnight.</span></p>
          </div>
        }
        <div class="pad space-y-2">
          @for (tq of t.quests; track key(tq)) {
            @let q = tq.quest;
            @let tone = toneOf(q.icon);
            @let working = busy() === key(tq);
            @let queued = proof.isPending(t.date, tq);
            @if (q.proof === 'AUTO' && tq.status !== 'DONE') {
              <button class="q w-full text-left" [disabled]="!!busy()" (click)="prove(tq)">
                <span class="qi" [style.background]="tone[0]" [style.color]="tone[1]"><app-icon [name]="q.icon" /></span>
                <div class="flex-1 min-w-0">
                  <div class="flex justify-between items-baseline"><div class="qt">{{ title(tq) }}</div><span class="num text-[14px] text-ok">{{ working ? '…' : pct(tq) + '%' }}</span></div>
                  <div class="bar ok mt-1.5 h-[6px]"><i [style.width.%]="pct(tq)"></i></div>
                  <div class="qs mt-1" [class.!text-accent]="queued">{{ queued ? "You're offline — tap to retry" : autoText(tq) }}</div>
                </div>
              </button>
            } @else {
              <div class="q cursor-pointer" role="button" tabindex="0"
                   (click)="open(tq)" (keydown.enter)="open(tq)">
                <span class="qi" [style.background]="tone[0]" [style.color]="tone[1]"><app-icon [name]="q.icon" /></span>
                <div class="flex-1 min-w-0">
                  <div class="qt truncate">{{ title(tq) }}</div>
                  <div class="qs truncate" [class.!text-accent]="queued">
                    @if (tq.status === 'PENDING') { <span class="text-gold inline-block align-[-1px]"><app-icon name="crown" [size]="11" /></span> {{ tq.quest.checkAudience === 'EVERYONE' ? 'Community is verifying' : 'Friends are verifying' }} · tap to withdraw }
                    @else if (queued) { You're offline — tap to retry }
                    @else { {{ subtitle(tq) }} }
                  </div>
                </div>
                @switch (tq.status) {
                  @case ('DONE') { <span class="qok"><app-icon name="check" /></span> }
                  @case ('PENDING') { <span class="qwait"><app-icon name="hourglass" />{{ tq.verifiedCount }}/{{ tq.requiredVerifications }}</span> }
                  @default {
                    <button class="qbtn" [disabled]="!!busy()" (click)="$event.stopPropagation(); prove(tq)">
                      @if (working) { … } @else if (queued) { <app-icon name="refresh" />Retry } @else { <app-icon [name]="actionIcon(tq)" />{{ actionLabel(tq) }} }
                    </button>
                  }
                }
              </div>
            }
          } @empty {
            <div class="card p-5 text-center">
              <div class="h text-[22px]">Rest day</div>
              <p class="text-[13px] text-mute mt-1">No quests scheduled today. Your apps are open.</p>
              @if (!user()?.skipRestDays) {
                <p class="text-[12px] text-mute mt-1.5 leading-snug" data-test="rest-streak">A day without quests breaks your streak. Turn on "Skip days with nothing scheduled" in Settings to keep it.</p>
              }
            </div>
          }
        </div>
        @if (slipsVisible() && slips().length) {
          <div class="pad mt-5 flex items-center justify-between">
            <span class="lbl">Slip-ups today</span><span class="num text-mute text-[14px]">{{ slips().length }}</span>
          </div>
          <div class="pad mt-2 space-y-2">
            @for (s of slips(); track s.id) {
              <div class="card px-3.5 h-[56px] flex items-center gap-3">
                <span class="qi !w-[34px] !h-[34px] !rounded-[10px] bg-[rgba(var(--accent-2-rgb),.12)] text-accent2"><app-icon [name]="s.icon" [size]="17" /></span>
                <span class="flex-1 min-w-0"><span class="block font-bold text-[14.5px] leading-tight truncate">{{ s.name }}</span><span class="block text-[12px] text-mute">{{ timeOf(s.occurredAt) }}</span></span>
                <button class="circ !w-[34px] !h-[34px]" [disabled]="removing() === s.id" [attr.aria-label]="'Remove ' + s.name" (click)="removeSlip(s)"><app-icon name="close" [size]="15" /></button>
              </div>
            }
          </div>
        }
        <app-quick-add (logged)="loadSlips()" />
      } @else if (failed()) {
        <div class="mx-5 mt-6 card p-5 text-center">
          <div class="font-bold">Couldn't load today</div>
          <p class="text-[13px] text-mute mt-1">Check your connection and try again.</p>
          <button class="btn btn-ghost btn-sm mx-auto mt-3" (click)="load()"><app-icon name="refresh" />Retry</button>
        </div>
      } @else {
        <div class="mx-5 mt-4 skeleton h-[188px]"></div>
        <div class="mx-5 mt-3 skeleton h-[54px]"></div>
        <div class="pad mt-5 space-y-2">
          @for (i of [0, 1, 2, 3]; track i) { <div class="skeleton h-[62px]"></div> }
        </div>
      }
    </div>
    <app-bottom-nav />
  `
})
export class TodayPage implements OnInit {
  protected readonly theme = inject(ThemeService);
  protected readonly store = inject(TodayStore);
  protected readonly goals = inject(GoalStore);
  private readonly session = inject(SessionStore);
  protected readonly proof = inject(ProofService);
  private readonly lock = inject(LockService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly units = inject(UnitsService);
  private readonly notifications = inject(NotificationsStore);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly prompt = inject(PromptService);
  private readonly pendingProofs = inject(PendingProofs);

  protected readonly busy = busy;
  protected readonly showBell = computed(() => this.session.pro() || this.notifications.unread() > 0);
  protected readonly failed = signal(false);
  protected readonly slipsVisible = computed(() => this.session.pro() && !!this.session.user()?.slipUpTracking);
  protected readonly slips = signal<SlipUp[]>([]);
  protected readonly removing = signal<string | null>(null);
  protected readonly ringC = RING;
  protected readonly user = this.session.user;
  protected readonly pro = this.session.pro;
  protected readonly dateLabel = signal(dayLabel(new Date()));
  protected readonly lockOff = computed(() => {
    const s = this.lock.status();
    return this.lock.native && !!s && !s.serviceEnabled && !s.advancedProtection && (this.user()?.lockedApps.length ?? 0) > 0;
  });

  protected readonly streak = computed(() => this.store.today()?.streak ?? this.user()?.streak ?? 0);
  protected readonly minutesMode = computed(() => this.user()?.unlockMode === 'MINUTES');
  protected readonly pending = computed(() => this.store.today()?.quests.filter(q => q.status === 'PENDING').length ?? 0);
  protected readonly lockApps = computed(() => {
    const pkgs = this.user()?.lockedApps ?? [];
    const apps = LOCKABLE_APPS.filter(a => pkgs.includes(a.pkg));
    return apps.length ? apps : [LOCKABLE_APPS[0]];
  });
  protected readonly lockApp = computed(() => this.lockApps()[0]);
  protected readonly extraApps = computed(() => this.lockApps().length - 1);
  protected readonly openTillMidnight = computed(() => {
    const t = this.store.today();
    return !!t?.unlocked && !!t.unlockedUntil;
  });
  protected readonly allClear = computed(() => {
    const t = this.store.today();
    return this.openTillMidnight() && !!t && (t.totalCount === 0 || (t.doneCount < t.totalCount && t.quests.some(q => q.status === 'TODO')));
  });
  protected readonly minutesLeft = computed(() => {
    const t = this.store.today();
    const left = this.lock.status()?.minutesLeft;
    if (!this.minutesMode() || !t?.unlocked || t.unlockedUntil || !this.lock.native) return null;
    return typeof left === 'number' ? Math.max(0, left) : null;
  });
  protected readonly minutesNote = computed(() => {
    const left = this.minutesLeft();
    return left === null ? null : `${left} min left · clear more quests to earn more`;
  });
  protected readonly appsOpen = computed(() => !!this.store.today()?.unlocked && this.minutesLeft() !== 0);
  protected readonly segments = computed(() => {
    if (this.allClear()) return ['ok'];
    const qs = this.store.today()?.quests ?? [];
    const done = qs.filter(q => q.status === 'DONE').length;
    const wait = qs.filter(q => q.status === 'PENDING').length;
    return qs.map((_, i) => (i < done ? 'ok' : i < done + wait ? 'wait' : ''));
  });
  protected readonly ring = computed(() => {
    const t = this.store.today();
    if (this.allClear()) return { done: RING, wait: 0 };
    if (!t || !t.totalCount) return { done: 0, wait: 0 };
    return { done: (t.doneCount / t.totalCount) * RING, wait: (this.pending() / t.totalCount) * RING };
  });
  protected readonly unlockText = computed(() => {
    const t = this.store.today();
    if (this.openTillMidnight()) return 'open till midnight';
    if (this.minutesMode()) return t?.minutesEarned ? `${t.minutesEarned} min earned` : `+${this.user()?.minutesPerQuest ?? 30} min / quest`;
    return 'till midnight';
  });
  protected readonly stealthFooter = computed(() => {
    const left = this.store.left();
    if (this.openTillMidnight()) return this.pending() && !this.allClear() ? 'Open till midnight · streak counts once verified' : 'All clear · open till midnight';
    const note = this.minutesNote();
    if (note) return note;
    if (this.minutesMode()) return `${this.store.today()?.minutesEarned ?? 0} min earned · +${this.user()?.minutesPerQuest ?? 30} min per quest`;
    return `${left} ${left === 1 ? 'quest' : 'quests'} left · unlocks till midnight`;
  });

  ngOnInit(): void {
    void this.load();
    const onVisible = () => { if (document.visibilityState === 'visible') void this.load(true); };
    document.addEventListener('visibilitychange', onVisible);
    this.destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', onVisible));
  }

  protected async load(silent = false): Promise<void> {
    this.failed.set(false);
    this.dateLabel.set(dayLabel(new Date()));
    if (this.lock.native) void this.lock.refreshStatus().catch(() => undefined);
    const goal = this.goals.goal() ? Promise.resolve() : this.goals.load().then(() => undefined);
    void this.loadSlips();
    try {
      await Promise.all([this.store.load(), goal]);
      await this.proof.syncAuto();
    } catch (e) {
      if (!this.store.today()) this.failed.set(true);
      if (!silent) this.toast.error(e);
    }
  }

  protected async prove(tq: TodayQuest): Promise<void> {
    if (busy()) return;
    busy.set(this.key(tq));
    try {
      await this.proof.complete(tq);
    } finally {
      busy.set(null);
    }
  }

  protected open(tq: TodayQuest): void {
    if (tq.status === 'PENDING' && tq.proofId) void this.pendingProofs.menu(tq.proofId, 'QUEST', tq.completionId ? `/log/${tq.completionId}` : undefined);
    else if (tq.completionId) void this.router.navigateByUrl(`/log/${tq.completionId}`);
    else if (!this.busy()) void this.prove(tq);
  }

  protected async enableLock(): Promise<void> {
    try {
      await this.lock.openSettings();
    } catch (e) {
      this.toast.error(e);
    }
  }

  protected fixPayment(): void {
    openExternal(playSubscriptionsUrl(this.user()?.proProductId));
  }

  protected async loadSlips(): Promise<void> {
    if (!this.slipsVisible()) {
      this.slips.set([]);
      return;
    }
    try {
      this.slips.set(await this.api.slipUps(localDate()));
    } catch { }
  }

  protected async removeSlip(s: SlipUp): Promise<void> {
    const ok = await this.prompt.confirm('Remove this slip-up?', `${s.name} at ${this.timeOf(s.occurredAt)} will be removed from today and your stats.`, 'Remove', 'Cancel');
    if (!ok) return;
    this.removing.set(s.id);
    try {
      await this.api.deleteSlipUp(s.id);
      this.slips.update(list => list.filter(x => x.id !== s.id));
      this.toast.show('Slip-up removed.');
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.removing.set(null);
    }
  }

  protected timeOf(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }


  protected toneOf(icon: string): [string, string] {
    return TONES[ICON_TONE[icon] ?? 'accent'];
  }

  protected key(tq: TodayQuest): string {
    return `${tq.quest.id}:${tq.slot}`;
  }

  protected title(tq: TodayQuest): string {
    const q = tq.quest;
    if (tq.slots > 1) return `${q.name} · Meal ${tq.slot} of ${tq.slots}`;
    if (q.proof === 'REPS') return goalText('REPS', q.target ?? DEFAULT_REPS);
    if (q.proof === 'AUTO' && q.autoSource === 'SLEEP' && q.target) return `Sleep ${hours(q.target)} h`;
    if (q.proof === 'AUTO' && q.autoSource === 'STEPS' && q.target) {
      const steps = `${q.target.toLocaleString('en-US')} steps`;
      return q.code === 'STEPS' ? steps : `${q.name} · ${steps}`;
    }
    return q.name;
  }

  protected subtitle(tq: TodayQuest): string {
    const q = tq.quest;
    if (tq.status === 'DONE') return this.units.withNote(tq.value, tq.summary) ?? 'Cleared';
    if (q.code === 'WEIGH_IN') return 'Scale photo';
    switch (q.proof) {
      case 'REPS': return 'Counted by camera';
      case 'LOG': return 'Log your number';
      case 'CHECKIN': return 'Tap when done';
      case 'NONE': return 'Mark it done';
      default: return 'Photo proof';
    }
  }

  protected actionIcon(tq: TodayQuest): string {
    return tq.quest.proof === 'LOG' ? 'edit' : tq.quest.proof === 'CHECKIN' || tq.quest.proof === 'NONE' ? 'check' : 'camera';
  }

  protected actionLabel(tq: TodayQuest): string {
    return tq.quest.proof === 'LOG' ? 'Log' : tq.quest.proof === 'CHECKIN' || tq.quest.proof === 'NONE' ? 'Done' : 'Prove';
  }

  protected pct(tq: TodayQuest): number {
    const target = tq.target ?? tq.quest.target ?? 0;
    if (!target) return 0;
    return Math.min(100, Math.round(((tq.progress ?? 0) / target) * 100));
  }

  protected autoText(tq: TodayQuest): string {
    if (tq.progress === null) return 'Tap to sync Health Connect';
    if (tq.quest.autoSource === 'SLEEP') return `${Math.floor(tq.progress / 60)} h ${Math.round(tq.progress % 60)} min${tq.target ? ` of ${hours(tq.target)} h` : ''} · Health Connect`;
    return `${tq.progress.toLocaleString('en-US')}${tq.target ? ` / ${tq.target.toLocaleString('en-US')}` : ''} · Health Connect`;
  }
}
