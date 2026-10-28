import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { apiError } from '../../core/api/errors';
import { AdminPost, AdminReport, ReportEntry, ReportTarget } from '../../core/api/models';
import { samePhoto } from '../../core/photo-links';
import { PromptService } from '../../core/prompt.service';
import { SessionStore } from '../../core/session.store';
import { ToastService } from '../../core/toast.service';
import { Avatar } from '../../ui/bits';
import { Badge } from '../../ui/badge';
import { Icon } from '../../ui/icon';
import { ago } from '../squad/in-view';
import { IMAGE_CHECK_LABEL, TARGET_NAMES, removeQuestion } from './reports';

export function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

@Component({
  selector: 'app-report-entries',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, Icon],
  template: `
    <div class="card divide-y divide-line">
      @for (r of entries(); track $index) {
        <a class="flex items-center gap-3 px-3.5 py-2.5" [routerLink]="link() ? ['/admin/reports', r.targetType, r.targetId] : null">
          @if (r.reporter; as u) { <app-avatar [url]="u.avatarUrl" [name]="u.displayName" [size]="30" /> } @else { <span class="av bg-s2 text-accent2 w-[30px] h-[30px]"><app-icon name="ai" [size]="15" /></span> }
          <span class="flex-1 min-w-0">
            <span class="block font-semibold text-[13.5px] truncate">{{ r.reporter?.displayName ?? imageCheck }}</span>
            <span class="block text-[12px] text-mute truncate">{{ link() ? names[r.targetType] + ' · ' : '' }}{{ r.reason ?? 'No reason' }}</span>
          </span>
          <span class="text-[11.5px] text-mute flex-none">{{ ago(r.createdAt) }}</span>
        </a>
      } @empty {
        <div class="px-3.5 py-4 text-[13px] text-mute">No reports.</div>
      }
    </div>
  `
})
export class ReportEntries {
  readonly entries = input.required<ReportEntry[]>();
  readonly link = input(false);
  protected readonly names = TARGET_NAMES;
  protected readonly imageCheck = IMAGE_CHECK_LABEL;
  protected readonly ago = ago;
}

@Component({
  selector: 'app-admin-post',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, Icon],
  template: `
    @let p = post();
    <div class="card overflow-hidden">
      <div class="flex items-center gap-2.5 px-3.5 h-[56px]">
        @if (p.user; as u) { <app-avatar [url]="u.avatarUrl" [name]="u.displayName" [size]="34" /> }
        <div class="flex-1 min-w-0">
          <div class="font-bold text-[14px] truncate">{{ p.user?.displayName ?? 'Unknown user' }}</div>
          <div class="text-[12px] text-mute truncate">{{ p.title }} · {{ day(p.createdAt) }}</div>
        </div>
        @if (p.user; as u) { <a class="chip" [routerLink]="['/admin/users', u.id]"><app-icon name="user" />User</a> }
      </div>
      <div class="flex flex-wrap gap-1.5 px-3.5 pb-3">
        <span class="chip">{{ p.isPublic ? 'PUBLIC' : 'FRIENDS' }}</span>
        @if (p.hidden) { <span class="chip !text-accent"><app-icon name="eyeoff" />HIDDEN</span> }
        @if (p.proofStatus) { <span class="chip">PROOF {{ p.proofStatus }}</span> }
      </div>
      @if (p.subtitle) { <p class="px-3.5 pb-3 text-[13.5px]">{{ p.subtitle }}</p> }
      @for (url of p.photos; track url; let i = $index) {
        <div class="bg-s2 border-t border-line">
          @if (caption(url); as c) { <div class="px-3.5 pt-2 lbl">{{ c }}</div> }
          <img class="block w-full max-h-[420px] object-contain" [src]="url" [alt]="'Photo ' + (i + 1)">
        </div>
      } @empty {
        <p class="px-3.5 pb-3 text-[12.5px] text-mute">No photos.</p>
      }
      @if (p.transformation; as t) {
        <div class="px-3.5 py-3 border-t border-line space-y-1.5 text-[13.5px]">
          <div><span class="lbl mr-2">Before</span>{{ t.beforeCaption || 'No caption' }}</div>
          <div><span class="lbl mr-2">After</span>{{ t.afterCaption || 'No caption' }}</div>
        </div>
      }
      @if (p.mlLabels.length || p.mlText) {
        <div class="px-3.5 py-3 border-t border-line">
          <div class="lbl">AI saw</div>
          @if (p.mlLabels.length) {
            <div class="flex flex-wrap gap-1.5 mt-2">@for (m of p.mlLabels; track m) { <span class="chip">{{ m }}</span> }</div>
          }
          @if (p.mlText) { <p class="text-[12.5px] text-mute mt-2 whitespace-pre-line break-words">{{ p.mlText }}</p> }
        </div>
      }
    </div>
  `
})
export class AdminPostView {
  readonly post = input.required<AdminPost>();
  protected readonly day = day;

