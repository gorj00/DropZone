import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Goal } from '../../core/api/models';
import { ThemeService } from '../../core/theme.service';
import { UnitsService } from '../../core/units';
import { Badge } from '../../ui/badge';
import { Icon } from '../../ui/icon';
import { delta, verb } from './journey.util';

@Component({
  selector: 'app-goal-reached',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Badge, Icon],
  styles: `
    .confetti { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    .confetti i { position: absolute; width: 4px; height: 12px; border-radius: 2px; animation: pop .7s cubic-bezier(.2, 1.4, .4, 1) both, sway var(--dur) ease-in-out infinite alternate; }
    .confetti i.round { width: 6px; height: 6px; border-radius: 50%; }
    .gtext { background: linear-gradient(180deg, #fff 30%, #ffc96b); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 22px rgba(255, 150, 40, .45)); }
    @keyframes pop { from { opacity: 0; translate: 0 30px; scale: .2; } }
    @keyframes sway { from { translate: -3px -5px; } to { translate: 3px 6px; } }
    @media (prefers-reduced-motion: reduce) { .confetti i { animation: none; } }
  `,
  template: `
    @let g = goal();
    <div class="relative mx-5 mt-4 card-gold overflow-hidden px-5 pt-6 pb-5 text-center" data-test="goal-reached"
         [style.background]="neon() ? 'radial-gradient(circle at 50% 20%, rgba(var(--accent-rgb), .3), transparent 60%), var(--s1)' : 'radial-gradient(circle at 50% 20%, rgba(255, 150, 40, .28), transparent 60%), var(--s1)'">
      <div class="confetti" aria-hidden="true">
        @for (p of pieces(); track $index) {
          <i [class.round]="p.round" [style.left.%]="p.left" [style.top.%]="p.top" [style.background]="p.color" [style.rotate.deg]="p.rot" [style.--dur]="p.dur + 's'" [style.animation-delay]="p.delay * 0.3 + 's, ' + p.delay + 's'"></i>
        }
      </div>
      <div class="relative">
        <app-badge tone="gold" icon="trophy" [size]="70" [glowing]="true" />
        <div class="lbl text-ok mt-3" style="letter-spacing:.3em">Final milestone cleared</div>
        <div class="h text-[46px] leading-none mt-2 gtext">Goal reached</div>
        <div class="num text-[34px] leading-none mt-3 text-ok uppercase">{{ total() }}</div>
        <p class="text-[13.5px] text-mute mt-1.5 leading-snug">{{ verbText() }} from {{ u.amount(g.startValue, g.unit) }} to {{ u.amount(g.currentValue, g.unit) }}. Keep the habit going with a new goal.</p>
        <a class="btn btn-primary mt-4" routerLink="/goal/new" data-test="new-goal"><app-icon name="flag" />Set a new goal</a>
      </div>
    </div>
  `
})
export class GoalReached {
  private readonly theme = inject(ThemeService);
  protected readonly u = inject(UnitsService);

  readonly goal = input.required<Goal>();

  protected readonly neon = computed(() => this.theme.theme() === 'NEON');
  protected readonly total = computed(() => delta(this.goal(), Math.abs(this.goal().currentValue - this.goal().startValue), this.u.units()));
  protected readonly verbText = computed(() => (verb(this.goal()) === 'dropped' ? 'You dropped' : 'You gained'));
  protected readonly pieces = computed(() => {
    let s = this.neon() ? 23 : 7;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const colors = this.neon() ? ['#ff2e7e', '#3dffb5', '#ffd34d', '#ffffff', '#3df0ff', '#8b5cff'] : ['#ff5a1f', '#c6ff3a', '#ffc53d', '#ffffff', '#5cc8ff'];
    return Array.from({ length: 22 }, (_, i) => ({
      left: rnd() * 96,
      top: 2 + rnd() * 60,
      color: colors[i % colors.length],
      rot: Math.round(rnd() * 360),
      round: rnd() > 0.7,
      delay: Math.round(rnd() * 20) / 10,
      dur: 1.6 + Math.round(rnd() * 20) / 10
    }));
  });
}
