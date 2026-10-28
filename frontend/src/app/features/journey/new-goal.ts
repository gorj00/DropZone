import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { Goal } from '../../core/api/models';
import { MIN_GAP, displayBounds, milestonesFit } from '../../core/plausibility';
import { GoalStore } from '../../core/stores';
import { ToastService } from '../../core/toast.service';
import { UnitsService } from '../../core/units';
import { Icon } from '../../ui/icon';
import { ValueInput } from '../onboarding/goal';
import { CHECKPOINT_COUNTS, planCheckpoints, roundTo } from '../onboarding/onboarding.state';
import { beyond } from './goal-plan';

const STEP: Record<Goal['metric'], { metric: number; imperial: number }> = {
  WEIGHT: { metric: 0.5, imperial: 1 },
  STRENGTH: { metric: 2.5, imperial: 5 },
  SIZE: { metric: 0.5, imperial: 0.25 }
};

export function suggestedTarget(goal: Goal, step: number, digits: number, toDisplay: (v: number) => number): number {
  const start = toDisplay(goal.currentValue);
  const share = goal.metric === 'STRENGTH' ? 0.1 : goal.metric === 'SIZE' ? 0.05 : 0.06;
  const dist = Math.max(step * 2, Math.round((start * share) / step) * step);
  return roundTo(goal.path === 'LOSE' ? start - dist : start + dist, digits);
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, ValueInput],
  template: `
    <div class="screen">
      <div class="pad pt-3 h-[62px] flex items-center gap-3">
        <button class="circ" (click)="back()" aria-label="Back"><app-icon name="back" /></button>
        <div class="h text-[26px] truncate">New goal</div>
      </div>

      @if (goal(); as g) {
        <div class="pad mt-1">
          <p class="text-[14px] text-mute leading-snug">{{ g.path === 'LOSE' ? 'Keep dropping' : 'Keep building' }}{{ g.metricLabel ? ' · ' + g.metricLabel : '' }}. Your new goal starts where you are now. Your finished goal stays in your profile.</p>
        </div>

        <div class="pad mt-4 space-y-2.5">
          <div class="card px-4 py-3">
            <div class="lbl">Start · now</div>
            <div class="flex items-baseline gap-1.5 mt-1">
              <span class="num text-[40px] leading-none" data-test="start">{{ startText() }}</span>
              <span class="num text-[18px] text-mute uppercase">{{ unit() }}</span>
            </div>
          </div>
          <div class="card-hi px-4 py-3 flex items-center">
            <div class="flex-1 min-w-0">
              <div class="lbl" style="color: var(--accent-light)">New goal</div>
              <div class="flex items-baseline gap-1.5 mt-1">
                <app-value-input [value]="target()" [fixed]="digits() === 1" [digits]="digits()" [size]="40" label="New goal" (changed)="setTarget($event)" />
                <span class="num text-[18px] text-mute uppercase">{{ unit() }}</span>
              </div>
            </div>
            <div class="flex gap-2">
              <button class="stp" aria-label="Decrease goal" (click)="nudge(-1)"><app-icon name="minus" /></button>
              <button class="stp" aria-label="Increase goal" (click)="nudge(1)"><app-icon name="plus" /></button>
            </div>
          </div>
        </div>

        @if (problem(); as p) {
          <p class="pad mt-2 text-[12.5px] font-semibold" style="color:var(--accent-light)" data-test="problem">{{ p }}</p>
        }

        <div class="pad mt-4">
          <div class="flex justify-between items-baseline mb-2">
            <span class="lbl">Milestone rewards</span>
            @if (!problem()) { <span class="text-[12px] text-mute font-semibold">{{ track().length }} milestones</span> }
          </div>
          <div class="grid grid-cols-9 gap-[5px]">
            @for (n of counts; track n) {
              @let fits = fitting().has(n);
              <button class="opt sm" [class.on]="chosen() === n" [class.opacity-40]="!fits" [disabled]="!fits" [attr.aria-pressed]="chosen() === n" (click)="count.set(n)">{{ n }}</button>
            }
          </div>
        </div>

        @if (!problem()) {
          <div class="pad mt-4">
            <div class="card divide-y divide-line">
              @for (v of track(); track $index; let last = $last) {
                <div class="px-3.5 h-[44px] flex items-center gap-3">
                  <span class="inline-flex" [class.text-gold]="!last" [class.text-accent]="last"><app-icon [name]="last ? 'flag' : 'gift'" [size]="16" /></span>
                  <span class="flex-1 text-[14px] font-semibold">{{ last ? 'Goal' : 'Milestone ' + ($index + 1) }}</span>
                  <span class="num text-[16px]">{{ u.fmt(v, g.unit) }} {{ unit() }}</span>
                </div>
              }
            </div>
          </div>
        }

        <div class="mt-auto pad pt-6 pb-[calc(32px+env(safe-area-inset-bottom))]">
          <button class="btn btn-primary" [disabled]="saving() || !!problem()" (click)="save()">{{ saving() ? 'Saving…' : 'Start new goal' }}</button>
        </div>
      } @else {
        <div class="pad mt-4 space-y-3"><div class="skeleton h-[84px]"></div><div class="skeleton h-[84px]"></div><div class="skeleton h-[160px]"></div></div>
      }
    </div>
  `
})
export class NewGoalPage {
  private readonly goals = inject(GoalStore);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  protected readonly u = inject(UnitsService);

