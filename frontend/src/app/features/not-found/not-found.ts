import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Badge } from '../../ui/badge';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Badge],
  template: `
    <div class="screen pad items-center justify-center text-center">
      <app-badge tone="off" [size]="68" icon="route" />
      <div class="h text-[30px] mt-5">Not found</div>
      <p class="text-[14px] text-mute mt-2 max-w-[300px]">This page doesn't exist or was removed.</p>
      <a class="btn btn-ghost mt-6 max-w-[280px]" routerLink="/today" replaceUrl>Go home</a>
    </div>
  `
})
export class NotFoundPage { }
