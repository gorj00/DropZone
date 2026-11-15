import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Goal } from '../../core/api/models';
import { MAX_MILESTONES, MIN_GAP, boundsError, displayGap, ownMilestonesError, rangeText } from '../../core/plausibility';
import { GoalStore } from '../../core/stores';
import { ToastService } from '../../core/toast.service';
import { UnitsService } from '../../core/units';
import { Icon } from '../../ui/icon';
import { beyond, isDone, lastDone, startLocked } from './goal-plan';
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
          <p class="text-[12.5px] text-mute mt-1.5 leading-snug">Changing the target spreads the milestones you haven't reached evenly again. You can also set each one yourself or add new ones after the last. Values from {{ range() }}.</p>
        </div>

        <div class="pad mt-4 grid grid-cols-2 gap-2.5">
          <label class="block">
            <span class="lbl block mb-1.5">Start</span>
            <span class="relative block">
              <input class="field num !pr-12 disabled:opacity-50" type="text" inputmode="decimal" [disabled]="locked()" [value]="startText()" (input)="setStart($any($event.target).value)">
              <span class="lbl absolute right-4 top-1/2 -translate-y-1/2">{{ unit() }}</span>
            </span>
          </label>
          <label class="block">
            <span class="lbl block mb-1.5">Target</span>
            <span class="relative block">
              <input class="field num !pr-12" type="text" inputmode="decimal" [value]="targetText()" (input)="setTarget($any($event.target).value)">
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
            @for (row of rows(); track $index; let i = $index) {
              <div class="px-3.5 h-[52px] flex items-center gap-3">
                <span class="num text-[15px] w-7 text-mute">{{ pad(row.index) }}</span>
                <span class="flex-1 min-w-0 truncate text-[14px] font-semibold">{{ row.title }}</span>
                @if (row.done) {
                  <span class="chip !text-ok text-[11px]"><app-icon name="check" [size]="12" />{{ row.status }}</span>
                  <span class="num text-[16px] text-mute">{{ row.text }} {{ unit() }}</span>
                } @else {
                  <input class="field num !h-[36px] !w-[96px] !px-2.5 text-right text-[15px]" type="text" inputmode="decimal" [attr.aria-label]="row.title"
                    [value]="row.text" (input)="setRow(i, $any($event.target).value)">
                  <span class="num text-[14px] text-mute w-6">{{ unit() }}</span>
                }
              </div>
            }
          </div>
          <button class="btn btn-ghost btn-sm mt-2.5" [disabled]="rows().length >= maxMilestones" (click)="add()"><app-icon name="plus" [size]="15" />Add milestone</button>
          @if (rows().length >= maxMilestones) {
            <p class="text-[12px] text-mute mt-1.5">A goal has at most {{ maxMilestones }} milestones.</p>
          }
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
  protected readonly maxMilestones = MAX_MILESTONES;

  protected readonly goal = this.goals.goal;
  protected readonly saving = signal(false);
  protected readonly startText = signal('');
  protected readonly targetText = signal('');
  private readonly rowTexts = signal<string[]>([]);

  protected readonly unit = computed(() => this.units.label(this.goal()?.unit ?? 'kg'));
  protected readonly locked = computed(() => { const g = this.goal(); return !!g && startLocked(g); });
  private readonly sorted = computed(() => [...(this.goal()?.checkpoints ?? [])].sort((a, b) => a.index - b.index));
  private readonly fixedCount = computed(() => { const g = this.goal(); return g ? lastDone(g)?.index ?? 0 : 0; });
  private readonly start = computed(() => this.parse(this.startText()));
  private readonly gap = computed(() => displayGap(this.units.value(MIN_GAP[this.goal()?.metric ?? 'WEIGHT'], this.goal()?.unit ?? 'kg'), 1));

  protected readonly rows = computed(() => {
    const list = this.sorted();
    return this.rowTexts().map((text, i) => {
      const c = list[i];
      return {
        index: i + 1,
        title: c?.rewardTitle?.trim() || `Milestone ${i + 1}`,
        done: !!c && isDone(c),
        status: c?.status === 'CLEARED' ? 'Cleared' : 'Pending',
        text
      };
    });
  });
  private readonly openValues = computed(() => this.rowTexts().slice(this.fixedCount()).map(t => this.parseDisplay(t)));

  protected readonly error = computed(() => {
    const g = this.goal();
    const start = this.start();
    if (!g) return null;
    if (start === null) return 'Enter a start value.';
    const units = this.units.units();
    const startProblem = this.locked() ? null : boundsError(g.metric, start, units, 'Start');
    if (startProblem) return startProblem;
    const open = this.openValues();
    if (!open.length) return null;
    for (const v of open) {
      if (v !== null) {
        const bounds = boundsError(g.metric, this.units.toMetric(v, g.unit), units, 'Milestone');
        if (bounds) return bounds;
      }
    }
    const list = this.sorted();
    const fixed = this.fixedCount();
    if (fixed && list.length && !beyond(g.path, list[0].targetValue, start)) {
      return `The start must stay ${g.path === 'LOSE' ? 'above' : 'below'} milestone 1 (${this.show(list[0].targetValue)}).`;
    }
    const base = fixed ? this.units.value(list[fixed - 1].targetValue, g.unit) : this.units.value(start, g.unit);
    return ownMilestonesError(open.map(v => v ?? NaN), base, g.path === 'LOSE', this.gap(), v => `${v.toFixed(1)} ${this.unit()}`, fixed + 1);
  });
  protected readonly range = computed(() => rangeText(this.goal()?.metric ?? 'WEIGHT', this.units.units()));
  protected readonly changed = computed(() => {
    const g = this.goal();
    const start = this.start();
    if (!g || start === null) return false;
    const list = this.sorted();
    const texts = this.rowTexts();
    if (texts.length !== list.length) return true;
    if (!this.locked() && Math.abs(start - g.startValue) > 0.01) return true;
    return texts.some((t, i) => {
      const v = this.parse(t);
      return v === null || Math.abs(v - list[i].targetValue) > 0.01;
    });
  });

  constructor() {
    const g = this.goals.goal();
    if (g) this.fill(g);
    else void this.goals.load().then(loaded => loaded && this.fill(loaded));
  }

  protected back(): void {
    this.location.back();
  }

  protected setStart(raw: string): void {
    this.startText.set(raw);
    if (!this.fixedCount()) this.spread();
  }

  protected setTarget(raw: string): void {
    this.targetText.set(raw);
    this.spread();
  }

  protected setRow(i: number, raw: string): void {
    this.rowTexts.update(list => list.map((t, j) => (j === i ? raw : t)));
    if (i === this.rowTexts().length - 1) this.targetText.set(raw);
  }

  protected add(): void {
    const g = this.goal();
    const texts = this.rowTexts();
    if (!g || texts.length >= this.maxMilestones) return;
    const values = texts.map(t => this.parseDisplay(t));
    const last = values[values.length - 1];
    if (last === null) return;
    const before = values.length > 1 ? values[values.length - 2] : this.units.value(this.start() ?? g.startValue, g.unit);
    const step = Math.max(this.gap(), before !== null ? Math.abs(last - before) : this.gap());
    const next = Math.round((g.path === 'LOSE' ? last - step : last + step) * 10) / 10;
    const text = next.toFixed(1);
    this.rowTexts.set([...texts, text]);
    this.targetText.set(text);
  }

  protected async save(): Promise<void> {
    const g = this.goal();
    const start = this.start();
    const open = this.openValues();
    if (!g || start === null || this.error() || open.some(v => v === null)) return;
    const milestones = open.map(v => this.units.toMetric(v!, g.unit));
    this.saving.set(true);
    try {
      await this.goals.updateGoal({
        ...(milestones.length ? { goalValue: milestones[milestones.length - 1], milestones } : {}),
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

  private spread(): void {
    const g = this.goal();
    const target = this.parseDisplay(this.targetText());
    const start = this.start();
    const texts = this.rowTexts();
    if (!g || target === null || start === null || !texts.length) return;
    const fixed = this.fixedCount();
    const open = texts.length - fixed;
    if (open <= 0) return;
    const list = this.sorted();
    const base = fixed ? this.units.value(list[fixed - 1].targetValue, g.unit) : this.units.value(start, g.unit);
    if (!beyond(g.path, target, base)) return;
    this.rowTexts.set(texts.map((t, i) => {
      const j = i - fixed;
      if (j < 0) return t;
      const v = j === open - 1 ? target : base + ((target - base) * (j + 1)) / open;
      return (Math.round(v * 10) / 10).toFixed(1);
    }));
  }

  private fill(g: Goal): void {
    this.startText.set(this.units.fmt(g.startValue, g.unit));
    this.targetText.set(this.units.fmt(g.goalValue, g.unit));
    this.rowTexts.set([...g.checkpoints].sort((a, b) => a.index - b.index).map(c => this.units.fmt(c.targetValue, g.unit)));
  }

  private show(v: number): string {
    return `${this.units.fmt(v, this.goal()?.unit ?? 'kg')} ${this.unit()}`;
  }

  private parseDisplay(raw: string): number | null {
    const v = parseFloat(raw.replace(',', '.'));
    return Number.isFinite(v) && v > 0 ? v : null;
  }

  private parse(raw: string): number | null {
    const v = this.parseDisplay(raw);
    return v === null ? null : this.units.toMetric(v, this.goal()?.unit ?? 'kg');
  }
}
