import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ThemeService } from '../core/theme.service';
import { Icon } from './icon';

export type BadgeTone = 'gold' | 'accent' | 'violet' | 'cyan' | 'ok' | 'off';

const TONES: Record<BadgeTone, [string, string, string, string]> = {
  gold: ['#ffe680', '#cc8a00', '#fff1b8', '#2a1a00'],
  accent: ['var(--accent-light)', 'color-mix(in srgb, var(--accent) 70%, black)', 'rgba(255,255,255,.75)', '#fff'],
  violet: ['#a68aff', '#4a2bc4', '#cbbcff', '#fff'],
  cyan: ['#8af8ff', '#1b8fb8', '#d2fcff', '#fff'],
  ok: ['color-mix(in srgb, var(--ok) 60%, white)', 'color-mix(in srgb, var(--ok) 60%, black)', 'rgba(255,255,255,.7)', '#0b0c10'],
  off: ['var(--s3)', 'var(--s1)', 'var(--line)', 'var(--mute)']
};

let seq = 0;

@Component({
  selector: 'app-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { class: 'relative inline-grid place-items-center flex-none', '[style.width.px]': 'size()', '[style.height.px]': 'size() * 1.12', '[style.filter]': 'glow()' },
  template: `
    <svg class="absolute inset-0 w-full h-full overflow-visible" [attr.viewBox]="neon() ? '0 0 64 72' : '0 0 64 70'">
      <defs><linearGradient [attr.id]="gid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" [attr.stop-color]="c()[0]"/><stop offset="1" [attr.stop-color]="c()[1]"/></linearGradient></defs>
      @if (neon()) {
        <path d="M32 2 L60 12 V36 C60 53 47 64 32 70 C17 64 4 53 4 36 V12Z" [attr.fill]="'url(#' + gid + ')'" [attr.stroke]="c()[2]" stroke-width="2"/>
      } @else {
        <path d="M32 3 L59 18.5 V51.5 L32 67 L5 51.5 V18.5Z" [attr.fill]="'url(#' + gid + ')'" [attr.stroke]="c()[2]" stroke-width="1.5"/>
      }
    </svg>
    <span class="relative grid place-items-center" [style.color]="c()[3]" [style.margin-top.px]="neon() ? -size() * 0.06 : 0">
      @if (icon(); as i) { <app-icon [name]="i" [size]="size() * 0.42" /> }
      @if (text(); as t) { <span class="num" [style.font-size.px]="size() * 0.42">{{ t }}</span> }
    </span>
  `
})
export class Badge {
  private readonly theme = inject(ThemeService);
  readonly tone = input<BadgeTone>('gold');
  readonly size = input(48);
  readonly icon = input<string | null>(null);
  readonly text = input<string | null>(null);
  readonly glowing = input(false);
  protected readonly gid = `bdg${++seq}`;
  protected readonly neon = computed(() => this.theme.theme() === 'NEON');
  protected readonly c = computed(() => TONES[this.tone()]);
  protected readonly glow = computed(() => this.glowing() && this.tone() !== 'off' ? `drop-shadow(0 0 ${Math.round(this.size() / 4)}px ${this.tone() === 'gold' ? 'rgba(255,211,77,.6)' : 'rgba(var(--accent-rgb),.7)'})` : null);
}
