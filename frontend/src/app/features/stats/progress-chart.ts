import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { isProRequired } from '../../core/api/errors';
import { GoalHistory, Metric } from '../../core/api/models';
import { ProofService } from '../../core/proof.service';
import { GoalStore, localDate } from '../../core/stores';
import { UnitsService } from '../../core/units';
import { Icon } from '../../ui/icon';
import { shortDate } from '../journey/journey.util';

const W = 320;
const H = 172;
const TOP = 12;
const BOTTOM = 150;
const X0 = 6;
const X1 = W - 6;
const DAY = 86_400_000;

const NOUNS: Record<Metric, [string, string]> = {
  WEIGHT: ['weigh-in', 'weigh-ins'],
  STRENGTH: ['lift', 'lifts'],
  SIZE: ['measurement', 'measurements']
};

interface Pt { x: number; y: number; value: number; day: string; start: boolean }
interface Line { y: number; label: string; labelY: number; tone: 'goal' | 'done' | 'open'; showLabel: boolean }

function dayMs(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

@Component({
  selector: 'app-progress-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, RouterLink],
  styles: `
    .pc-label { font-size: 9.5px; font-weight: 700; paint-order: stroke; stroke: var(--s1); stroke-width: 3px; stroke-linejoin: round; }
    .pc-axis { font-size: 10px; fill: var(--mute); }
  `,
  template: `
    @if (loading()) {
      <div class="mx-5 mt-2.5 skeleton h-[250px]"></div>
    } @else if (failure() === 'pro') {
      <a class="mx-5 mt-2.5 card px-3.5 h-[56px] flex items-center gap-3" routerLink="/paywall">
        <span class="qi !w-[34px] !h-[34px] !rounded-[10px] bg-[rgba(var(--gold-rgb),.12)] text-gold"><app-icon name="chart" [size]="17" /></span>
        <span class="flex-1"><span class="block font-bold text-[14.5px] leading-tight">Progress chart</span><span class="block text-[12px] text-mute">See every weigh-in and measurement on a chart</span></span>
        <span class="tag tag-pro"><app-icon name="crown" />PRO</span>
      </a>
    } @else if (failure() === 'error') {
      <div class="mx-5 mt-2.5 card p-5 text-center">
        <div class="font-bold">Couldn't load your progress</div>
        <p class="text-[13px] text-mute mt-1">Check your connection and try again.</p>
        <button class="btn btn-ghost btn-sm mx-auto mt-3" (click)="load()"><app-icon name="refresh" />Retry</button>
      </div>
    } @else if (view(); as c) {
      <div class="mx-5 mt-2.5 card p-3.5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-bold text-[15px] truncate">{{ c.title }}</div>
            <div class="text-[11px] text-mute mt-0.5">Since {{ c.since }}</div>
          </div>
          <div class="flex gap-4 text-right shrink-0">
            <div>
              <div class="num text-[20px] leading-none" [class.text-ok]="c.tone === 'ok'" [class.text-accent]="c.tone === 'bad'">{{ c.change }}</div>
              <div class="text-[11px] text-mute mt-1">change</div>
            </div>
            <div><div class="num text-[20px] leading-none">{{ c.toGo }}</div><div class="text-[11px] text-mute mt-1">to go</div></div>
          </div>
        </div>

        @if (c.need > 0) {
          <div class="mt-3 h-[150px] rounded-[12px] bg-s2 flex flex-col items-center justify-center gap-2 text-mute">
            <app-icon name="chart" [size]="22" />
            <span class="text-[13px]">{{ c.needText }}</span>
            @if (c.logLabel; as label) {
              <button class="qbtn mt-1" [disabled]="logging()" (click)="logProgress()"><app-icon name="plus" />{{ logging() ? 'Saving…' : label }}</button>
            }
          </div>
        } @else {
          <div class="relative mt-3">
            <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" class="w-full h-auto block touch-pan-y select-none" role="img" [attr.aria-label]="c.title + ' chart'"
              (pointerdown)="pick($event)">
              <defs>
                <linearGradient id="pc-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" style="stop-color: var(--accent); stop-opacity: .3" />
                  <stop offset="1" style="stop-color: var(--accent); stop-opacity: 0" />
                </linearGradient>
              </defs>
              @for (l of c.lines; track $index) {
                <line [attr.x1]="0" [attr.x2]="w" [attr.y1]="l.y" [attr.y2]="l.y" stroke-width="1.2"
                  [attr.stroke]="color(l.tone)" [attr.stroke-opacity]="l.tone === 'goal' ? .85 : .45" [attr.stroke-dasharray]="l.tone === 'goal' ? '5 4' : '2 4'" />
                @if (l.showLabel) {
                  <text class="pc-label" [attr.x]="w - 2" [attr.y]="l.labelY" text-anchor="end" [attr.fill]="color(l.tone)">{{ l.label }}</text>
                }
              }
              <path [attr.d]="c.area" fill="url(#pc-fill)" />
              <path [attr.d]="c.line" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />
              @if (tip(); as t) {
                <line [attr.x1]="t.x" [attr.x2]="t.x" [attr.y1]="top" [attr.y2]="bottom" stroke="var(--mute)" stroke-opacity=".5" stroke-width="1" />
              }
              @for (p of c.dots; track $index) {
                @if (p.start) {
                  <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3" fill="var(--s1)" stroke="var(--mute)" stroke-width="1.5" />
                } @else {
                  <circle [attr.cx]="p.x" [attr.cy]="p.y" r="2.6" fill="var(--accent)" />
                }
              }
              <circle [attr.cx]="c.last.x" [attr.cy]="c.last.y" r="7" fill="var(--accent)" fill-opacity=".22" />
              <circle [attr.cx]="c.last.x" [attr.cy]="c.last.y" r="3.8" fill="var(--accent)" stroke="var(--s1)" stroke-width="1.5" />
              @if (tip(); as t) {
                <circle [attr.cx]="t.x" [attr.cy]="t.y" r="4.5" fill="var(--text)" stroke="var(--accent)" stroke-width="2" />
              }
              <text class="pc-axis" [attr.x]="x0" [attr.y]="h - 3">{{ c.since }}</text>
              <text class="pc-axis" [attr.x]="x1" [attr.y]="h - 3" text-anchor="end">Today</text>
            </svg>
            @if (tip(); as t) {
              <div class="absolute pointer-events-none px-2 py-1 rounded-[8px] bg-s2 border border-line text-[11.5px] font-bold whitespace-nowrap"
                [style.left.%]="t.left" [style.top.%]="t.top" style="transform: translate(-50%, calc(-100% - 10px))">{{ t.text }}</div>
            }
          </div>
        }
      </div>
    }
  `
})
export class ProgressChart {
  private readonly api = inject(ApiService);
  private readonly goals = inject(GoalStore);
  private readonly units = inject(UnitsService);
  private readonly proofs = inject(ProofService);

  protected readonly w = W;
  protected readonly h = H;
  protected readonly top = TOP;
  protected readonly bottom = BOTTOM;
  protected readonly x0 = X0;
  protected readonly x1 = X1;

  protected readonly loading = signal(true);
  protected readonly failure = signal<'pro' | 'error' | null>(null);
  protected readonly logging = signal(false);
  private readonly goal = this.goals.goal;
  private readonly history = signal<GoalHistory | null>(null);
  private readonly selected = signal<number | null>(null);

  protected readonly view = computed(() => {
    const g = this.goal();
    const hist = this.history();
    if (!g || !hist) return null;
    const show = (n: number) => this.units.value(n, g.unit);
    const entries = hist.points.filter(p => p.day >= hist.start);
    const raw = [{ day: hist.start, value: g.startValue, start: true }, ...entries.map(p => ({ ...p, start: false }))];

    const t0 = dayMs(hist.start);
    const span = Math.max(DAY, Math.max(dayMs(localDate()), ...raw.map(p => dayMs(p.day))) - t0);
    const values = [...raw.map(p => p.value), ...g.checkpoints.map(c => c.targetValue)].map(show);
    const pad = Math.max((Math.max(...values) - Math.min(...values)) * 0.08, 0.5);
    const lo = Math.min(...values) - pad;
    const hi = Math.max(...values) + pad;
    const x = (day: string) => X0 + ((dayMs(day) - t0) / span) * (X1 - X0);
    const y = (v: number) => TOP + ((hi - show(v)) / (hi - lo)) * (BOTTOM - TOP);

    const pts: Pt[] = raw.map(p => ({ x: x(p.day), y: y(p.value), value: p.value, day: p.day, start: p.start }));
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1];
    const area = `${line} L${last.x.toFixed(1)} ${BOTTOM} L${pts[0].x.toFixed(1)} ${BOTTOM} Z`;

    const lines: Line[] = g.checkpoints.map((c, i) => {
      const isGoal = i === g.checkpoints.length - 1;
      const ly = y(c.targetValue);
      return {
        y: ly,
        labelY: ly - 3 < TOP + 6 ? ly + 11 : ly - 3,
        label: `${isGoal ? 'Goal' : `M${c.index}`} · ${this.units.fmt(c.targetValue, g.unit)}`,
        tone: isGoal ? 'goal' : c.status === 'CLEARED' ? 'done' : 'open',
        showLabel: false
      };
    });
    const placed: number[] = [];
    for (const l of [...lines].reverse()) {
      if (placed.every(p => Math.abs(p - l.labelY) >= 11)) {
        l.showLabel = true;
        placed.push(l.labelY);
      }
    }

    const diff = show(g.currentValue) - show(g.startValue);
    const left = g.path === 'LOSE' ? g.currentValue - g.goalValue : g.goalValue - g.currentValue;
    const unit = this.units.label(g.unit);
    const need = Math.max(0, 2 - entries.length);
    const [one, many] = NOUNS[g.metric];
    return {
      title: g.metric === 'WEIGHT' ? 'Weight' : g.metricLabel || (g.metric === 'STRENGTH' ? 'Strength' : 'Size'),
      since: shortDate(hist.start),
      change: `${diff > 0.05 ? '+' : diff < -0.05 ? '−' : ''}${Math.abs(diff).toFixed(1)} ${unit}`,
      tone: Math.abs(diff) < 0.05 ? 'flat' : (diff < 0) === (g.path === 'LOSE') ? 'ok' : 'bad',
      toGo: this.units.amount(Math.max(0, left), g.unit),
      need,
      needText: `Needs ${need} more ${need === 1 ? one : many} to show`,
      logLabel: g.metric === 'SIZE' ? 'Log measurement' : g.metric === 'STRENGTH' ? 'Log lift' : null,
      pts,
      dots: pts.length <= 45 ? pts : [pts[0]],
      last,
      line,
      area,
      lines,
      unit: g.unit
    };
  });

  protected readonly tip = computed(() => {
    const c = this.view();
    const i = this.selected();
    if (!c || i === null || !c.pts[i]) return null;
    const p = c.pts[i];
    return {
      x: p.x,
      y: p.y,
      left: Math.min(84, Math.max(16, (p.x / W) * 100)),
      top: (p.y / H) * 100,
      text: `${this.units.amount(p.value, c.unit)} · ${p.start ? 'Start' : shortDate(p.day)}`
    };
  });

  constructor() {
    void this.load();
  }

  protected color(tone: Line['tone']): string {
    return tone === 'goal' ? 'var(--gold)' : tone === 'done' ? 'var(--ok)' : 'var(--mute)';
  }

  protected pick(e: PointerEvent): void {
    const c = this.view();
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    if (!c || !rect.width) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    c.pts.forEach((p, i) => { if (Math.abs(p.x - px) < Math.abs(c.pts[best].x - px)) best = i; });
    this.selected.set(best);
  }

  protected async logProgress(): Promise<void> {
    const g = this.goal();
    if (!g || this.logging()) return;
    this.logging.set(true);
    try {
      if (await this.proofs.logMeasurement(g)) await this.load();
    } finally {
      this.logging.set(false);
    }
  }

  protected async load(): Promise<void> {
    this.failure.set(null);
    try {
      const [, hist] = await Promise.all([this.goals.load(), this.api.goalHistory()]);
      this.history.set(hist);
      if (!this.goal()) this.failure.set('error');
    } catch (e) {
      this.failure.set(isProRequired(e) ? 'pro' : 'error');
    } finally {
      this.loading.set(false);
    }
  }
}
