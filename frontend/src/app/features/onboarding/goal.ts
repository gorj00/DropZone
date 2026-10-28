import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Metric } from '../../core/api/models';
import { ThemeService } from '../../core/theme.service';
import { Badge } from '../../ui/badge';
import { StepBar } from '../../ui/bits';
import { Icon } from '../../ui/icon';
import { Silhouette } from '../../ui/silhouette';
import { CHECKPOINT_COUNTS, LIFTS, OnboardingState, SIZES, trimNum } from './onboarding.state';

@Component({
  selector: 'app-value-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:contents' },
  template: `
    <input class="num bg-transparent border-0 outline-none p-0 m-0 leading-none" type="text" inputmode="decimal" enterkeyhint="done"
           [attr.aria-label]="label()" [style.width.ch]="width()" [style.font-size.px]="size()" [style.color]="color()"
           [value]="text()" (focus)="$any($event.target).select()" (change)="commit($any($event.target))" (keydown.enter)="$any($event.target).blur()">
  `
})
export class ValueInput {
  readonly value = input.required<number>();
  readonly fixed = input(true);
  readonly digits = input(1);
  readonly size = input(28);
  readonly color = input<string | null>(null);
  readonly label = input('');
  readonly changed = output<string>();
  protected readonly text = computed(() => (this.fixed() ? this.value().toFixed(1) : trimNum(this.value(), this.digits())));
  protected readonly width = computed(() => {
    const t = this.text();
    return t.replace(/\D/g, '').length + (t.includes('.') ? 0.4 : 0) + 0.2;
  });