  protected caption(url: string): string | null {
    const t = this.post().transformation;
    if (!t) return null;
    if (samePhoto(url, t.beforeUrl)) return 'Before';
    if (samePhoto(url, t.afterUrl)) return 'After';
    return null;
  }
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, Badge, Icon, ReportEntries, AdminPostView],
  template: `
    <div class="screen">
      <div class="pad pt-3 flex items-center gap-3">
        <button class="circ" (click)="back()" aria-label="Back"><app-icon name="back" /></button>
        <div class="h text-[26px] flex-1 truncate">{{ names[type()] ?? 'Report' }} report</div>
      </div>

      @if (missing()) {
        <div class="pad flex-1 flex flex-col items-center justify-center text-center pb-24">
          <app-badge tone="off" [size]="68" icon="check" />
          <div class="h text-[26px] mt-5">Already gone</div>
          <p class="text-[14px] text-mute mt-2">This item was deleted or the reports were closed.</p>
          <a class="btn btn-ghost mt-6 max-w-[280px]" routerLink="/admin/reports">Back to reports</a>
        </div>
      } @else if (failed()) {
        <div class="pad flex-1 flex flex-col items-center justify-center text-center pb-24">
          <div class="font-bold text-[15px]">Couldn't load the report</div>
          <button class="btn btn-ghost btn-sm mx-auto mt-3" (click)="load()"><app-icon name="refresh" />Retry</button>
        </div>
      } @else if (report(); as r) {
        <div class="pad mt-3 flex flex-wrap gap-1.5">
          <span class="chip">{{ r.reportCount }} {{ r.reportCount === 1 ? 'REPORT' : 'REPORTS' }}</span>
          @if (r.hidden) { <span class="chip !text-accent"><app-icon name="eyeoff" />{{ r.targetType === 'USER' ? 'SUSPENDED' : 'HIDDEN' }}</span> }
        </div>

        @if (r.user; as a) {
          <div class="mx-5 mt-3 card p-4">
            <div class="flex items-center gap-3">
              <app-avatar [url]="a.user.avatarUrl" [name]="a.user.displayName" [size]="56" />
              <div class="flex-1 min-w-0">
                <div class="font-bold text-[15px] truncate">{{ a.user.displayName }}</div>
                <div class="text-[12.5px] text-mute truncate">&#64;{{ a.user.handle }}</div>
              </div>
            </div>
            @if (a.user.bio) { <p class="text-[13.5px] mt-3 whitespace-pre-line break-words">{{ a.user.bio }}</p> }
            @if (a.user.avatarUrl) { <img class="block w-full max-h-[360px] object-contain bg-s2 rounded-[12px] mt-3" [src]="a.user.avatarUrl" alt="Profile photo"> }
            <a class="btn btn-ghost btn-sm mt-3" [routerLink]="['/admin/users', a.user.id]"><app-icon name="user" />Manage user</a>
          </div>
        }

        @if (r.comment; as c) {
          <div class="mx-5 mt-3 card p-4">
            <div class="flex items-center gap-2.5">
              @if (c.user; as u) { <app-avatar [url]="u.avatarUrl" [name]="u.displayName" [size]="32" /> }
              <div class="flex-1 min-w-0">
                <div class="font-bold text-[14px] truncate">{{ c.user?.displayName ?? 'Unknown user' }}</div>
                <div class="text-[12px] text-mute">{{ day(c.createdAt) }}</div>
              </div>
              @if (c.user; as u) { <a class="chip" [routerLink]="['/admin/users', u.id]"><app-icon name="user" />User</a> }
            </div>
            <p class="text-[14px] mt-3 whitespace-pre-line break-words">{{ c.body }}</p>
          </div>
          @if (r.post) { <div class="pad mt-4 lbl">On this post</div> }
        }

        @if (r.post; as p) {
          <div class="mx-5 mt-3"><app-admin-post [post]="p" /></div>
        }

        <div class="pad mt-5 lbl mb-2">Reports</div>
        <div class="mx-5"><app-report-entries [entries]="r.reports" /></div>

        <div class="mt-auto pad pt-6 pb-[calc(28px+env(safe-area-inset-bottom))] grid grid-cols-2 gap-2">
          <button class="btn btn-ghost" [disabled]="busy()" (click)="restore()">{{ r.targetType === 'USER' ? 'Dismiss' : 'Restore' }}</button>
          <button class="btn btn-primary" [disabled]="busy()" (click)="remove()">{{ r.targetType === 'USER' ? 'Reset profile' : 'Remove' }}</button>
        </div>
      } @else {
        <div class="pad mt-4 space-y-3"><div class="skeleton h-[320px]"></div><div class="skeleton h-[120px]"></div></div>
      }
    </div>
  `
})
export class ReportDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly prompt = inject(PromptService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  readonly type = input.required<ReportTarget>();
  readonly id = input.required<string>();

  protected readonly names = TARGET_NAMES;
  protected readonly day = day;
  protected readonly report = signal<AdminReport | null>(null);
  protected readonly missing = signal(false);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly target = computed(() => (this.type() in TARGET_NAMES ? this.type() : null));

  ngOnInit(): void {
    if (!this.session.user()?.admin) {
      void this.router.navigateByUrl('/settings', { replaceUrl: true });
      return;
    }
    void this.load();
  }

  protected async load(): Promise<void> {
    const type = this.target();
    if (!type) {
      this.missing.set(true);
      return;
    }
    this.failed.set(false);
    try {
      this.report.set(await this.api.adminReport(type, this.id()));
    } catch (e) {
      if (apiError(e).status === 404) this.missing.set(true);
      else this.failed.set(true);
    }
  }

  protected async restore(): Promise<void> {
    const r = this.report();
    if (r) await this.run(() => this.api.restoreReported(r.targetType, r.targetId), r.targetType === 'USER' ? 'Reports dismissed.' : 'Restored.');
  }

  protected async remove(): Promise<void> {
    const r = this.report();
    if (!r) return;
    const q = removeQuestion(r.targetType);
    if (await this.prompt.confirm(q.title, q.message, q.yes, 'Cancel')) {
      await this.run(() => this.api.removeReported(r.targetType, r.targetId), r.targetType === 'USER' ? 'Profile reset.' : 'Removed.');
    }
  }

  protected back(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl('/admin/reports');
  }

  private async run(fn: () => Promise<void>, done: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await fn();
      this.toast.show(done);
      void this.router.navigateByUrl('/admin/reports', { replaceUrl: true });
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
