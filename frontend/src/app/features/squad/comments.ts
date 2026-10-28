import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { isProRequired } from '../../core/api/errors';
import { FeedComment } from '../../core/api/models';
import { PromptService } from '../../core/prompt.service';
import { SessionStore } from '../../core/session.store';
import { SocialActions } from '../../core/social';
import { ToastService } from '../../core/toast.service';
import { Avatar } from '../../ui/bits';
import { Icon } from '../../ui/icon';
import { SheetDrag } from '../../ui/sheet-drag';
import { ago } from './in-view';

@Component({
  selector: 'app-comments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, Icon],
  template: `
    <div class="space-y-3">
      @for (c of comments(); track c.id) {
        <div class="flex gap-2.5">
          <app-avatar [url]="c.user.avatarUrl" [name]="c.user.displayName" [size]="32" />
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2">
              <span class="font-bold text-[13.5px] truncate">{{ c.user.displayName }}</span>
              <span class="text-[11.5px] text-mute flex-none">{{ ago(c.createdAt) }}</span>
            </div>
            <p class="text-[14px] leading-snug mt-0.5 whitespace-pre-line break-words">{{ c.body }}</p>
          </div>
          <button class="self-start flex flex-col items-center min-w-[30px] pt-0.5" [class.text-accent]="c.likedByMe" [class.text-mute]="!c.likedByMe"
                  [disabled]="liking() === c.id" (click)="like(c)" [attr.aria-pressed]="c.likedByMe" [attr.aria-label]="c.likedByMe ? 'Unlike comment' : 'Like comment'">
            <app-icon [name]="c.likedByMe ? 'heartfill' : 'heart'" [size]="16" />
            @if (c.likeCount) { <span class="num text-[11px] leading-none mt-0.5">{{ c.likeCount }}</span> }
          </button>
          @if (c.canDelete) {
            <button class="text-mute self-start p-1" [disabled]="busy()" (click)="remove(c)" aria-label="Delete comment"><app-icon name="trash" [size]="16" /></button>
          }
          @if (!c.mine) {
            <button class="text-mute self-start p-1" (click)="menu(c)" aria-label="More"><app-icon name="more" [size]="16" /></button>
          }
        </div>
      } @empty {
        @if (loading()) {
          <div class="skeleton h-[44px]"></div>
          <div class="skeleton h-[44px]"></div>
        } @else if (failed()) {
          <div class="py-3 text-center">
            <div class="font-bold text-[14px]">Couldn't load comments</div>
            <button class="btn btn-ghost btn-sm mx-auto mt-3" (click)="retry()"><app-icon name="refresh" />Retry</button>
          </div>
        } @else {
          <p class="text-[13px] text-mute text-center py-3">No comments yet. Be the first to cheer them on.</p>
        }
      }
    </div>
    @if (pro()) {
      <form class="flex gap-2 mt-4" (submit)="$event.preventDefault(); send(field)">
        <input #field class="field flex-1 !h-[44px]" type="text" maxlength="500" placeholder="Add a comment" autocomplete="off" />
        <button class="btn btn-primary !w-[48px] !h-[44px] !p-0 flex-none" type="submit" [disabled]="busy()" aria-label="Send"><app-icon name="up" /></button>
      </form>
    } @else {
      <a class="btn btn-gold btn-sm mt-4" routerLink="/paywall"><app-icon name="crown" />Go PRO to comment</a>
    }
  `
})
export class CommentsThread implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly social = inject(SocialActions);
  private readonly toast = inject(ToastService);
  private readonly prompt = inject(PromptService);
  private readonly router = inject(Router);

  readonly feedItemId = input.required<string>();
  readonly count = output<number>();
  readonly blocked = output<string>();

  protected readonly pro = this.session.pro;
  protected readonly ago = ago;
  protected readonly comments = signal<FeedComment[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly liking = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  protected async send(field: HTMLInputElement): Promise<void> {
    const body = field.value.trim();
    if (!body || this.busy()) return;
    this.busy.set(true);
    try {
      const c = await this.api.addComment(this.feedItemId(), body);
      field.value = '';
      this.comments.update(list => [...list, c]);
      this.count.emit(this.comments().length);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected async like(c: FeedComment): Promise<void> {
    if (!this.pro()) {
      void this.router.navigateByUrl('/paywall');
      return;
    }
    if (this.liking()) return;
    this.liking.set(c.id);
    const flip = (x: FeedComment): FeedComment => ({ ...x, likedByMe: !x.likedByMe, likeCount: Math.max(0, x.likeCount + (x.likedByMe ? -1 : 1)) });
    this.comments.update(list => list.map(x => (x.id === c.id ? flip(x) : x)));
    try {
      const updated = await this.api.likeComment(c.id);
      this.comments.update(list => list.map(x => (x.id === c.id ? { ...x, likeCount: updated.likeCount, likedByMe: updated.likedByMe } : x)));
    } catch (e) {
      this.comments.update(list => list.map(x => (x.id === c.id ? { ...x, likeCount: c.likeCount, likedByMe: c.likedByMe } : x)));
      if (isProRequired(e)) void this.router.navigateByUrl('/paywall');
      else this.toast.error(e);
    } finally {
      this.liking.set(null);
    }
  }

  protected async remove(c: FeedComment): Promise<void> {
    const ok = await this.prompt.confirm('Delete this comment?', 'It will be removed for everyone.', 'Delete', 'Cancel');
    if (!ok) return;
    this.busy.set(true);
    try {
      await this.api.deleteComment(c.id);
      this.comments.update(list => list.filter(x => x.id !== c.id));
      this.count.emit(this.comments().length);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected async menu(c: FeedComment): Promise<void> {
    const result = await this.social.menu('COMMENT', c.id, c.user);
    if (result === 'blocked') {
      this.comments.update(list => list.filter(x => x.user.id !== c.user.id));
      this.count.emit(this.comments().length);
      this.blocked.emit(c.user.id);
    }
  }

  protected retry(): void {
    if (!this.loading()) void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.failed.set(false);
    try {
      this.comments.set(await this.api.comments(this.feedItemId()));
    } catch (e) {
      if (!isProRequired(e)) this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}

@Component({
  selector: 'app-comments-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommentsThread, SheetDrag],
  template: `
    <div class="sheet-backdrop" (click)="closed.emit()"></div>
    <div class="sheet !max-h-[80dvh]" role="dialog" aria-modal="true" aria-label="Comments" sheetDrag (sheetDismiss)="closed.emit()">
      <div class="grabber"></div>
      <div class="h text-[24px] mt-5 mb-4">Comments</div>
      <app-comments [feedItemId]="feedItemId()" (count)="count.emit($event)" (blocked)="blocked.emit($event)" />
    </div>
  `
})
export class CommentsSheet {
  readonly feedItemId = input.required<string>();
  readonly closed = output<void>();
  readonly count = output<number>();
  readonly blocked = output<string>();
}
