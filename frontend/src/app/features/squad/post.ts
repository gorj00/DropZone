import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { isProRequired } from '../../core/api/errors';
import { FeedItem } from '../../core/api/models';
import { PhotoLinks } from '../../core/photo-links';
import { ToastService } from '../../core/toast.service';
import { Badge } from '../../ui/badge';
import { Icon } from '../../ui/icon';
import { CommentsThread } from './comments';
import { FeedCard } from './feed-card';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Badge, Icon, CommentsThread, FeedCard],
  template: `
    <div class="screen">
      <div class="pad pt-3 flex items-center gap-3">
        <button class="circ" (click)="back()" aria-label="Back"><app-icon name="back" /></button>
        <div class="h text-[26px] flex-1">Post</div>
      </div>
      @if (missing()) {
        <div class="pad flex-1 flex flex-col items-center justify-center text-center pb-24">
          <app-badge tone="off" [size]="68" icon="lock" />
          <div class="h text-[26px] mt-5">Post not found</div>
          <p class="text-[14px] text-mute mt-2">It may have been removed or made private.</p>
          <a class="btn btn-ghost mt-6 max-w-[280px]" routerLink="/squad">Go to Community</a>
        </div>
      } @else if (item(); as f) {
        <div class="pad mt-4"><app-feed-card [item]="f" (changed)="item.set($event)" (removed)="back()" (blocked)="back()" /></div>
        <div class="mx-5 mt-3 mb-8 card p-4">
          <div class="lbl mb-3">Comments</div>
          <app-comments [feedItemId]="f.id" (count)="item.set({ ...f, commentCount: $event })" />
        </div>
      } @else {
        <div class="pad mt-4 space-y-3"><div class="skeleton h-[320px]"></div><div class="skeleton h-[120px]"></div></div>
      }
    </div>
  `
})
export class PostPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  protected readonly item = signal<FeedItem | null>(null);
  protected readonly missing = signal(false);

  constructor() {
    inject(PhotoLinks).onStale(() => this.load());
  }

  ngOnInit(): void {
    void this.load();
  }

  protected back(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl('/squad');
  }

  private async load(): Promise<void> {
    try {
      this.item.set(await this.api.feedItem(this.id()));
    } catch (e) {
      if (isProRequired(e)) void this.router.navigateByUrl('/paywall');
      else if ((e as { status?: number })?.status === 404) this.missing.set(true);
      else this.toast.error(e);
    }
  }
}