  protected readonly counts = CHECKPOINT_COUNTS;
  protected readonly goal = computed(() => {
    const g = this.goals.goal();
    return g?.reached ? g : null;
  });
  protected readonly saving = signal(false);
  protected readonly target = signal(0);
  protected readonly count = signal(4);

  protected readonly unit = computed(() => this.u.label(this.goal()?.unit ?? 'kg'));
  protected readonly digits = computed(() => (this.unit() === 'in' ? 2 : 1));
  private readonly step = computed(() => {
    const g = this.goal();
    if (!g) return 0.5;
    const s = STEP[g.metric];
    return this.unit() === 'lb' || this.unit() === 'in' ? s.imperial : s.metric;
  });
  private readonly start = computed(() => this.goal()?.currentValue ?? 0);
  protected readonly startText = computed(() => this.u.fmt(this.start(), this.goal()?.unit ?? 'kg', this.digits()));
  private readonly targetMetric = computed(() => this.u.toMetric(this.target(), this.goal()?.unit ?? 'kg'));
  protected readonly fitting = computed(() => {
    const g = this.goal();
    if (!g) return new Set<number>();
    return new Set(CHECKPOINT_COUNTS.filter(n => milestonesFit(this.start(), this.targetMetric(), n, MIN_GAP[g.metric])));
  });
  protected readonly track = computed(() => {
    const g = this.goal();
    return g ? planCheckpoints(this.start(), this.targetMetric(), this.count(), MIN_GAP[g.metric]) : [];
  });
  protected readonly chosen = computed(() => this.track().length || this.count());
  protected readonly problem = computed(() => {
    const g = this.goal();
    if (!g) return null;
    const b = displayBounds(g.metric, this.u.units(), this.digits());
    const t = this.target();
    if (!Number.isFinite(t) || t < b.min || t > b.max) return `Pick a goal between ${b.min} and ${b.max} ${this.unit()}.`;
    if (!beyond(g.path, this.targetMetric(), this.start())) return g.path === 'LOSE' ? 'Your new goal has to be below where you are now.' : 'Your new goal has to be above where you are now.';
    if (!this.track().length) return `Your new goal is too close to where you are now. Make it at least ${this.u.amount(2 * MIN_GAP[g.metric], g.unit)} away.`;
    return null;
  });

  private filled = false;

  constructor() {
    void this.goals.load().then(g => {
      if (!g?.reached) void this.router.navigateByUrl('/journey', { replaceUrl: true });
    });
    effect(() => {
      const g = this.goal();
      if (!g || this.filled) return;
      this.filled = true;
      this.count.set(Math.min(10, Math.max(2, g.checkpoints.length || 4)));
      this.target.set(suggestedTarget(g, this.step(), this.digits(), v => this.u.value(v, g.unit)));
    });
  }

  protected back(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl('/journey');
  }

  protected setTarget(raw: string): void {
    const v = parseFloat(raw.replace(',', '.'));
    if (Number.isFinite(v) && v > 0) this.target.set(roundTo(v, this.digits()));
  }

  protected nudge(dir: 1 | -1): void {
    this.target.update(t => roundTo(t + dir * this.step(), this.digits()));
  }

  protected async save(): Promise<void> {
    if (this.problem() || this.saving()) return;
    this.saving.set(true);
    try {
      const g = await this.api.newGoal({ goalValue: this.targetMetric(), checkpoints: this.track().length });
      this.goals.goal.set(g);
      this.toast.show('New goal set. Pick rewards for your milestones.');
      void this.router.navigateByUrl('/journey', { replaceUrl: true });
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.saving.set(false);
    }
  }
}
