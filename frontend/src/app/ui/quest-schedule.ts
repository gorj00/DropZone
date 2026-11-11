import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AutoSource, Exercise, ProofType } from '../core/api/models';
import { HEALTH_NAME } from '../core/platform';
import { Icon } from './icon';

export const MAX_PER_DAY = 20;
export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
export const DEFAULT_REPS = 20;
export const MIN_REPS = 5;
export const MAX_REPS = 200;
export const REP_LEVELS = [{ name: 'Easy', reps: 10 }, { name: 'Medium', reps: 20 }, { name: 'Hard', reps: 40 }];

export const WEEK = [
  { n: 1, short: 'M', name: 'Monday' }, { n: 2, short: 'T', name: 'Tuesday' }, { n: 3, short: 'W', name: 'Wednesday' },
  { n: 4, short: 'T', name: 'Thursday' }, { n: 5, short: 'F', name: 'Friday' }, { n: 6, short: 'S', name: 'Saturday' },
  { n: 7, short: 'S', name: 'Sunday' }
];

export type GoalKind = 'STEPS' | 'SLEEP' | 'REPS';

const GOAL_RULES: Record<GoalKind, { step: number; min: number; max: number }> = {
  STEPS: { step: 500, min: 1000, max: 50000 },
  SLEEP: { step: 30, min: 240, max: 720 },
  REPS: { step: 5, min: MIN_REPS, max: MAX_REPS }
};

export function goalKindOf(q: { proof: ProofType; autoSource: AutoSource | null }): GoalKind | null {
  if (q.proof === 'REPS') return 'REPS';
  return q.proof === 'AUTO' ? q.autoSource : null;
}

export function goalOf(q: { proof: ProofType; autoSource: AutoSource | null; target: number | null }, target: number | null = null): number | null {
  const kind = goalKindOf(q);
  if (!kind) return null;
  return target ?? q.target ?? (kind === 'REPS' ? DEFAULT_REPS : null);
}

export function repsFor(target: number, exercise: Exercise): number {
  return exercise === 'PUSHUP' ? Math.ceil(target / 2) : target;
}

export function goalText(kind: GoalKind, value: number): string {
  if (kind === 'REPS') return `${value} squats or ${repsFor(value, 'PUSHUP')} push-ups`;
  if (kind === 'SLEEP') {
    const h = Math.round((value / 60) * 10) / 10;
    return `${Number.isInteger(h) ? h : h.toFixed(1)} h sleep`;
  }
  return `${value.toLocaleString('en-US')} steps`;
}

export function daysLabel(days: number[]): string {
  if (days.length === 7) return 'Every day';
  const set = new Set(days);
  if (set.size === 5 && [1, 2, 3, 4, 5].every(d => set.has(d))) return 'Weekdays';
  if (set.size === 2 && set.has(6) && set.has(7)) return 'Weekends';
  return WEEK.filter(d => set.has(d.n)).map(d => d.name.slice(0, 3)).join(', ');
}

