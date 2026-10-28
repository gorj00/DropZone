import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { apiError } from '../../core/api/errors';
import { AdminUser } from '../../core/api/models';
import { PromptService } from '../../core/prompt.service';
import { SessionStore } from '../../core/session.store';
import { ToastService } from '../../core/toast.service';
import { Avatar } from '../../ui/bits';
import { Badge } from '../../ui/badge';
import { Icon } from '../../ui/icon';
import { ReportEntries, day } from './report-detail';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, Badge, Icon, ReportEntries],
  template: `
    <div class="screen">
      <div class="pad pt-3 flex items-center gap-3">
        <button class="circ" (click)="back()" aria-label="Back"><app-icon name="back" /></button>
        <div class="h text-[26px] flex-1">User</div>
      </div>

      @if (missing()) {
        <div class="pad flex-1 flex flex-col items-center justify-center text-center pb-24">
          <app-badge tone="off" [size]="68" icon="user" />
          <div class="h text-[26px] mt-5">User not found</div>
          <p class="text-[14px] text-mute mt-2">The account may have been deleted.</p>
        </div>
      } @else if (failed()) {
        <div class="pad flex-1 flex flex-col items-center justify-center text-center pb-24">
          <div class="font-bold text-[15px]">Couldn't load the user</div>
          <button class="btn btn-ghost btn-sm mx-auto mt-3" (click)="load()"><app-icon name="refresh" />Retry</button>
        </div>
      } @else if (user(); as a) {
        <div class="mx-5 mt-4 card p-4">
          <div class="flex items-center gap-3">
            <app-avatar [url]="a.user.avatarUrl" [name]="a.user.displayName" [size]="60" />
            <div class="flex-1 min-w-0">
              <div class="font-bold text-[16px] truncate">{{ a.user.displayName }}</div>
              <div class="text-[12.5px] text-mute truncate">&#64;{{ a.user.handle }}</div>
            </div>
            @if (a.suspended) { <span class="chip !text-accent"><app-icon name="block" />SUSPENDED</span> }
          </div>
          @if (a.user.bio) { <p class="text-[13.5px] mt-3 whitespace-pre-line break-words">{{ a.user.bio }}</p> }
          <div class="mt-3 space-y-1 text-[13px]">
            <div class="flex gap-2"><span class="text-mute w-[92px] flex-none">E-mail</span><span class="truncate">{{ a.email }}</span></div>
            <div class="flex gap-2"><span class="text-mute w-[92px] flex-none">Joined</span><span>{{ day(a.createdAt) }}</span></div>
            <div class="flex gap-2"><span class="text-mute w-[92px] flex-none">Strikes</span><span class="num">{{ a.strikes }}</span></div>
            @if (a.suspendedAt) { <div class="flex gap-2"><span class="text-mute w-[92px] flex-none">Suspended</span><span>{{ day(a.suspendedAt) }}</span></div> }
          </div>
        </div>

        <div class="pad mt-5 lbl mb-2">Reports · {{ a.reports.length }}</div>
        <div class="mx-5"><app-report-entries [entries]="a.reports" [link]="true" /></div>

        <div class="mt-auto pad pt-6 pb-[calc(28px+env(safe-area-inset-bottom))] space-y-2">
          <button class="btn btn-ghost" [disabled]="busy()" (click)="resetProfile()"><app-icon name="refresh" />Reset profile</button>
          @if (!self()) {
            @if (a.suspended) {
              <button class="btn btn-ghost" [disabled]="busy()" (click)="unsuspend()"><app-icon name="check" />Unsuspend</button>
            } @else {
              <button class="btn btn-primary" [disabled]="busy()" (click)="suspend()"><app-icon name="block" />Suspend</button>
            }
          }
        </div>
      } @else {
        <div class="pad mt-4 space-y-3"><div class="skeleton h-[200px]"></div><div class="skeleton h-[120px]"></div></div>
      }
    </div>
  `
})
export class AdminUserPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly prompt = inject(PromptService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  readonly id = input.required<string>();

  protected readonly day = day;
  protected readonly user = signal<AdminUser | null>(null);
  protected readonly missing = signal(false);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly self = computed(() => this.id() === this.session.user()?.id);

  ngOnInit(): void {
    if (!this.session.user()?.admin) {
      void this.router.navigateByUrl('/settings', { replaceUrl: true });
      return;
    }
    void this.load();
  }

  protected async load(): Promise<void> {
    this.failed.set(false);
    try {
      this.user.set(await this.api.adminUser(this.id()));
    } catch (e) {
      if (apiError(e).status === 404) this.missing.set(true);
      else this.failed.set(true);
    }
  }

  protected async resetProfile(): Promise<void> {
    const ok = await this.prompt.confirm('Reset this profile?', 'The name, handle, bio and photo are replaced. The photo file is deleted.', 'Reset', 'Cancel');
    if (ok) await this.run(() => this.api.resetProfile(this.id()), 'Profile reset.');
  }

  protected async suspend(): Promise<void> {
    const ok = await this.prompt.confirm('Suspend this account?', 'They can no longer use DropZone, and their posts, comments and profile are hidden from everyone.', 'Suspend', 'Cancel');
    if (ok) await this.run(() => this.api.suspendUser(this.id()), 'Account suspended.');
  }

  protected async unsuspend(): Promise<void> {
    const ok = await this.prompt.confirm('Unsuspend this account?', 'They can use DropZone again and their content is shown again.', 'Unsuspend', 'Cancel');
    if (ok) await this.run(() => this.api.unsuspendUser(this.id()), 'Account unsuspended.');
  }

  protected back(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl('/admin/reports');
  }

  private async run(fn: () => Promise<AdminUser>, done: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      this.user.set(await fn());
      this.toast.show(done);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
