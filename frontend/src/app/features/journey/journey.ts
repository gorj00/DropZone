import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { apiError } from '../../core/api/errors';
import { Checkpoint, Goal, Measurement, PhotoCredit } from '../../core/api/models';
import { PromptService } from '../../core/prompt.service';
import { ProofService } from '../../core/proof.service';
import { SessionStore } from '../../core/session.store';
import { GoalStore, TodayStore } from '../../core/stores';
import { ThemeService } from '../../core/theme.service';
import { UnitsService } from '../../core/units';
import { ToastService } from '../../core/toast.service';
import { Badge, BadgeTone } from '../../ui/badge';
import { Avatar, ProTag } from '../../ui/bits';
import { BottomNav } from '../../ui/bottom-nav';
import { Icon } from '../../ui/icon';
import { UnsplashCredit } from '../../ui/unsplash-credit';
import { GoalReached } from './goal-reached';
import { delta, pad, rewardName, shortDate, toGo } from './journey.util';
import { visibilityIcon, visibilityOf } from './visibility';

interface Pt { x: number; y: number }
interface Seg { a: Pt; c1: Pt; c2: Pt; b: Pt }

interface MapNode {
  cp: Checkpoint;
  final: boolean;
  badge: { left: number; top: number; size: number; tone: BadgeTone; icon: string | null; text: string | null; pulse: boolean; glow: boolean };
  card: { left: number; top: number; width: number };
  title: string;
  reward: string | null;
  value: string;
  note: string | null;
  noteClass: string;
}

interface MapLayout {
  w: number;
  h: number;
  platY: number;
  full: string;
  done: string;
  you: Pt;
  flip: boolean;
  nodes: MapNode[];
  contours: string[];
  ticks: number[];
}

const TOP = 104;
const GAP = 96;
const BEND = 48;

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function split(s: Seg, t: number): Seg {
  const p01 = lerp(s.a, s.c1, t), p12 = lerp(s.c1, s.c2, t), p23 = lerp(s.c2, s.b, t);
  const p012 = lerp(p01, p12, t), p123 = lerp(p12, p23, t);
  return { a: s.a, c1: p01, c2: p012, b: lerp(p012, p123, t) };
}

function r(n: number): number {
  return Math.round(n * 10) / 10;
}

