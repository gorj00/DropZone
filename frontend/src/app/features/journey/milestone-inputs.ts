import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, model, untracked } from '@angular/core';
import { ownMilestonesError } from '../../core/plausibility';
import { Icon } from '../../ui/icon';

@Component({
  selector: 'app-milestone-inputs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="card divide-y divide-line">
      @for (t of texts(); track $index; let last = $last) {
        <label class="px-3.5 h-[48px] flex items-center gap-3">
          <span class="inline-flex" [class.text-gold]="!last" [class.text-accent]="last"><app-icon [name]="last ? 'flag' : 'gift'" [size]="16" /></span>
          <span class="flex-1 text-[14px] font-semibold">{{ last ? 'Goal' : 'Milestone ' + ($index + 1) }}</span>
          @if (last) {
            <span class="num text-[16px]">{{ t }} {{ unit() }}</span>
          } @else {
            <input class="field num !h-[36px] !w-[96px] !px-2.5 text-right text-[15px]" type="text" inputmode="decimal" [attr.aria-label]="'Milestone ' + ($index + 1)"
              [value]="t" (input)="edit($index, $any($event.target).value)">
            <span class="num text-[14px] text-mute w-6">{{ unit() }}</span>
          }
        </label>
      }
    </div>
    @if (error(); as e) {
      <p class="text-[12.5px] text-accent font-semibold mt-2">{{ e }}</p>
    } @else {
      <p class="text-[12px] text-mute mt-2">We spread these evenly. Change any milestone to set your own.</p>
    }
  `
})
export class MilestoneInputs {
  readonly planned = input.required<number[]>();
  readonly goal = input.required<number>();
  readonly start = input.required<number>();
  readonly lose = input.required<boolean>();
  readonly gap = input.required<number>();
  readonly unit = input.required<string>();
  readonly digits = input(1);
  readonly own = model<number[] | null>(null);

  private readonly base = computed(() => {
    const p = this.planned();
    return p.length ? [...p.slice(0, -1), this.goal()] : [];
  });

  protected readonly texts = linkedSignal({
    source: this.base,
    computation: (base: number[]) => (untracked(() => this.own()) ?? base).map(v => this.fmt(v))
  });

  protected readonly error = computed(() => {
    const values = this.own();
    return values ? ownMilestonesError(values, this.start(), this.lose(), this.gap(), v => `${this.fmt(v)} ${this.unit()}`) : null;
  });

  protected edit(index: number, raw: string): void {
    this.texts.update(list => list.map((t, i) => (i === index ? raw : t)));
    const values = this.texts().map((t, i) => (i === this.texts().length - 1 ? this.goal() : parseFloat(t.replace(',', '.'))));
    this.own.set(values);
  }

  private fmt(v: number): string {
    return Number.isFinite(v) ? v.toFixed(this.digits()) : '';
  }
}
