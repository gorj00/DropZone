import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Goal } from '../../core/api/models';
import { boundsError, rangeText } from '../../core/plausibility';
import { GoalStore } from '../../core/stores';
import { ToastService } from '../../core/toast.service';
import { UnitsService } from '../../core/units';
import { Icon } from '../../ui/icon';
import { goalEditError, isDone, respread, startLocked } from './goal-plan';
import { pad } from './journey.util';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, RouterLink],
  template: `
    <div class="screen">
      <div class="pad pt-3 h-[62px] flex items-center gap-3">
        <button class="circ" (click)="back()" aria-label="Back"><app-icon name="back" /></button>
        <div class="h text-[26px] truncate">Edit goal</div>
      </div>

      @if (goal(); as g) {
        <div class="pad mt-2">
          <p class="text-[14px] text-mute leading-snug">
            {{ g.path === 'LOSE' ? 'Weight loss' : 'Build' }}{{ g.metricLabel ? ' · ' + g.metricLabel : '' }}. Milestones you haven't reached yet move with the new values.
          </p>
          <p class="text-[12.5px] text-mute mt-1.5 leading-snug">Changing the goal spreads those milestones evenly again, so targets you set yourself are replaced. Values from {{ range() }}.</p>
        </div>

        <div class="pad mt-4 grid grid-cols-2 gap-2.5">
          <label class="block">
            <span class="lbl block mb-1.5">Start</span>
            <span class="relative block">
              <input class="field num !pr-12 disabled:opacity-50" type="text" inputmode="decimal" [disabled]="locked()" [value]="startText()" (input)="startText.set($any($event.target).value)">
              <span class="lbl absolute right-4 top-1/2 -translate-y-1/2">{{ unit() }}</span>
            </span>
          </label>
          <label class="block">
            <span class="lbl block mb-1.5">Target</span>
            <span class="relative block">
              <input class="field num !pr-12" type="text" inputmode="decimal" [value]="targetText()" (input)="targetText.set($any($event.target).value)">
              <span class="lbl absolute right-4 top-1/2 -translate-y-1/2">{{ unit() }}</span>
            </span>
          </label>
        </div>
        @if (locked()) {
          <p class="pad text-[12px] text-mute mt-2 flex items-center gap-1.5"><app-icon name="lock" [size]="13" />The start is locked once a milestone is cleared.</p>
        }
        @if (error(); as e) {
          <p class="pad text-[12.5px] text-accent font-semibold mt-2">{{ e }}</p>
        }
        @if (g.reached) {
          <div class="pad mt-3"><a class="btn btn-gold" routerLink="/goal/new"><app-icon name="flag" />Set a new goal</a></div>
        }

        <div class="pad mt-5">
          <div class="lbl mb-2">Milestones</div>
          <div class="card divide-y divide-line">
            @for (row of preview(); track row.index) {
              <div class="px-3.5 h-[50px] flex items-center gap-3">
                <span class="num text-[15px] w-7 text-mute">{{ pad(row.index) }}</span>
                <span class="flex-1 min-w-0 truncate text-[14px] font-semibold">{{ row.title }}</span>
                @if (row.done) {
                  <span class="chip !text-ok text-[11px]"><app-icon name="check" [size]="12" />{{ row.status }}</span>
                }
                <span class="num text-[16px]" [class.text-mute]="row.done" [class.text-accent]="row.changed">{{ units.fmt(row.value, g.unit) }} {{ unit() }}</span>
              </div>
            }
          </div>
        </div>

        <div class="mt-auto pad pt-6 pb-[calc(32px+env(safe-area-inset-bottom))]">
          <button class="btn btn-primary" [disabled]="saving() || !!error() || !changed()" (click)="save()">{{ saving() ? 'Saving…' : 'Save goal' }}</button>
        </div>
      } @else {
        <div class="pad mt-4 space-y-3"><div class="skeleton h-[52px] rounded-[14px]"></div><div class="skeleton h-[220px] rounded-[18px]"></div></div>
      }
    </div>
  `
})
export class GoalEditPage {
  private readonly goals = inject(GoalStore);
  private readonly toast = inject(ToastService);
  private readonly location = inject(Location);
  protected readonly units = inject(UnitsService);
  protected readonly pad = pad;

  protected readonly goal = this.goals.goal;
  protected readonly saving = signal(false);
  protected readonly startText = signal('');
  protected readonly targetText = signal('');

  protected readonly unit = computed(() => this.units.label(this.goal()?.unit ?? 'kg'));
  protected readonly locked = computed(() => { const g = this.goal(); return !!g && startLocked(g); });
  private readonly start = computed(() => this.parse(this.startText()));
  private readonly target = computed(() => this.parse(this.targetText()));
  protected readonly error = computed(() => {
    const g = this.goal();
    const start = this.start();
    const target = this.target();
    if (!g) return null;
    if (start === null || target === null) return 'Enter both values.';
    const units = this.units.units();
    return (this.locked() ? null : boundsError(g.metric, start, units, 'Start')) ?? boundsError(g.metric, target, units, 'Target')
      ?? goalEditError(g, start, target, v => `${this.units.fmt(v, g.unit)} ${this.unit()}`);
  });
  protected readonly range = computed(() => rangeText(this.goal()?.metric ?? 'WEIGHT', this.units.units()));
  protected readonly changed = computed(() => {
    const g = this.goal();
    const start = this.start();
    const target = this.target();
    return !!g && start !== null && target !== null && (Math.abs(start - g.startValue) > 0.01 || Math.abs(target - g.goalValue) > 0.01);
  });
  protected readonly preview = computed(() => {
    const g = this.goal();
    if (!g) return [];
    const start = this.start() ?? g.startValue;
    const target = this.target() ?? g.goalValue;
    const values = this.error() ? g.checkpoints.map(c => c.targetValue) : respread(g, start, target);
    return [...g.checkpoints].sort((a, b) => a.index - b.index).map((c, i) => ({
      index: c.index,
      title: c.rewardTitle?.trim() || `Milestone ${c.index}`,
      done: isDone(c),
      status: c.status === 'CLEARED' ? 'Cleared' : 'Pending',
      value: values[i],
      changed: Math.abs(values[i] - c.targetValue) > 0.01
    }));
  });

  constructor() {
    const g = this.goals.goal();
    if (g) this.fill(g);
    else void this.goals.load().then(loaded => loaded && this.fill(loaded));
  }

  protected back(): void {
    this.location.back();
  }

  protected async save(): Promise<void> {
    const g = this.goal();
    const start = this.start();
    const target = this.target();
    if (!g || start === null || target === null || this.error()) return;
    this.saving.set(true);
    try {
      await this.goals.updateGoal({
        goalValue: target,
        ...(this.locked() || Math.abs(start - g.startValue) <= 0.01 ? {} : { startValue: start })
      });
      this.toast.show('Goal updated.');
      this.location.back();
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.saving.set(false);
    }
  }

  private fill(g: Goal): void {
    this.startText.set(this.units.fmt(g.startValue, g.unit));
    this.targetText.set(this.units.fmt(g.goalValue, g.unit));
  }

  private parse(raw: string): number | null {
    const v = parseFloat(raw.replace(',', '.'));
    const unit = this.goal()?.unit ?? 'kg';
    return Number.isFinite(v) && v > 0 ? this.units.toMetric(v, unit) : null;
  }
}