function pathOf(segs: Seg[]): string {
  if (!segs.length) return '';
  return `M${r(segs[0].a.x)} ${r(segs[0].a.y)}` + segs.map(s => ` C${r(s.c1.x)} ${r(s.c1.y)} ${r(s.c2.x)} ${r(s.c2.y)} ${r(s.b.x)} ${r(s.b.y)}`).join('');
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, Badge, Avatar, ProTag, BottomNav, UnsplashCredit, GoalReached],
  host: { class: 'block' },
  styles: `
    .jc { position: absolute; height: 66px; display: flex; align-items: center; gap: 10px; padding: 0 10px 0 8px; z-index: 5; border-radius: 14px; }
    .jt { width: 40px; height: 40px; border-radius: 10px; overflow: hidden; flex: none; display: grid; place-items: center; background: linear-gradient(135deg, rgba(var(--accent-rgb), .35), var(--s3)); color: rgba(255, 255, 255, .75); }
    .jt.big { width: 46px; height: 46px; }
    .you { position: absolute; z-index: 8; display: flex; align-items: center; gap: 6px; }
    .you .tagv { font-family: var(--font-display); font-weight: var(--display-weight); font-style: var(--display-style); font-size: 12.5px; letter-spacing: .06em; text-transform: uppercase; background: var(--accent); color: #fff; border-radius: 6px; padding: 1px 7px; white-space: nowrap; }
    .you .dot { width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 4px rgba(var(--accent-rgb), .55), 0 0 18px var(--accent); flex: none; }
  `,
  template: `
    <div class="screen with-nav">
      <div class="relative z-10 pad pt-3 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="h" [class]="neon() ? 'text-[32px]' : 'text-[36px]'">{{ heading() }}</div>
          @if (friendsLine(); as f) {
            <button class="flex items-center gap-1.5 mt-1 text-[12px] text-mute font-semibold whitespace-nowrap text-left" (click)="f.pro ? null : paywall()">
              <span class="inline-block w-1.5 h-1.5 rounded-full bg-ok"></span>{{ f.text }}<app-pro-tag />
            </button>
          }
        </div>
        @if (goal(); as g) {
          <div class="flex items-center gap-2 flex-none">
            <div class="card px-3 py-2" style="border-radius:14px">
              <div class="num text-[15px] leading-none uppercase"><span class="text-accent">{{ u.fmt(g.progressValue, g.unit) }}</span> / {{ u.fmt(g.totalValue, g.unit) }} {{ u.label(g.unit) }}</div>
              <div class="bar mt-1.5" style="height:5px;width:104px"><i [style.width.%]="pct()"></i></div>
            </div>
            <a class="circ" routerLink="/goal/edit" aria-label="Edit goal"><app-icon name="edit" [size]="17" /></a>
          </div>
        }
      </div>
      @if (logLabel(); as label) {
        <div class="relative z-10 pad mt-3">
          <button class="btn btn-ghost btn-sm" [disabled]="logging()" (click)="logProgress()"><app-icon name="plus" [size]="16" />{{ logging() ? 'Saving…' : label }}</button>
        </div>
      }
      @if (goal()?.reached) { <app-goal-reached [goal]="goal()!" /> }

      @if (layout(); as m) {
        <div class="relative mx-auto mt-4" [style.width.px]="m.w" [style.height.px]="m.h">
          <svg class="absolute inset-0 overflow-hidden" [attr.width]="m.w" [attr.height]="m.h" [attr.viewBox]="'0 0 ' + m.w + ' ' + m.h">
            <defs>
              <radialGradient id="jmGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0" [attr.stop-color]="neon() ? '#ff2e7e' : '#ffc53d'" [attr.stop-opacity]="neon() ? .4 : .35" />
                <stop offset="1" [attr.stop-color]="neon() ? '#ff2e7e' : '#ffc53d'" stop-opacity="0" />
              </radialGradient>
              <linearGradient id="jmTop" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" [attr.stop-color]="neon() ? '#3a2c9e' : '#2a2e3a'" />
                <stop offset="1" [attr.stop-color]="neon() ? '#1c1556' : '#14161d'" />
              </linearGradient>
            </defs>
            @if (neon()) {
              <g fill="#fff">
                @for (s of stars; track $index) { <circle [attr.cx]="s[0] * m.w" [attr.cy]="s[1] * m.platY" [attr.r]="s[2]" [attr.opacity]="s[3]" /> }
              </g>
              <g fill="none" stroke="#8b5cff" stroke-opacity=".08">
                @for (rad of [120, 190, 260, 330, 400]; track rad) { <circle [attr.cx]="m.w / 2" [attr.cy]="m.platY" [attr.r]="rad" /> }
              </g>
            } @else {
              <g fill="none" stroke="#fff" stroke-opacity=".045">
                @for (c of m.contours; track $index) { <path [attr.d]="c" /> }
              </g>
              <g stroke="#fff" stroke-opacity=".14">
                @for (y of m.ticks; track y) { <path [attr.d]="'M' + (m.w - 14) + ' ' + y + 'h6'" /> }
              </g>
            }
            <ellipse [attr.cx]="m.w / 2" [attr.cy]="m.platY + 6" rx="170" [attr.ry]="neon() ? 70 : 80" fill="url(#jmGlow)" />
            <path [attr.d]="side(m, -1)" [attr.fill]="neon() ? '#160f4a' : '#101218'" />
            <path [attr.d]="side(m, 1)" [attr.fill]="neon() ? '#100b3a' : '#0b0c11'" />
            <path [attr.d]="top(m)" fill="url(#jmTop)" [attr.stroke]="neon() ? '#a48cff' : '#ffffff'" [attr.stroke-opacity]="neon() ? .3 : .1" />
            <ellipse [attr.cx]="m.w / 2" [attr.cy]="m.platY" rx="66" ry="24.4" fill="none" [style.stroke]="ring()" stroke-opacity=".5" stroke-width="1.5" />
            <ellipse [attr.cx]="m.w / 2" [attr.cy]="m.platY" rx="42" ry="15.5" [style.fill]="ring()" fill-opacity=".14" [style.stroke]="ring()" stroke-opacity=".8" stroke-width="1.5" />
            <path [attr.d]="m.full" fill="none" stroke="#8e8c99" stroke-opacity=".45" stroke-width="2.5" stroke-dasharray="2 9" stroke-linecap="round" />
            <path [attr.d]="m.done" fill="none" style="stroke: var(--accent); filter: drop-shadow(0 0 6px rgba(var(--accent-rgb), .95))" stroke-width="4" stroke-linecap="round" />
          </svg>

          <div class="absolute z-10 chip -translate-x-1/2" [style.left.px]="m.w / 2" style="top:0">
            <app-icon name="flag" class="text-mute" /><span class="num text-[13px]">START · {{ u.fmt(goal()!.startValue, goal()!.unit) }}</span>
          </div>

          @for (n of m.nodes; track n.cp.id) {
            <a class="absolute z-[6]" [routerLink]="['/journey', n.cp.id]" [style.left.px]="n.badge.left" [style.top.px]="n.badge.top" [attr.aria-label]="n.title">
              <app-badge [class.pulse]="n.badge.pulse" [tone]="n.badge.tone" [size]="n.badge.size" [icon]="n.badge.icon" [text]="n.badge.text" [glowing]="n.badge.glow" />
            </a>
            <a class="jc" [class]="cardClass(n)" [routerLink]="['/journey', n.cp.id]" [style.left.px]="n.card.left" [style.top.px]="n.card.top" [style.width.px]="n.card.width" [style.height.px]="n.final ? 72 : 66">
              <div class="jt" [class.big]="n.final">
                @if (n.cp.rewardImageUrl) {
                  <img class="ph" [src]="n.cp.rewardImageUrl" alt="" loading="lazy" [style.filter]="n.cp.status === 'LOCKED' && !n.final ? 'grayscale(1) brightness(.5)' : null">
                } @else {
                  <app-icon name="gift" [size]="18" />
                }
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold leading-tight truncate" [class]="n.final ? 'text-[15px]' : 'text-[14.5px]'" [class.text-mute]="n.cp.status === 'LOCKED' && !n.final">{{ n.title }}</div>
                <div class="text-[12px] leading-tight truncate mt-0.5" [style.color]="n.reward ? 'var(--gold)' : 'var(--accent-light)'">{{ n.reward ? 'Reward: ' + n.reward : 'Add a reward' }}</div>
                <div class="text-[12px] text-mute truncate">{{ n.value }}@if (n.note) { · <span [class]="n.noteClass">{{ n.note }}</span> }</div>
              </div>
              @if (n.cp.overdue) { <span class="tag tag-accent" data-test="overdue">Overdue</span> }
              @if (n.final) {
                <span class="tag tag-pro">Final</span>
              } @else {
                <app-icon [name]="visIcon(n.cp)" [size]="15" class="text-mute" />
              }
            </a>
          }

          <div class="you" [style.left.px]="m.you.x" [style.top.px]="m.you.y" [class.flex-row-reverse]="m.flip" [style.transform]="youShift(m)">
            @if (neon()) {
              <app-avatar [url]="user()?.avatarUrl" [name]="user()?.displayName ?? ''" [size]="38" ring="var(--accent)" />
            } @else {
              <i class="dot"></i>
            }
            <span class="tagv">You · {{ u.fmt(goal()!.currentValue, goal()!.unit) }}</span>
          </div>
        </div>
        @if (credits().length) {
          <p class="pad mt-2 text-[10.5px] text-mute text-center">
            @for (cr of credits(); track cr.link; let last = $last) { <app-unsplash-credit [credit]="cr" />@if (!last) { · } }
          </p>
        }
        @if (entries(); as list) {
          <div class="pad mt-5">
            <div class="flex items-center justify-between mb-2">
              <span class="lbl">Recent entries</span>
              @if (list.length > shownCount) {
                <button class="text-[12.5px] font-bold text-mute" (click)="allEntries.set(!allEntries())">{{ allEntries() ? 'Show less' : 'Show all ' + list.length }}</button>
              }
            </div>
            <div class="card divide-y divide-line">
              @for (m of shownEntries(); track m.id) {
                <div class="flex items-center gap-3 px-3.5 h-[48px]">
                  <span class="flex-1 text-[13.5px] text-mute">{{ short(m.day) }}</span>
                  <span class="num text-[16px]">{{ u.amount(m.value, goal()!.unit) }}</span>
                  <button class="circ !w-8 !h-8 text-mute" [disabled]="removing() === m.id" [attr.aria-label]="'Delete entry from ' + short(m.day)" (click)="removeEntry(m)"><app-icon name="trash" [size]="15" /></button>
                </div>
              } @empty {
                <p class="px-3.5 py-3 text-[13px] text-mute">No entries yet.</p>
              }
            </div>
          </div>
        } @else if (entriesFailed()) {
          <div class="mx-5 mt-5 card px-3.5 h-[46px] flex items-center gap-3">
            <span class="flex-1 text-[13px] text-mute">Couldn't load your entries.</span>
            <button class="qbtn" (click)="loadEntries()">Retry</button>
          </div>
        }
      } @else if (goals.loading() || !loaded()) {
        <div class="pad mt-6 space-y-3">
          <div class="skeleton h-[30px] w-[120px] mx-auto"></div>
          @for (i of [1, 2, 3, 4]; track i) { <div class="skeleton h-[56px]" [style.margin-left.px]="i % 2 ? 90 : 0" [style.margin-right.px]="i % 2 ? 0 : 90"></div> }
          <div class="skeleton h-[120px] mt-6"></div>
        </div>
      } @else {
        <div class="pad mt-10">
          <div class="card p-5 text-center">
            <div class="mx-auto w-12 h-12 rounded-full grid place-items-center bg-s2 text-mute"><app-icon name="route" /></div>
            <div class="h text-[22px] mt-3">No route yet</div>
            <p class="text-[13.5px] text-mute mt-1">We couldn't load your milestone rewards.</p>
            <button class="btn btn-ghost btn-sm mx-auto mt-4" (click)="load()"><app-icon name="refresh" />Retry</button>
          </div>
        </div>
      }
    </div>
    <app-bottom-nav />
  `
})
export class JourneyPage {
  protected readonly goals = inject(GoalStore);
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly theme = inject(ThemeService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly proofs = inject(ProofService);
  private readonly prompt = inject(PromptService);
  private readonly today = inject(TodayStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly u = inject(UnitsService);
  protected readonly goal = this.goals.goal;
  protected readonly user = this.session.user;
  protected readonly neon = computed(() => this.theme.theme() === 'NEON');
  protected readonly ring = computed(() => (this.neon() ? 'var(--accent)' : 'var(--gold)'));
  protected readonly pct = this.goals.progressPct;
  protected readonly loaded = signal(false);
  private readonly width = signal(360);
  private readonly friendsOnRoute = signal<number | null>(null);
  protected readonly short = shortDate;
  protected readonly shownCount = 5;
  protected readonly logging = signal(false);
  protected readonly entries = signal<Measurement[] | null>(null);
  protected readonly entriesFailed = signal(false);
  protected readonly allEntries = signal(false);
  protected readonly removing = signal<string | null>(null);
  protected readonly shownEntries = computed(() => {
    const list = this.entries() ?? [];
    return this.allEntries() ? list : list.slice(0, this.shownCount);
  });
  protected readonly logLabel = computed(() => {
    const m = this.goal()?.metric;
    return m === 'SIZE' ? 'Log measurement' : m === 'STRENGTH' ? 'Log lift' : null;
  });
  protected readonly credits = computed(() => {
    const seen = new Map<string, PhotoCredit>();
    for (const c of this.goal()?.checkpoints ?? []) {
      if (c.rewardImageUrl && c.rewardImageCredit) seen.set(c.rewardImageCredit.link, c.rewardImageCredit);
    }
    return [...seen.values()];
  });

  protected readonly stars: [number, number, number, number][] = [
    [0.08, 0.12, 1.2, 0.5], [0.89, 0.2, 1.4, 0.4], [0.69, 0.04, 1, 0.6], [0.11, 0.45, 1, 0.5],
    [0.92, 0.62, 1.3, 0.4], [0.06, 0.78, 1.2, 0.5], [0.5, 0.3, 0.9, 0.35], [0.8, 0.9, 1, 0.4]
  ];

  protected readonly heading = computed(() => (this.goal()?.path ?? this.session.path()) === 'GAIN' ? 'Your build' : 'Your drop');

  protected readonly friendsLine = computed(() => {
    if (!this.goal()) return null;
    if (!this.session.pro()) return { pro: false, text: 'Friends on this route' };
    const n = this.friendsOnRoute();
    return n ? { pro: true, text: `${n} friend${n === 1 ? '' : 's'} on this route` } : null;
  });

  protected readonly layout = computed<MapLayout | null>(() => {
    const g = this.goal();
    if (!g || !g.checkpoints.length) return null;
    return this.build(g, Math.min(460, Math.max(300, this.width())));
  });

  constructor() {
    void this.load();
    afterNextRender(() => {
      const el = this.host.nativeElement;
      this.width.set(el.clientWidth || 360);
      const ro = new ResizeObserver(() => this.width.set(el.clientWidth || 360));
      ro.observe(el);
      this.destroyRef.onDestroy(() => ro.disconnect());
    });
  }

  async load(): Promise<void> {
    const g = await this.goals.load();
    this.loaded.set(true);
    if (!g && !this.goal()) this.toast.show('Could not load your journey.', true);
    if (g || this.goal()) void this.loadEntries();
    if (g && this.session.pro()) {
      try {
        const friends = await this.api.friends();
        this.friendsOnRoute.set(friends.filter(f => f.path === g.path).length);
      } catch {
        this.friendsOnRoute.set(null);
      }
    }
  }

  protected paywall(): void {
    void this.router.navigateByUrl('/paywall');
  }

  protected async loadEntries(): Promise<void> {
    this.entriesFailed.set(false);
    try {
      this.entries.set(await this.api.measurements());
    } catch (e) {
      if (apiError(e).status !== 404) this.entriesFailed.set(true);
    }
  }

  protected async logProgress(): Promise<void> {
    const g = this.goal();
    if (!g || this.logging()) return;
    this.logging.set(true);
    try {
      if (await this.proofs.logMeasurement(g)) void this.loadEntries();
    } finally {
      this.logging.set(false);
    }
  }

  protected async removeEntry(m: Measurement): Promise<void> {
    const g = this.goal();
    if (!g) return;
    const ok = await this.prompt.confirm('Delete this entry?', `${this.u.amount(m.value, g.unit)} from ${shortDate(m.day)} is removed and your progress is recalculated.`, 'Delete', 'Cancel');
    if (!ok) return;
    this.removing.set(m.id);
    try {
      await this.api.deleteMeasurement(m.id);
      this.entries.update(list => (list ?? []).filter(x => x.id !== m.id));
      await this.goals.load();
      void this.today.load().catch(() => undefined);
      this.toast.show('Entry deleted.');
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.removing.set(null);
    }
  }

  protected visIcon(cp: Checkpoint): string {
    return visibilityIcon(visibilityOf(cp));
  }

  protected cardClass(n: MapNode): string {
    if (n.final) return 'jc card-gold';
    if (n.cp.status === 'ACTIVE') return 'jc card-hi';
    if (n.cp.status === 'PENDING_VERIFICATION') return 'jc card-gold';
    return 'jc card';
  }

  protected youShift(m: MapLayout): string {
    const half = this.neon() ? 19 : 7;
    return m.flip ? `translate(calc(-100% + ${half}px), -50%)` : `translate(-${half}px, -50%)`;
  }

  protected top(m: MapLayout): string {
    const cx = m.w / 2, y = m.platY;
    return `M${cx} ${y - 34} L${cx + 92} ${y} L${cx} ${y + 34} L${cx - 92} ${y}Z`;
  }

  protected side(m: MapLayout, dir: -1 | 1): string {
    const cx = m.w / 2, y = m.platY, x = cx + dir * 92;
    return `M${x} ${y} L${cx} ${y + 34} L${cx} ${y + 48} L${x} ${y + 14}Z`;
  }

  private build(g: Goal, w: number): MapLayout {
    const cps = [...g.checkpoints].sort((a, b) => a.index - b.index);
    const n = cps.length;
    const start: Pt = { x: w / 2, y: 14 };
    const pts: Pt[] = cps.slice(0, -1).map((_, i) => ({ x: i % 2 === 0 ? w * 0.25 : w * 0.75, y: TOP + i * GAP }));
    const platY = (pts.length ? pts[pts.length - 1].y : start.y) + 120;
    pts.push({ x: w / 2, y: platY - 12 });
    const all = [start, ...pts];
    const segs: Seg[] = pts.map((b, i) => {
      const a = all[i];
      return { a, c1: { x: a.x, y: a.y + BEND }, c2: { x: b.x, y: b.y - BEND }, b };
    });

    const deltas = [0, ...cps.map(c => c.deltaToEarn)];
    const open = cps.findIndex(c => c.status !== 'CLEARED');
    let k = open === -1 ? n - 1 : open;
    let t = 1;
    if (open !== -1) {
      t = (g.progressValue - deltas[k]) / Math.max(1e-9, deltas[k + 1] - deltas[k]);
      t = Math.min(0.75, Math.max(0.3, t));
    }
    const part = split(segs[k], t);
    const done = pathOf([...segs.slice(0, k), part]);
    const you = part.b;

    const side = Math.round(w * 0.083);
    const nodes: MapNode[] = cps.map((cp, i) => {
      const final = i === n - 1;
      const p = pts[i];
      const size = final ? 52 : 48;
      let card: MapNode['card'];
      if (final) card = { left: side, top: platY + 64, width: w - side * 2 };
      else if (i % 2 === 0) card = { left: p.x + 38, top: p.y - 35, width: w - 20 - (p.x + 38) };
      else card = { left: side, top: p.y - 35, width: p.x - 34 - side };
      return { cp, final, badge: { left: p.x - size / 2, top: p.y - size * 0.56, size, ...this.badgeOf(cp, final) }, card, title: `Milestone ${pad(cp.index)}`, reward: rewardName(cp), value: delta(g, cp.deltaToEarn, this.u.units()), ...this.noteOf(g, cp) };
    });

    const contours: string[] = [];
    const ticks: number[] = [];
    if (!this.neon()) {
      for (let y = 40; y < platY - 40; y += 100) contours.push(`M-20 ${y} Q${w * 0.25} ${y - 40} ${w / 2} ${y + 10} T${w + 20} ${y - 10}`);
      for (let y = 0; y < platY - 30; y += 20) ticks.push(y);
    }

    return { w, h: platY + 64 + 72 + 24, platY, full: pathOf(segs), done, you, flip: you.x > w * 0.6, nodes, contours, ticks };
  }

  private badgeOf(cp: Checkpoint, final: boolean): Pick<MapNode['badge'], 'tone' | 'icon' | 'text' | 'pulse' | 'glow'> {
    if (final) return { tone: 'gold', icon: cp.status === 'CLEARED' ? 'trophy' : 'flag', text: null, pulse: cp.status === 'ACTIVE', glow: true };
    switch (cp.status) {
      case 'CLEARED': return { tone: 'gold', icon: 'check', text: null, pulse: false, glow: true };
      case 'ACTIVE': return { tone: 'accent', icon: null, text: String(cp.index), pulse: true, glow: true };
      case 'PENDING_VERIFICATION': return { tone: 'accent', icon: 'hourglass', text: null, pulse: false, glow: true };
      default: return { tone: 'off', icon: 'lock', text: null, pulse: false, glow: false };
    }
  }

  private noteOf(g: Goal, cp: Checkpoint): Pick<MapNode, 'note' | 'noteClass'> {
    switch (cp.status) {
      case 'CLEARED': return { note: 'Unlocked', noteClass: 'text-ok' };
      case 'PENDING_VERIFICATION': return { note: `Verifying ${cp.verifiedCount}/${cp.requiredVerifications || 3}`, noteClass: 'text-gold' };
      case 'ACTIVE': {
        const left = toGo(g, cp);
        return left > 0 ? { note: `${this.u.fmt(left, g.unit)} to go`, noteClass: 'text-accent' } : { note: 'Upload proof', noteClass: 'text-ok' };
      }
      default: return { note: null, noteClass: '' };
    }
  }
}
