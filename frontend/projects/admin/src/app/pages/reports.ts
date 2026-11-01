import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api';
import { ago } from '../core/format';
import type { ReportTarget, ReportedItem } from '../core/models';
import { Toast } from '../core/toast';
import { Avatar, Empty, Loading } from '../ui/bits';

export const TARGET_NAMES: Record<ReportTarget, string> = { POST: 'Post', COMMENT: 'Comment', USER: 'User' };

export function reasonLabel(reason: string): string {
  return /^image check\b/i.test(reason) ? 'Flagged by the image check' : reason;
}

export function removeQuestion(type: ReportTarget): string {
  switch (type) {
    case 'USER': return 'Reset this profile? The name, handle, bio and photo are replaced and the reports are closed.';
    case 'COMMENT': return 'Remove this comment? It will be taken down for everyone.';
    default: return 'Remove this post? It will be taken down for everyone, with its photos.';
  }
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, Empty, Loading],
  template: `
    <div class="flex items-center gap-4">
      <h1 class="h text-[30px] flex-1">Reports</h1>
      <button class="btn btn-ghost btn-sm" (click)="load()" [disabled]="loading()">Refresh</button>
    </div>

    @if (items(); as list) {
      @if (list.length) {
        <div class="card mt-5 overflow-x-auto">
          <table class="tbl">
            <thead><tr><th>Item</th><th>Author</th><th>Reasons</th><th class="r">Reports</th><th>Last</th><th>State</th><th></th></tr></thead>
            <tbody>
              @for (r of list; track r.targetType + r.targetId) {
                <tr>
                  <td>
                    <div class="flex items-start gap-3">
                      @if (r.photoUrl) { <img class="photo" [src]="r.photoUrl" alt=""> }
                      <div class="min-w-0"><span class="tag tag-plain">{{ names[r.targetType] }}</span><p class="mt-1 text-[13px] break-words max-w-[420px]">{{ r.preview }}</p></div>
                    </div>
                  </td>
                  <td>
                    @if (r.author; as a) {
                      <a class="flex items-center gap-2" [routerLink]="['/users', a.id]"><adm-avatar [url]="a.avatarUrl" [name]="a.displayName" [size]="26" /><span class="font-semibold">{{ a.displayName }}</span></a>
                    } @else { <span class="text-mute">Unknown</span> }
                  </td>
                  <td><div class="flex flex-wrap gap-1">@for (reason of r.reasons; track $index) { <span class="chip">{{ reasonLabel(reason) }}</span> }</div></td>
                  <td class="r num">{{ r.reportCount }}</td>
                  <td class="text-mute whitespace-nowrap">{{ ago(r.lastReportedAt) }}</td>
                  <td>@if (r.hidden) { <span class="tag tag-danger">{{ r.targetType === 'USER' ? 'Suspended' : 'Hidden' }}</span> } @else { <span class="tag tag-ok">Visible</span> }</td>
                  <td>
                    <div class="flex gap-1.5 justify-end">
                      <a class="btn btn-ghost btn-sm" [routerLink]="['/reports', r.targetType, r.targetId]">View</a>
                      <button class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="restore(r)">{{ r.targetType === 'USER' ? 'Dismiss' : 'Restore' }}</button>
                      <button class="btn btn-danger btn-sm" [disabled]="busy()" (click)="remove(r)">{{ r.targetType === 'USER' ? 'Reset' : 'Remove' }}</button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="mt-5"><adm-empty text="Nothing to review." /></div>
      }
    } @else if (loading()) {
      <div class="mt-5"><adm-loading /></div>
    }
  `
})
export class ReportsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(Toast);

  protected readonly items = signal<ReportedItem[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly names = TARGET_NAMES;
  protected readonly reasonLabel = reasonLabel;
  protected readonly ago = ago;

  ngOnInit(): void {
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
    if (confirm(removeQuestion(r.targetType))) {
      await this.run(r, () => this.api.removeReported(r.targetType, r.targetId), r.targetType === 'USER' ? 'Profile reset.' : 'Removed.');
    }
  }

  private async run(r: ReportedItem, fn: () => Promise<void>, done: string): Promise<void> {
    this.busy.set(true);
    try {
      await fn();
      this.items.update(list => (list ?? []).filter(x => !(x.targetType === r.targetType && x.targetId === r.targetId)));
      this.toast.show(done);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
