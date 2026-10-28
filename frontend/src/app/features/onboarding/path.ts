import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Path } from '../../core/api/models';
import { ThemeService } from '../../core/theme.service';
import { StepBar } from '../../ui/bits';
import { BodyKind, Silhouette } from '../../ui/silhouette';
import { OnboardingState } from './onboarding.state';

interface PathCard {
  path: Path;
  title: string;
  text: string;
  tag: string;
  mark: string;
  from: BodyKind;
  to: BodyKind;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StepBar, Silhouette],
  host: {
    '[style.--gain]': "theme.isNeon() ? 'var(--accent-2)' : 'var(--ok)'",
    '[style.--gain-rgb]': "theme.isNeon() ? 'var(--accent-2-rgb)' : 'var(--ok-rgb)'"
  },
  template: `
    <div class="screen">
      <app-step-bar [step]="2" />
      <div class="pad mt-3">
        <div class="h text-[38px]">Choose your path</div>
        <p class="text-[14.5px] text-mute mt-1.5">Quests, milestones and rewards adapt to it.</p>
      </div>
      <div class="pad mt-5 space-y-3">
        @for (c of cards; track c.path) {
          @let on = state.path() === c.path;
          @let lose = c.path === 'LOSE';
          <button class="w-full text-left flex h-[200px] overflow-hidden"
                  [class.tcard]="!on || !lose" [class.card-hi]="on && lose"
                  [style.border]="on && !lose ? '1.5px solid var(--gain)' : null"
                  [style.box-shadow]="on && !lose ? '0 0 30px -10px rgba(var(--gain-rgb),.9)' : null"
                  (click)="state.setPath(c.path)">
            <div class="relative w-[132px] h-full flex-none"
                 [style.background]="'radial-gradient(circle at 50% 62%, rgba(' + (lose ? 'var(--accent-rgb)' : 'var(--gain-rgb)') + ',.28), transparent 70%), var(--bg)'">
              <svg class="absolute inset-0" width="132" height="200" viewBox="0 0 132 200">
                @if (theme.isNeon()) {
                  <g stroke="#8b5cff" stroke-opacity=".2"><path d="M0 172 H132 M0 184 H132 M0 196 H132"/></g>
                }
                <ellipse cx="34" cy="172" rx="26" ry="5.5" fill="var(--s1)" [attr.stroke]="theme.isNeon() ? (lose ? 'var(--accent-2)' : 'var(--violet)') : 'rgba(255,255,255,.18)'" stroke-opacity=".7"/>
                <ellipse cx="98" cy="172" rx="26" ry="5.5" fill="var(--s1)" [attr.stroke]="lose ? 'var(--accent)' : 'var(--gain)'"/>
                <path d="M61 112 l5 5 -5 5" fill="none" [attr.stroke]="lose ? 'var(--accent-light)' : 'var(--gain)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <text x="66" y="35" text-anchor="middle" class="h" font-size="27" [attr.fill]="lose ? 'var(--accent)' : 'var(--gain)'">{{ c.path === 'LOSE' ? '−' + (state.weightUnit() === 'LB' ? 'LB' : 'KG') : c.mark }}</text>
              </svg>
              <span class="absolute left-[10px] top-[66px]" [style.filter]="theme.isNeon() ? null : 'grayscale(1) brightness(1.1)'">
                <app-silhouette [kind]="c.from" tone="dim" [height]="104" [scan]="theme.isNeon()" [glow]="false" />
              </span>
              <span class="absolute left-[74px] top-[66px]">
                <app-silhouette [kind]="c.to" [tone]="lose ? 'accent' : (theme.isNeon() ? 'cyan' : 'ok')" [height]="104" />
              </span>
            </div>
            <div class="flex-1 p-4 flex flex-col">
              <div class="flex justify-between items-start">
                <span class="tag" [class.tag-accent]="lose" [class.tag-cyan]="!lose && theme.isNeon()" [class.tag-free]="!lose && !theme.isNeon()">{{ c.tag }}</span>
                <span class="radio" [class.on]="on"></span>
              </div>
              <div class="h text-[30px] mt-3" [innerHTML]="c.title"></div>
              <p class="text-[13px] text-mute mt-2 leading-snug">{{ c.text }}</p>
            </div>
          </button>
        }
      </div>
      <div class="mt-auto pad pt-6 pb-[calc(32px+env(safe-area-inset-bottom))]">
        <button class="btn btn-primary" (click)="next()">Continue</button>
      </div>
    </div>
  `
})
export class PathPage {
  protected readonly theme = inject(ThemeService);
  protected readonly state = inject(OnboardingState);
  private readonly router = inject(Router);

  protected readonly cards: PathCard[] = [
    { path: 'LOSE', title: 'Lose<br>weight', text: 'Drop weight with daily habits. Unlock a reward at every milestone.', tag: 'Most picked', mark: '−KG', from: 'now', to: 'goal' },
    { path: 'GAIN', title: 'Build<br>muscle', text: 'Gain size and strength. Track weight, lifts or body size.', tag: 'Bulk up', mark: '+PR', from: 'slim', to: 'buff' }
  ];

  protected next(): void {
    void this.router.navigateByUrl('/onboarding/goal');
  }
}