  protected commit(el: HTMLInputElement): void {
    this.changed.emit(el.value);
    el.value = this.text();
  }
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StepBar, Icon, Silhouette, Badge, ValueInput],
  host: {
    '[style.--gain]': "theme.isNeon() ? 'var(--accent-2)' : 'var(--ok)'",
    '[style.--gain-rgb]': "theme.isNeon() ? 'var(--accent-2-rgb)' : 'var(--ok-rgb)'"
  },
  template: `
    <div class="screen">
      <app-step-bar [step]="3" />
      <div class="pad mt-3">
        <div class="h text-[38px]">{{ lose() ? 'Set your drop' : 'Set your build' }}</div>
        <p class="text-[14.5px] text-mute mt-1.5">{{ subtitle() }}</p>
      </div>

      <div class="pad mt-3 grid grid-cols-2 gap-2.5">
        <div>
          <div class="lbl mb-1.5">Weight</div>
          <div class="seg3 grid-cols-2" role="group" aria-label="Weight unit">
            <button [class.on]="state.weightUnit() === 'KG'" [attr.aria-pressed]="state.weightUnit() === 'KG'" (click)="state.setWeightUnit('KG')">kg</button>
            <button [class.on]="state.weightUnit() === 'LB'" [attr.aria-pressed]="state.weightUnit() === 'LB'" (click)="state.setWeightUnit('LB')">lb</button>
          </div>
        </div>
        <div>
          <div class="lbl mb-1.5">Length</div>
          <div class="seg3 grid-cols-2" role="group" aria-label="Length unit">
            <button [class.on]="state.lengthUnit() === 'CM'" [attr.aria-pressed]="state.lengthUnit() === 'CM'" (click)="state.setLengthUnit('CM')">cm</button>
            <button [class.on]="state.lengthUnit() === 'IN'" [attr.aria-pressed]="state.lengthUnit() === 'IN'" (click)="state.setLengthUnit('IN')">in</button>
          </div>
        </div>
      </div>

      @if (!lose()) {
        <div class="pad mt-3.5">
          <div class="seg3 grid-cols-3">
            @for (m of metrics; track m.key) {
              <button [class.on]="state.metric() === m.key" (click)="state.setMetric(m.key)"><app-icon [name]="m.icon" />{{ m.label }}</button>
            }
          </div>
        </div>
        @if (hasLabel() && !theme.isNeon()) {
          <div class="pad mt-2.5">
            <button class="card w-full h-[48px] px-4 flex items-center gap-2.5 rounded-[14px]" (click)="picker.set(true)">
              <span class="text-[var(--gain)]"><app-icon [name]="metricIcon()" [size]="18" /></span>
              <span class="flex-1 text-left font-semibold text-[15px]">{{ state.metricLabel() }}</span>
              <span class="text-mute"><app-icon name="chevdown" [size]="16" /></span>
            </button>
          </div>
        }
      }

      @if (theme.isNeon()) {
        <div class="mx-5 mt-4 rounded-[20px] overflow-hidden relative border border-line"
             [style.background]="lose() ? 'radial-gradient(circle at 50% 30%,#3a2a9a 0%,#17113f 72%)' : 'radial-gradient(circle at 50% 30%,#2a2a9a 0%,#17113f 72%)'">
          <div class="relative h-[196px]">
            <svg class="absolute inset-0 w-full h-full" viewBox="0 0 320 196" preserveAspectRatio="none" aria-hidden="true">
              <g stroke="#8b5cff" stroke-opacity=".22">
                <path d="M0 150 H320 M0 162 H320 M0 176 H320 M0 192 H320"/>
                <path d="M-40 196 L24 146 M20 196 L65.6 146 M80 196 L105.6 146 M140 196 L153.6 146 M180 196 L166.4 146 M240 196 L214.4 146 M300 196 L255.2 146 M360 196 L296 146"/>
              </g>
              <ellipse cx="80" cy="171" rx="58" ry="12" fill="#14104a" [attr.stroke]="lose() ? 'var(--accent-2)' : 'var(--violet)'" stroke-opacity=".75" stroke-width="1.5"/>
              <ellipse cx="80" cy="171" rx="38" ry="7.5" [attr.fill]="lose() ? 'var(--accent-2)' : 'var(--violet)'" fill-opacity=".15"/>
              <ellipse cx="240" cy="171" rx="70" ry="22" [attr.fill]="goalColor()" fill-opacity=".16"/>
              <ellipse cx="240" cy="171" rx="58" ry="12" fill="#14104a" [attr.stroke]="goalColor()" stroke-opacity=".9" stroke-width="1.5"/>
              <ellipse cx="240" cy="171" rx="38" ry="7.5" [attr.fill]="goalColor()" fill-opacity=".2"/>
            </svg>
            <span class="absolute left-1/4 top-[14px] -translate-x-1/2">
              <app-silhouette [kind]="lose() ? 'now' : 'slim'" tone="dim" [height]="156" [scan]="true" [glow]="false" />
            </span>
            <span class="absolute left-3/4 top-[14px] -translate-x-1/2">
              <app-silhouette [kind]="lose() ? 'goal' : 'buff'" [tone]="lose() ? 'accent' : 'cyan'" [height]="156" />
            </span>
            <span class="chip absolute left-3 top-3" [style.color]="lose() ? 'var(--accent-2)' : '#b49cff'" [style.background]="lose() ? 'rgba(var(--accent-2-rgb),.1)' : 'rgba(139,92,255,.14)'" [style.border-color]="lose() ? 'rgba(var(--accent-2-rgb),.35)' : 'rgba(139,92,255,.4)'">NOW</span>
            @if (hasLabel()) {
              <button class="chip absolute left-1/2 top-3 -translate-x-1/2 uppercase" (click)="picker.set(true)">
                <span class="text-accent2"><app-icon [name]="metricIcon()" /></span>{{ state.metricLabel() }}<span class="text-mute"><app-icon name="chevdown" [size]="12" /></span>
              </button>
            }
            <span class="chip absolute right-3 top-3" [style.color]="lose() ? 'var(--accent-light)' : 'var(--gain)'" [style.background]="lose() ? 'rgba(var(--accent-rgb),.12)' : 'rgba(var(--gain-rgb),.1)'" [style.border-color]="lose() ? 'rgba(var(--accent-rgb),.4)' : 'rgba(var(--gain-rgb),.4)'">GOAL</span>
            <div class="vs absolute left-1/2 -translate-x-1/2" [style.top.px]="lose() ? 72 : 80">VS</div>
          </div>
          <div class="grid grid-cols-2 border-t border-line bg-[rgba(13,10,43,.5)]">
            <div class="px-2.5 py-2.5 flex items-center justify-between gap-1">
              <div class="flex items-baseline min-w-0"><app-value-input [value]="state.start()" [fixed]="fixed()" [digits]="state.precision()" [size]="neonSize" label="Current" (changed)="set('start', $event)" /><span class="num text-[13px] text-mute ml-0.5 uppercase">{{ state.displayUnit() }}</span></div>
              <div class="flex gap-1">
                <button class="stp" aria-label="Decrease current" (click)="state.nudge('start', -1)"><app-icon name="minus" /></button>
                <button class="stp" aria-label="Increase current" (click)="state.nudge('start', 1)"><app-icon name="plus" /></button>
              </div>
            </div>
            <div class="px-2.5 py-2.5 flex items-center justify-between gap-1 border-l border-line">
              <div class="flex items-baseline min-w-0"><app-value-input [value]="state.goal()" [fixed]="fixed()" [digits]="state.precision()" [size]="neonSize" [color]="goalColor()" label="Goal" (changed)="set('goal', $event)" /><span class="num text-[13px] text-mute ml-0.5 uppercase">{{ state.displayUnit() }}</span></div>
              <div class="flex gap-1">
                <button class="stp" aria-label="Decrease goal" (click)="state.nudge('goal', -1)"><app-icon name="minus" /></button>
                <button class="stp" aria-label="Increase goal" (click)="state.nudge('goal', 1)"><app-icon name="plus" /></button>
              </div>
            </div>
          </div>
        </div>

        <div class="mx-5 mt-3 tcard flex items-stretch h-[52px]"
             [style.border-color]="lose() ? 'rgba(var(--accent-rgb),.45)' : 'rgba(var(--gain-rgb),.45)'"
             [style.box-shadow]="lose() ? '0 0 26px -10px rgba(var(--accent-rgb),.7)' : '0 0 26px -10px rgba(var(--gain-rgb),.7)'">
          <div class="flex items-center px-4 h text-[15px] tracking-[.08em]"
               [style.background]="lose() ? 'linear-gradient(90deg,var(--accent),var(--accent-light))' : 'linear-gradient(90deg,var(--accent-2),#8af8ff)'"
               [style.color]="lose() ? '#fff' : '#071a24'">{{ lose() ? 'Total drop' : 'Total gain' }}</div>
          <div class="flex-1 flex items-center justify-end gap-2 px-4" [style.color]="goalColor()">
            <app-icon [name]="lose() ? 'down' : 'up'" />
            <span class="num text-[28px]" [style.text-shadow]="'0 0 18px ' + (lose() ? 'rgba(var(--accent-rgb),.6)' : 'rgba(var(--gain-rgb),.6)')">{{ totalText() }} {{ state.displayUnit().toUpperCase() }}</span>
            @if (shortLabel(); as l) { <span class="text-[12px] text-mute font-semibold">{{ l }}</span> }
          </div>
        </div>
      } @else {
        <div class="pad mt-4 space-y-2.5">
          @for (row of rows; track row) {
            <div class="card px-4 py-3 flex items-center">
              <div class="flex-1 min-w-0">
                <div class="lbl" [style.color]="row === 'goal' ? goalColor() : null">{{ rowLabel(row) }}</div>
                <div class="flex items-baseline gap-1.5 mt-1">
                  <app-value-input [value]="row === 'start' ? state.start() : state.goal()" [fixed]="fixed()" [digits]="state.precision()" [size]="lose() ? 48 : 44" [label]="rowLabel(row)" (changed)="set(row, $event)" />
                  <span class="num text-[18px] text-mute uppercase">{{ state.displayUnit() }}</span>
                </div>
              </div>
              <div class="flex gap-2">
                <button class="stp" [attr.aria-label]="'Decrease ' + rowLabel(row)" (click)="state.nudge(row, -1)"><app-icon name="minus" /></button>
                <button class="stp" [attr.aria-label]="'Increase ' + rowLabel(row)" (click)="state.nudge(row, 1)"><app-icon name="plus" /></button>
              </div>
            </div>
          }
        </div>
        <div class="mx-5 mt-3 px-4 h-[58px] flex items-center justify-between"
             [class.card-hi]="lose()" [class.card]="!lose()"
             [style.border-color]="lose() ? null : 'rgba(var(--gain-rgb),.45)'"
             [style.box-shadow]="lose() ? null : '0 18px 40px -22px rgba(var(--gain-rgb),.5)'">
          <span class="lbl" style="color:var(--text)">{{ lose() ? 'Total drop' : 'Total gain' }}</span>
          <span class="num text-[32px]" [style.color]="goalColor()" [style.text-shadow]="'0 0 18px ' + (lose() ? 'rgba(var(--accent-rgb),.6)' : 'rgba(var(--gain-rgb),.5)')">{{ lose() ? '−' : '+' }}{{ totalText() }} {{ state.displayUnit().toUpperCase() }}</span>
        </div>
      }

      @if (!state.valid()) {
        <p class="pad mt-2 text-[12.5px] font-semibold" style="color:var(--accent-light)">{{ invalidText() }}</p>
      }

      <div class="pad mt-4">
        <div class="flex justify-between items-baseline mb-2">
          <span class="lbl">Milestone rewards</span>
          @if (state.valid()) { <span class="text-[12px] text-mute font-semibold">1 reward every {{ lose() ? '' : '+' }}{{ perText() }} {{ state.displayUnit() }}</span> }
        </div>
        <div class="grid grid-cols-9 gap-[5px]">
          @for (n of counts; track n) {
            @let fits = state.fittingCounts().has(n);
            <button class="opt sm" [class.on]="state.checkpointCount() === n" [class.opacity-40]="!fits" [disabled]="!fits" (click)="state.checkpoints.set(n)">{{ n }}</button>
          }
        </div>
      </div>

      @if (lose() && state.valid()) {
        <div class="mx-5 mt-4 relative h-[60px]">
          <div class="absolute left-5 right-5 top-[17px] h-[2px]" [style.background]="theme.isNeon() ? 'linear-gradient(90deg,var(--accent-2),var(--violet),var(--accent))' : 'var(--s3)'"></div>
          <div class="absolute inset-x-0 top-0 flex justify-between">
            <div class="flex flex-col items-center flex-1 min-w-0">
              <div class="w-[30px] h-[30px] mt-[2px] rounded-full bg-s2 grid place-items-center" [style.border]="theme.isNeon() ? '1.5px solid var(--accent-2)' : '1px solid rgba(255,255,255,.2)'" [style.color]="theme.isNeon() ? 'var(--accent-2)' : null">
                <app-icon name="flag" [size]="14" />
              </div>
              <span class="num mt-1.5 text-mute" [style.font-size.px]="trackFont()">{{ state.start().toFixed(1) }}</span>
            </div>
            @for (v of state.track(); track $index; let last = $last) {
              <div class="flex flex-col items-center flex-1 min-w-0">
                @if (theme.isNeon()) {
                  <app-badge [tone]="last ? 'gold' : 'violet'" [icon]="last ? 'flag' : 'gift'" [size]="badgeSize()" [glowing]="last" />
                } @else if (last) {
                  <div [style.width.px]="badgeSize() + 2" [style.height.px]="badgeSize() + 2" class="rounded-full grid place-items-center text-white" style="background:var(--accent-grad);box-shadow:0 0 16px rgba(var(--accent-rgb),.8)"><app-icon name="target" [size]="14" /></div>
                } @else {
                  <div [style.width.px]="badgeSize() + 2" [style.height.px]="badgeSize() + 2" class="rounded-full bg-s2 grid place-items-center text-gold border border-[rgba(var(--gold-rgb),.5)]"><app-icon name="gift" [size]="14" /></div>
                }
                @if (state.checkpointCount() <= 6 || last) {
                  <span class="num mt-1" [style.font-size.px]="trackFont()" [style.color]="last ? (theme.isNeon() ? 'var(--gold)' : 'var(--accent)') : null">{{ v.toFixed(1) }}</span>
                }
              </div>
            }
          </div>
        </div>
      }

      <div class="mt-auto pad pt-6 pb-[calc(32px+env(safe-area-inset-bottom))]">
        <button class="btn btn-primary" [disabled]="!state.valid()" (click)="next()">Continue</button>
      </div>
    </div>

    @if (picker()) {
      <div class="sheet-backdrop" (click)="picker.set(false)"></div>
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="grabber"></div>
        <div class="h text-[26px] mt-4">{{ state.metric() === 'STRENGTH' ? 'Pick a lift' : 'Pick a measurement' }}</div>
        <div class="mt-4 space-y-2">
          @for (o of labelOptions(); track o) {
            <button class="pick w-full" [class.on]="state.metricLabel() === o" (click)="pickLabel(o)"><app-icon [name]="metricIcon()" />{{ o }}</button>
          }
        </div>
      </div>
    }
  `
})
export class GoalPage {
  protected readonly theme = inject(ThemeService);
  protected readonly state = inject(OnboardingState);
  private readonly router = inject(Router);

