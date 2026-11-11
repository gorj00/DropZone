import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STORE } from '../../core/platform';
import { ThemeService } from '../../core/theme.service';
import { Badge } from '../../ui/badge';
import { Icon } from '../../ui/icon';

@Component({
  selector: 'app-pro-lock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Badge, Icon],
  template: `
    <div [class]="theme.isNeon() ? 'tcard' : 'card-gold'" class="shadow-[0_30px_60px_-20px_rgba(0,0,0,.85)]" [style.border-color]="theme.isNeon() ? 'rgba(var(--gold-rgb),.45)' : null">
      @if (theme.isNeon()) {
        <div class="strip gold"><span>{{ section() }}</span><span class="flex items-center gap-1"><app-icon name="crown" [size]="13" />PRO</span></div>
      }
      <div class="p-4">
        <div class="flex items-center gap-3">
          <app-badge tone="gold" [size]="48" [icon]="icon()" [glowing]="true" />
          <div>
            <div class="h text-[24px] [[data-theme=stealth]_&]:text-[28px]">{{ title() }}</div>
            <div class="text-[12.5px] text-mute mt-1">{{ text() }}</div>
          </div>
        </div>
        <div class="mt-4 space-y-2.5 text-[14px] font-semibold">
          @for (f of features(); track f) {
            <div class="flex items-center gap-2"><span class="text-ok inline-flex"><app-icon name="check" [size]="16" /></span>{{ f }}</div>
          }
        </div>
        <a class="btn btn-gold mt-4 !h-[50px]" routerLink="/paywall">Go PRO</a>
        <p class="text-center text-[12px] text-mute mt-2.5">Cancel anytime in {{ store.name }}</p>
      </div>
    </div>
  `
})
export class ProLock {
  protected readonly theme = inject(ThemeService);
  protected readonly store = STORE;
  readonly section = input('');
  readonly title = input.required<string>();
  readonly text = input('');
  readonly icon = input('lock');
  readonly features = input<string[]>([]);
}
