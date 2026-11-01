import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api';
import { ago, when } from '../core/format';
import type { AdminReport, ReportTarget } from '../core/models';
import { Toast } from '../core/toast';
import { Avatar, Loading } from '../ui/bits';
import { TARGET_NAMES, reasonLabel, removeQuestion } from './reports';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, Loading],
  template: `
    <a routerLink="/reports" class="text-[12.5px] text-accent2 font-semibold">← Reports</a>

    @if (missing()) {
      <div class="card p-8 mt-4 text-center"><div class="h text-[24px]">Already gone</div><p class="text-mute mt-2">This item was deleted or the reports were closed.</p></div>
    } @else if (report(); as r) {
      <div class="flex items-center gap-4 mt-3">
        <h1 class="h text-[30px] flex-1">{{ names[r.targetType] }} report</h1>
        <span class="tag tag-plain">{{ r.reportCount }} {{ r.reportCount === 1 ? 'report' : 'reports' }}</span>
        @if (r.hidden) { <span class="tag tag-danger">{{ r.targetType === 'USER' ? 'Suspended' : 'Hidden' }}</span> }
        <button class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="restore()">{{ r.targetType === 'USER' ? 'Dismiss' : 'Restore' }}</button>
        <button class="btn btn-danger btn-sm" [disabled]="busy()" (click)="remove()">{{ r.targetType === 'USER' ? 'Reset profile' : 'Remove' }}</button>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-5">
        <div class="xl:col-span-2 space-y-4">
          @if (r.user; as a) {
            <div class="card p-5">
              <div class="flex items-center gap-3">
                <adm-avatar [url]="a.user.avatarUrl" [name]="a.user.displayName" [size]="56" />
                <div class="flex-1 min-w-0"><div class="font-bold text-[16px] truncate">{{ a.user.displayName }}</div><div class="text-mute">&#64;{{ a.user.handle }} · {{ a.email }}</div></div>
                <a class="btn btn-ghost btn-sm" [routerLink]="['/users', a.user.id]">Manage user</a>
              </div>
              @if (a.user.bio) { <p class="mt-3 whitespace-pre-line break-words">{{ a.user.bio }}</p> }
              @if (a.user.avatarUrl) { <img class="block max-h-[360px] rounded-[12px] mt-3" [src]="a.user.avatarUrl" alt="Profile photo"> }
            </div>
          }
          @if (r.comment; as c) {
            <div class="card p-5">
              <div class="flex items-center gap-3">
                @if (c.user; as u) { <adm-avatar [url]="u.avatarUrl" [name]="u.displayName" [size]="32" /> }
                <div class="flex-1 min-w-0"><div class="font-bold">{{ c.user?.displayName ?? 'Unknown user' }}</div><div class="text-[12px] text-mute">{{ when(c.createdAt) }}</div></div>
                @if (c.user; as u) { <a class="btn btn-ghost btn-sm" [routerLink]="['/users', u.id]">User</a> }
              </div>
              <p class="mt-3 whitespace-pre-line break-words text-[14px]">{{ c.body }}</p>
            </div>
          }
          @if (r.post; as p) {
            @if (r.comment) { <div class="lbl">On this post</div> }
            <div class="card overflow-hidden">
              <div class="flex items-center gap-3 p-5">
                @if (p.user; as u) { <adm-avatar [url]="u.avatarUrl" [name]="u.displayName" [size]="32" /> }
                <div class="flex-1 min-w-0"><div class="font-bold">{{ p.user?.displayName ?? 'Unknown user' }}</div><div class="text-[12px] text-mute">{{ p.title }} · {{ when(p.createdAt) }}</div></div>
                <span class="tag tag-plain">{{ p.isPublic ? 'Public' : 'Friends' }}</span>
                @if (p.hidden) { <span class="tag tag-danger">Hidden</span> }
                @if (p.proofStatus) { <span class="tag tag-plain">Proof {{ p.proofStatus }}</span> }
                @if (p.user; as u) { <a class="btn btn-ghost btn-sm" [routerLink]="['/users', u.id]">User</a> }
              </div>
              @if (p.subtitle) { <p class="px-5 pb-4">{{ p.subtitle }}</p> }
              <div class="flex flex-wrap gap-3 px-5 pb-5">
                @for (url of p.photos; track url) { <a [href]="url" target="_blank"><img class="max-h-[320px] rounded-[12px] bg-s2" [src]="url" alt=""></a> } @empty { <span class="text-mute text-[13px]">No photos.</span> }
              </div>
              @if (p.transformation; as t) {
                <div class="px-5 pb-4 text-[13px] text-mute">Before: {{ t.beforeCaption || 'no caption' }} · After: {{ t.afterCaption || 'no caption' }}</div>
              }
              @if (p.mlLabels.length || p.mlText) {
                <div class="px-5 pb-5 border-t border-line pt-4">
                  <div class="lbl">AI saw</div>
                  <div class="flex flex-wrap gap-1.5 mt-2">@for (m of p.mlLabels; track m) { <span class="chip">{{ m }}</span> }</div>
                  @if (p.mlText) { <p class="text-[12.5px] text-mute mt-2 whitespace-pre-line break-words">{{ p.mlText }}</p> }
                </div>
              }
            </div>
          }
        </div>

        <div class="card p-5 self-start">
          <div class="lbl">Reports</div>
          <div class="mt-2 divide-y divide-line">
            @for (e of r.reports; track $index) {
              <div class="py-2.5 text-[13px]">
                <div class="flex items-center gap-2">
                  @if (e.reporter; as u) {
                    <a class="flex items-center gap-2 font-semibold" [routerLink]="['/users', u.id]"><adm-avatar [url]="u.avatarUrl" [name]="u.displayName" [size]="22" />{{ u.displayName }}</a>
                  } @else { <span class="font-semibold text-accent2">Image check</span> }
                  <span class="ml-auto text-mute">{{ ago(e.createdAt) }}</span>
                </div>
                <div class="text-mute mt-1">{{ e.reason ? reasonLabel(e.reason) : 'No reason' }}{{ e.reason && reasonLabel(e.reason) !== e.reason ? ' · ' + e.reason : '' }}</div>
              </div>
            } @empty { <div class="py-2 text-[13px] text-mute">No reports.</div> }
          </div>
        </div>
      </div>
    } @else {
      <div class="mt-4"><adm-loading /></div>
    }
  `
})
export class ReportPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);

  readonly type = input.required<ReportTarget>();
  readonly id = input.required<string>();
  protected readonly report = signal<AdminReport | null>(null);
  protected readonly missing = signal(false);
  protected readonly busy = signal(false);
  protected readonly names = TARGET_NAMES;
  protected readonly reasonLabel = reasonLabel;
  protected readonly ago = ago;
  protected readonly when = when;

  ngOnInit(): void {
    void this.load();
  }

  protected async restore(): Promise<void> {
    const r = this.report();
    if (r) await this.run(() => this.api.restoreReported(r.targetType, r.targetId), r.targetType === 'USER' ? 'Reports dismissed.' : 'Restored.');
  }

  protected async remove(): Promise<void> {
    const r = this.report();
    if (r && confirm(removeQuestion(r.targetType))) {
      await this.run(() => this.api.removeReported(r.targetType, r.targetId), r.targetType === 'USER' ? 'Profile reset.' : 'Removed.');
    }
  }

  private async load(): Promise<void> {
    if (!(this.type() in TARGET_NAMES)) {
      this.missing.set(true);
      return;
    }
    try {
      this.report.set(await this.api.adminReport(this.type(), this.id()));
    } catch (e) {
      if ((e as { status?: number }).status === 404) this.missing.set(true);
      else this.toast.error(e);
    }
  }

  private async run(fn: () => Promise<void>, done: string): Promise<void> {
    this.busy.set(true);
    try {
      await fn();
      this.toast.show(done);
      await this.router.navigateByUrl('/reports');
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
