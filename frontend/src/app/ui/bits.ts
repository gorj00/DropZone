import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Location } from '@angular/common';
import { inject } from '@angular/core';
import { StatsDay } from '../core/api/models';
import { Icon } from './icon';

@Component({
  selector: 'app-pro-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { style: 'display:contents' },
  template: `<span class="tag tag-pro"><app-icon name="crown" />PRO</span>`
})
export class ProTag { }

@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:contents' },
  template: `
    @if (url()) {
      <img class="av" [src]="url()" alt="" [style.width.px]="size()" [style.height.px]="size()" [style.box-shadow]="ring() ? '0 0 0 2px ' + ring() : null">
    } @else {
      <span class="av" [style.width.px]="size()" [style.height.px]="size()" [style.font-size.px]="size() * 0.36" [style.background]="bg()" [style.box-shadow]="ring() ? '0 0 0 2px ' + ring() : null">{{ initials() }}</span>
    }
  `
})
export class Avatar {
  readonly url = input<string | null | undefined>(null);
  readonly name = input('');
  readonly size = input(38);
  readonly ring = input<string | null>(null);
  protected readonly initials = computed(() => this.name().split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?');
  protected readonly bg = computed(() => {
    const palettes = ['linear-gradient(135deg,#ff6fae,#8b5cf6)', 'linear-gradient(135deg,#5cc8ff,#2a74c9)', 'linear-gradient(135deg,#ff7b35,#ffc53d)', 'linear-gradient(135deg,#3dffb5,#1b8f6a)', 'linear-gradient(135deg,#a68aff,#4a2bc4)'];
    let h = 0;
    for (const c of this.name()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return palettes[h % palettes.length];
  });
}

@Component({
  selector: 'app-step-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="pad flex items-center gap-3 h-[52px]">
      <button class="circ" (click)="back()" aria-label="Back"><app-icon name="back" /></button>
      <div class="flex-1 flex gap-1.5">
        @for (i of steps(); track i) { <i class="seg-p" [class.on]="i <= step()"></i> }
      </div>
      <span class="num text-mute text-[15px]">{{ step() }}/{{ total() }}</span>
    </div>
  `
})
export class StepBar {
  private readonly location = inject(Location);
  readonly step = input.required<number>();
  readonly total = input(5);
  readonly backClick = output<void>();
  protected readonly steps = computed(() => Array.from({ length: this.total() }, (_, i) => i + 1));
  protected back(): void {
    this.location.back();
    this.backClick.emit();
  }
}

@Component({
  selector: 'app-heatmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="hm-days"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
    <div class="hm mt-1.5" [class.hm-q]="kind() === 'quests'" [class.hm-s]="kind() === 'slips'">
      @for (c of cells(); track $index) {
        <i [class]="c.cls" [attr.role]="c.open ? 'button' : null" [attr.tabindex]="c.open ? 0 : null" [attr.aria-label]="c.date"
           (click)="c.open && dayClick.emit(c.date!)" (keydown.enter)="c.open && dayClick.emit(c.date!)">{{ c.day }}</i>
      }
    </div>
  `
})
export class Heatmap {
  readonly days = input.required<StatsDay[]>();
  readonly kind = input<'quests' | 'slips'>('quests');
  readonly dayClick = output<string>();
  protected readonly cells = computed(() => {
    const days = this.days();
    if (!days.length) return [];
    const blank = { cls: 'x', day: null, date: null, open: false };
    const first = new Date(`${days[0].date}T00:00:00`);
    const offset = (first.getDay() + 6) % 7;
    const out: { cls: string; day: number | null; date: string | null; open: boolean }[] = Array.from({ length: offset }, () => blank);
    for (const d of days) {
      const day = Number(d.date.slice(8, 10));
      if (d.future) { out.push({ cls: 'f', day, date: d.date, open: false }); continue; }
      const level = this.kind() === 'quests' ? d.questLevel : Math.min(4, d.slipUps);
      out.push({ cls: level > 0 ? `l${level}` : '', day, date: d.date, open: true });
    }
    while (out.length % 7) out.push(blank);
    return out;
  });
}
