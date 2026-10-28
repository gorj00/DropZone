import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { People, UserSummary } from '../../core/api/models';
import { SocialActions } from '../../core/social';
import { Avatar, ProTag } from '../../ui/bits';
import { Icon } from '../../ui/icon';

@Component({
  selector: 'app-people-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, ProTag, Icon],
  template: `
    @if (!pro()) {
      <a class="flex items-center gap-3" routerLink="/paywall">
        <span class="stack opacity-60" aria-hidden="true">
          @for (i of [1, 2, 3]; track i) { <span class="av bg-s3" [style.width.px]="size()" [style.height.px]="size()"></span> }
        </span>
        <span class="flex-1 text-[13px] leading-tight"><b>Your community</b><span class="block text-mute">{{ text() }}</span></span>
        <app-pro-tag />
      </a>
    } @else if (people(); as p) {
      @if (p.count > 0) {
        <div class="flex items-center gap-3">
          <span class="stack">
            @for (u of p.users.slice(0, 3); track u.id) {
              <button class="rounded-full flex" [attr.aria-label]="u.displayName" (click)="menu(u)"><app-avatar [url]="u.avatarUrl" [name]="u.displayName" [size]="size()" /></button>
            }
          </span>
          <span class="flex-1 text-[13px] leading-tight"><b>{{ names() }}</b><span class="block text-mute">{{ text() }}</span></span>
          <app-pro-tag />
          @if (icon(); as i) { <span class="text-accent inline-flex"><app-icon [name]="i" [size]="18" /></span> }
        </div>
      }
    }
  `
})
export class PeopleRow {
  private readonly social = inject(SocialActions);

  readonly people = input<People | null>(null);
  readonly text = input.required<string>();
  readonly pro = input(false);
  readonly size = input(28);
  readonly icon = input<string | null>(null);

  protected readonly names = computed(() => {
    const p = this.people();
    if (!p) return '';
    const first = p.users.slice(0, 2).map(u => u.displayName.split(/\s+/)[0]);
    const rest = p.count - first.length;
    return first.join(', ') + (rest > 0 ? ` +${rest}` : '');
  });

  protected menu(user: UserSummary): void {
    void this.social.userMenu(user);
  }
}
