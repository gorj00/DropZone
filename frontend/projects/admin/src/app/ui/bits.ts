import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { initials, plan } from '../core/format';
import type { UserRow } from '../core/models';

@Component({
  selector: 'adm-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (url()) {
      <img class="av" [style.width.px]="size()" [style.height.px]="size()" [src]="url()" alt="">
    } @else {
      <span class="av" [style.width.px]="size()" [style.height.px]="size()" [style.font-size.px]="size() * 0.38">{{ letters() }}</span>
    }
  `
})
export class Avatar {
  readonly url = input<string | null>(null);
  readonly name = input<string | null>(null);
  readonly size = input(32);
  protected readonly letters = computed(() => initials(this.name()));
}

@Component({
  selector: 'adm-plan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="tag" [class.tag-pro]="label() === 'PRO'" [class.tag-cyan]="label() === 'TRIAL'" [class.tag-plain]="label() === 'FREE'">{{ label() }}</span>`
})
export class PlanTag {
  readonly user = input.required<Pick<UserRow, 'subscribed' | 'trial'>>();
  protected readonly label = computed(() => plan(this.user()));
}

@Component({
  selector: 'adm-empty',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="card p-6 text-center text-mute font-semibold">{{ text() }}</div>`
})
export class Empty {
  readonly text = input('Nothing here.');
}

@Component({
  selector: 'adm-loading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="space-y-3"><div class="skeleton h-[120px]"></div><div class="skeleton h-[220px]"></div></div>`
})
export class Loading {
}
