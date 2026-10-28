import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NotificationsStore } from '../core/social';
import { Icon } from './icon';

@Component({
  selector: 'app-bell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    <a class="circ relative" routerLink="/notifications" [attr.aria-label]="store.unread() ? store.unread() + ' new notifications' : 'Notifications'">
      <app-icon name="bell" />
      @if (store.unread() > 0) {
        <span class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-bold grid place-items-center shadow-[0_0_8px_var(--accent)]">{{ store.unread() > 9 ? '9+' : store.unread() }}</span>
      }
    </a>
  `
})
export class NotificationBell implements OnInit {
  protected readonly store = inject(NotificationsStore);

  ngOnInit(): void {
    void this.store.refresh();
  }
}