@Component({
  selector: 'app-quest-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="flex justify-between gap-1">
      @for (d of week; track d.n) {
        @let on = days().includes(d.n);
        <button type="button" class="day !w-[34px] !h-[34px] !text-[13px]" [class.on]="on" [disabled]="disabled()"
                [attr.aria-label]="d.name" [attr.aria-pressed]="on" (click)="toggle(d.n)">{{ d.short }}</button>
      }
    </div>
    @if (goal() !== null && goalKind() === 'REPS') {
      @let custom = !isLevel(goal()!);
      <div class="mt-3">
        <div class="text-[13.5px] font-bold">Daily goal</div>
        <div class="text-[11.5px] text-mute">{{ text('REPS', goal()!) }} in one go</div>
        <div class="grid grid-cols-4 gap-1.5 mt-2.5" role="group" aria-label="Rep goal">
          @for (l of levels; track l.reps) {
            @let on = goal() === l.reps;
            <button type="button" class="chip justify-center h-[34px] text-[12px]" [class.on]="on" [disabled]="disabled()"
                    [attr.aria-pressed]="on" (click)="setReps(l.reps)">{{ l.name }} {{ l.reps }}</button>
          }
          <input class="chip h-[34px] w-full min-w-0 text-[12px] text-center outline-none" [class.on]="custom" type="text" inputmode="numeric" enterkeyhint="done"
                 placeholder="Custom" [attr.aria-label]="'Custom squats, ' + minReps + ' to ' + maxReps" [disabled]="disabled()"
                 [value]="custom ? goal() : ''" (change)="customReps($event)" (keydown.enter)="$any($event.target).blur()">
        </div>
      </div>
    } @else if (goal() !== null && goalKind(); as kind) {
      <div class="flex items-center justify-between gap-3 mt-3">
        <div class="min-w-0">
          <div class="text-[13.5px] font-bold">Daily goal</div>
          <div class="text-[11.5px] text-mute">{{ 'Synced from ' + healthName + (kind === 'SLEEP' ? ' sleep' : ' steps') }}</div>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="stp" aria-label="Lower daily goal" [disabled]="disabled() || (goal() ?? 0) <= rules(kind).min" (click)="stepGoal(kind, -1)"><app-icon name="minus" /></button>
          <span class="num text-[17px] min-w-[86px] text-center">{{ text(kind, goal()!) }}</span>
          <button type="button" class="stp" aria-label="Raise daily goal" [disabled]="disabled() || (goal() ?? 0) >= rules(kind).max" (click)="stepGoal(kind, 1)"><app-icon name="plus" /></button>
        </div>
      </div>
    }
    @if (perDay() !== null) {
      <div class="flex items-center justify-between gap-3 mt-3">
        <div class="min-w-0">
          <div class="text-[13.5px] font-bold">Meals a day</div>
          <div class="text-[11.5px] text-mute">Each meal is its own quest</div>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="stp" aria-label="Fewer meals" [disabled]="disabled() || (perDay() ?? 1) <= 1" (click)="step(-1)"><app-icon name="minus" /></button>
          <span class="num text-[22px] w-7 text-center">{{ perDay() }}</span>
          <button type="button" class="stp" aria-label="More meals" [disabled]="disabled() || (perDay() ?? 1) >= max" (click)="step(1)"><app-icon name="plus" /></button>
        </div>
      </div>
    }
  `
})
export class QuestSchedule {
  protected readonly healthName = HEALTH_NAME;
  readonly days = input<number[]>(ALL_DAYS);
  readonly perDay = input<number | null>(null);
  readonly goal = input<number | null>(null);
  readonly goalKind = input<GoalKind | null>(null);
  readonly disabled = input(false);
  readonly daysChange = output<number[]>();
  readonly perDayChange = output<number>();
  readonly goalChange = output<number>();

  protected readonly week = WEEK;
  protected readonly max = MAX_PER_DAY;
  protected readonly levels = REP_LEVELS;
  protected readonly minReps = MIN_REPS;
  protected readonly maxReps = MAX_REPS;

  protected isLevel(value: number): boolean {
    return REP_LEVELS.some(l => l.reps === value);
  }

  protected setReps(value: number): void {
    if (value !== this.goal()) this.goalChange.emit(value);
  }

  protected customReps(e: Event): void {
    const el = e.target as HTMLInputElement;
    const v = Number(el.value.trim());
    if (Number.isInteger(v) && v >= MIN_REPS && v <= MAX_REPS) {
      this.setReps(v);
      if (this.isLevel(v)) el.value = '';
      return;
    }
    const current = this.goal();
    el.value = current !== null && !this.isLevel(current) ? String(current) : '';
  }

  protected toggle(n: number): void {
    const days = this.days();
    if (days.includes(n)) {
      if (days.length > 1) this.daysChange.emit(days.filter(d => d !== n));
      return;
    }
    this.daysChange.emit([...days, n].sort((a, b) => a - b));
  }

  protected rules(kind: GoalKind): { step: number; min: number; max: number } {
    return GOAL_RULES[kind];
  }

  protected text(kind: GoalKind, value: number): string {
    return goalText(kind, value);
  }

  protected stepGoal(kind: GoalKind, dir: 1 | -1): void {
    const r = GOAL_RULES[kind];
    const current = this.goal() ?? r.min;
    const next = Math.min(r.max, Math.max(r.min, Math.round(current / r.step) * r.step + dir * r.step));
    if (next !== current) this.goalChange.emit(next);
  }

  protected step(dir: 1 | -1): void {
    const next = Math.min(MAX_PER_DAY, Math.max(1, (this.perDay() ?? 1) + dir));
    if (next !== this.perDay()) this.perDayChange.emit(next);
  }
}
