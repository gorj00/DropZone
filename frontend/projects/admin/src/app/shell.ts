import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Session } from './core/session';

@Component({
  selector: 'adm-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex min-h-dvh">
      <aside class="side">
        <a routerLink="/" class="flex items-center gap-2.5 px-2">
          <img src="favicon.ico" alt="" class="w-8 h-8 rounded-[9px]">
          <span class="h text-[18px] tracking-[.1em]">DROP<em class="not-italic text-accent">ZONE</em></span>
        </a>
        <div class="lbl px-2 mt-1">Backoffice</div>
        <nav class="mt-6 space-y-1">
          <a class="navlink" routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">Dashboard</a>
          <a class="navlink" routerLink="/users" routerLinkActive="on">Users</a>
          <a class="navlink" routerLink="/reports" routerLinkActive="on">Reports</a>
          <a class="navlink" routerLink="/jobs" routerLinkActive="on">Jobs</a>
          <a class="navlink" routerLink="/errors" routerLinkActive="on">Errors</a>
          <a class="navlink" routerLink="/billing" routerLinkActive="on">Billing</a>
        </nav>
        <div class="mt-auto px-2 pt-6 border-t border-line">
          <div class="text-[12.5px] text-mute truncate" [title]="session.user()?.email">{{ session.user()?.email }}</div>
          <button class="btn btn-ghost btn-sm mt-3 w-full" (click)="session.signOut()">Sign out</button>
        </div>
      </aside>
      <main class="flex-1 min-w-0 px-8 py-7 max-w-[1280px]">
        <router-outlet />
      </main>
    </div>
  `
})
export class Shell {
  protected readonly session = inject(Session);
}
