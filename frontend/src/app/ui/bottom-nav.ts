import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Icon } from './icon';

@Component({
  selector: 'app-bottom-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, Icon],
  template: `
    <nav class="nav">
      @for (t of tabs; track t.path) {
        <a class="nav-i" [routerLink]="t.path" routerLinkActive="on"><app-icon [name]="t.icon" />{{ t.label }}</a>
      }
    </nav>
  `
})
export class BottomNav {
  protected readonly tabs = [
    { path: '/today', icon: 'target', label: 'Today' },
    { path: '/journey', icon: 'route', label: 'Journey' },
    { path: '/stats', icon: 'chart', label: 'Stats' },
    { path: '/squad', icon: 'users', label: 'Community' },
    { path: '/me', icon: 'user', label: 'Me' }
  ];
}
