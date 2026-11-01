import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../core/api';
import { ago, day } from '../core/format';
import type { UserPage } from '../core/models';
import { Toast } from '../core/toast';
import { Avatar, Empty, Loading, PlanTag } from '../ui/bits';

export const PAGE_SIZE = 50;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, PlanTag, Empty, Loading],
  template: `
    <div class="flex items-center gap-4">
      <h1 class="h text-[30px] flex-1">Users</h1>
      <input class="field w-[320px]" type="search" placeholder="Search e-mail, handle or name" [value]="q()" (input)="search(input.value)" #input>
    </div>

    @if (page(); as p) {
      <div class="text-[12.5px] text-mute mt-3">{{ p.total }} {{ p.total === 1 ? 'account' : 'accounts' }}</div>
      @if (p.items.length) {
        <div class="card mt-3 overflow-x-auto">
          <table class="tbl">
            <thead><tr><th>User</th><th>E-mail</th><th>Plan</th><th>Path</th><th>Joined</th><th>Last seen</th><th class="r">Streak</th><th>Flags</th></tr></thead>
            <tbody>
              @for (u of p.items; track u.id) {
                <tr class="row" (click)="open(u.id)">
                  <td>
                    <div class="flex items-center gap-2.5">
                      <adm-avatar [url]="u.avatarUrl" [name]="u.displayName" [size]="30" />
                      <div class="min-w-0"><div class="font-bold truncate">{{ u.displayName }}</div><div class="text-[12px] text-mute">&#64;{{ u.handle }}</div></div>
                    </div>
                  </td>
                  <td class="text-mute">{{ u.email }}</td>
                  <td><adm-plan [user]="u" /></td>
                  <td class="text-mute">{{ u.path ?? '—' }}</td>
                  <td class="text-mute whitespace-nowrap">{{ day(u.createdAt) }}</td>
                  <td class="text-mute whitespace-nowrap">{{ ago(u.lastSeenAt) }}</td>
                  <td class="r num">{{ u.streak }}</td>
                  <td>
                    <div class="flex flex-wrap gap-1">
                      @if (u.admin) { <span class="tag tag-accent">Admin</span> }
                      @if (!u.onboarded) { <span class="tag tag-plain">Not onboarded</span> }
                      @if (u.suspended) { <span class="tag tag-danger">Suspended</span> }
                      @if (u.strikes > 0) { <span class="tag tag-plain">{{ u.strikes }} strike{{ u.strikes === 1 ? '' : 's' }}</span> }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (pages() > 1) {
          <div class="flex items-center justify-end gap-3 mt-3 text-[12.5px] text-mute">
            <span>Page {{ pageIndex() + 1 }} of {{ pages() }}</span>
            <button class="btn btn-ghost btn-sm" [disabled]="pageIndex() === 0" (click)="go(pageIndex() - 1)">Previous</button>
            <button class="btn btn-ghost btn-sm" [disabled]="pageIndex() + 1 >= pages()" (click)="go(pageIndex() + 1)">Next</button>
          </div>
        }
      } @else {
        <div class="mt-3"><adm-empty text="No accounts match." /></div>
      }
    } @else if (loading()) {
      <div class="mt-6"><adm-loading /></div>
    }
  `
})
export class UsersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected readonly q = signal('');
  protected readonly pageIndex = signal(0);
  protected readonly page = signal<UserPage | null>(null);
  protected readonly loading = signal(true);
  protected readonly pages = computed(() => Math.ceil((this.page()?.total ?? 0) / PAGE_SIZE));
  protected readonly ago = ago;
  protected readonly day = day;

  ngOnInit(): void {
    void this.load();
  }

  protected search(value: string): void {
    this.q.set(value);
    this.pageIndex.set(0);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(), 250);
  }

  protected go(index: number): void {
    this.pageIndex.set(index);
    void this.load();
  }

  protected open(id: string): void {
    void this.router.navigate(['/users', id]);
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.page.set(await this.api.users(this.q(), this.pageIndex(), PAGE_SIZE));
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.loading.set(false);
    }
  }
}