  protected readonly picker = signal(false);
  protected readonly neonSize = window.innerWidth < 370 ? 25 : 28;
  protected readonly counts = CHECKPOINT_COUNTS;
  protected readonly rows = ['start', 'goal'] as const;
  protected readonly metrics: { key: Metric; label: string; icon: string }[] = [
    { key: 'WEIGHT', label: 'Weight', icon: 'scale' },
    { key: 'STRENGTH', label: 'Strength', icon: 'gym' },
    { key: 'SIZE', label: 'Size', icon: 'ruler' }
  ];

  protected readonly lose = computed(() => this.state.path() === 'LOSE');
  protected readonly hasLabel = computed(() => !this.lose() && this.state.metric() !== 'WEIGHT');
  protected readonly fixed = computed(() => this.lose() || this.state.metric() === 'WEIGHT');
  protected readonly goalColor = computed(() => (this.lose() ? 'var(--accent)' : 'var(--gain)'));
  protected readonly metricIcon = computed(() => (this.state.metric() === 'SIZE' ? 'ruler' : 'gym'));
  protected readonly labelOptions = computed(() => (this.state.metric() === 'STRENGTH' ? LIFTS : SIZES));
  protected readonly totalText = computed(() => (this.fixed() ? this.state.total().toFixed(1) : trimNum(this.state.total(), this.state.precision())));
  protected readonly perText = computed(() => trimNum(this.state.perCheckpoint(), this.state.precision()));
  protected readonly badgeSize = computed(() => (this.state.checkpointCount() <= 5 ? 30 : this.state.checkpointCount() <= 7 ? 26 : 22));
  protected readonly trackFont = computed(() => (this.state.checkpointCount() <= 4 ? 12.5 : this.state.checkpointCount() <= 6 ? 11 : 10.5));
  protected readonly shortLabel = computed(() => {
    const l = this.state.metricLabel();
    return this.hasLabel() && l ? l.split(' ')[0].toLowerCase() : null;
  });
  protected readonly subtitle = computed(() => {
    if (!this.lose()) return 'Pick what your milestone rewards track.';
    return this.theme.isNeon() ? 'Where you are vs where you\'re heading.' : 'We split it into milestones, each with a reward you pick.';
  });
  protected readonly invalidText = computed(() => {
    const unit = this.state.displayUnit();
    switch (this.state.problem()) {
      case 'range': return `Pick values between ${this.state.bounds().min} and ${this.state.bounds().max} ${unit}.`;
      case 'close': return `Your goal is too close to where you are now for a milestone. Make it at least ${this.state.minDistance()} ${unit} away.`;
      default: return this.lose() ? 'Your goal has to be below your current weight.' : 'Your goal has to be above where you are now.';
    }
  });

  protected rowLabel(row: 'start' | 'goal'): string {
    const noun = this.lose() || this.state.metric() === 'WEIGHT' ? 'weight' : this.state.metric() === 'STRENGTH' ? 'lift' : 'size';
    return `${row === 'start' ? 'Current' : 'Goal'} ${noun}`;
  }

  protected set(which: 'start' | 'goal', raw: string): void {
    this.state.set(which, raw);
  }

  protected pickLabel(label: string): void {
    this.state.metricLabel.set(label);
    this.picker.set(false);
  }

  protected next(): void {
    if (this.state.valid()) void this.router.navigateByUrl('/onboarding/quests');
  }
}
