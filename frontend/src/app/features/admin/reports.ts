import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ReportTarget, ReportedItem } from '../../core/api/models';
import { PromptService } from '../../core/prompt.service';
import { SessionStore } from '../../core/session.store';
import { ToastService } from '../../core/toast.service';
import { Avatar } from '../../ui/bits';
import { Icon } from '../../ui/icon';
import { ago } from '../squad/in-view';

export const TARGET_NAMES: Record<ReportTarget, string> = { POST: 'Post', COMMENT: 'Comment', USER: 'User' };
export const IMAGE_CHECK_LABEL = 'Flagged by the image check';

export function reasonLabel(reason: string): string {
  return /^image check\b/i.test(reason) ? IMAGE_CHECK_LABEL : reason;
}

export function removeQuestion(type: ReportTarget): { title: string; message: string; yes: string } {
  switch (type) {
    case 'USER': return { title: 'Reset this profile?', message: 'The name, handle, bio and photo are replaced and the reports are closed.', yes: 'Reset' };
    case 'COMMENT': return { title: 'Remove this comment?', message: 'It will be taken down for everyone.', yes: 'Remove' };
    default: return { title: 'Remove this post?', message: 'It will be taken down for everyone, with its photos.', yes: 'Remove' };
  }
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, Icon],
  template: `
    <div class="screen">
      <div class="pad pt-3 flex items-center gap-3">
        <button class="circ" (click)="back()" aria-label="Back"><app-icon name="back" /></button>
        <div class="h text-[28px] flex-1">Reports</div>
        <button class="circ" (click)="load()" aria-label="Refresh"><app-icon name="refresh" /></button>
      </div>
      <div class="pad mt-4 mb-8 space-y-3">
        @for (r of items(); track r.targetType + r.targetId) {
          <div class="card p-3.5">
            <div class="flex items-center gap-2.5">
              @if (r.author; as a) { <app-avatar [url]="a.avatarUrl" [name]="a.displayName" [size]="34" /> }
              <div class="flex-1 min-w-0">
                <div class="font-bold text-[14px] truncate">{{ r.author?.displayName ?? 'Unknown user' }}</div>
                <div class="text-[12px] text-mute">{{ names[r.targetType] }} · {{ r.reportCount }} {{ r.reportCount === 1 ? 'report' : 'reports' }} · {{ ago(r.lastReportedAt) }}</div>
              </div>
              @if (r.hidden) { <span class="chip !text-accent"><app-icon name="eyeoff" />{{ r.targetType === 'USER' ? 'SUSPENDED' : 'HIDDEN' }}</span> }
            </div>
            <div class="flex gap-3 mt-3">
              @if (r.photoUrl) { <img class="w-[64px] h-[64px] rounded-[12px] object-cover flex-none" [src]="r.photoUrl" alt=""> }
              <p class="text-[13.5px] leading-snug flex-1 min-w-0 break-words">{{ r.preview }}</p>
            </div>
            @if (r.reasons.length) {
              <div class="flex flex-wrap gap-1.5 mt-2.5">
                @for (reason of r.reasons; track $index) { <span class="chip">{{ reasonLabel(reason) }}</span> }
              </div>
            }
            <div class="grid grid-cols-3 gap-2 mt-3">
              <a class="btn btn-ghost btn-sm" [routerLink]="['/admin/reports', r.targetType, r.targetId]">View</a>
              <button class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="restore(r)">{{ r.targetType === 'USER' ? 'Dismiss' : 'Restore' }}</button>
              <button class="btn btn-primary btn-sm" [disabled]="busy()" (click)="remove(r)">{{ r.targetType === 'USER' ? 'Reset' : 'Remove' }}</button>
            </div>
          </div>
        } @empty {
          @if (loading()) {
            <div class="skeleton h-[150px]"></div>
            <div class="skeleton h-[150px]"></div>
          } @else {
            <div class="card p-6 text-center">
              <span class="text-ok inline-flex"><app-icon name="check" [size]="28" /></span>
              <div class="font-bold text-[15px] mt-2">Nothing to review</div>
            </div>
          }
        }
      </div>
    </div>
  `
})
export class ReportsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly prompt = inject(PromptService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  protected readonly ago = ago;
  protected readonly names = TARGET_NAMES;
  protected readonly reasonLabel = reasonLabel;
  protected readonly items = signal<ReportedItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);

  ngOnInit(): void {
    if (!this.session.user()?.admin) {
      void this.router.navigateByUrl('/settings', { replaceUrl: true });
      return;
    }
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.items.set(await this.api.reportedItems());
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  protected async restore(r: ReportedItem): Promise<void> {
    await this.run(r, () => this.api.restoreReported(r.targetType, r.targetId), r.targetType === 'USER' ? 'Reports dismissed.' : 'Restored.');
  }

  protected async remove(r: ReportedItem): Promise<void> {
    const q = removeQuestion(r.targetType);
    const ok = await this.prompt.confirm(q.title, q.message, q.yes, 'Cancel');
    if (ok) await this.run(r, () => this.api.removeReported(r.targetType, r.targetId), r.targetType === 'USER' ? 'Profile reset.' : 'Removed.');
  }

  protected back(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl('/settings');
  }

  private async run(r: ReportedItem, fn: () => Promise<void>, done: string): Promise<void> {
    this.busy.set(true);
    try {
      await fn();
      this.items.update(list => list.filter(x => !(x.targetType === r.targetType && x.targetId === r.targetId)));
      this.toast.show(done);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
