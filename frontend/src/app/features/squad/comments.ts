import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { isProRequired } from '../../core/api/errors';
import { FeedComment } from '../../core/api/models';
import { ChoiceOption, PromptService } from '../../core/prompt.service';
import { SessionStore } from '../../core/session.store';
import { SocialActions } from '../../core/social';
import { ToastService } from '../../core/toast.service';
import { Avatar } from '../../ui/bits';
import { Icon } from '../../ui/icon';
import { Press } from '../../ui/press';
import { SheetDrag } from '../../ui/sheet-drag';
import { ago } from './in-view';

export const COMMENT_LIMIT = 300;
const WARN_AT = COMMENT_LIMIT - 50;
const OVER = '#ff4d4d';
const MENTION = /^(@[a-z0-9._]+)([\s\S]*)$/i;

interface Thread {
  top: FeedComment;
  replies: FeedComment[];
}

@Component({
  selector: 'app-comments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgTemplateOutlet, Avatar, Icon, Press],
  host: { class: 'flex flex-col min-h-0' },
  template: `
    <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain">
      <div class="space-y-4">
        @for (t of threads(); track t.top.id) {
          <div>
            <ng-container *ngTemplateOutlet="row; context: { $implicit: t.top, size: 32 }" />
            @if (t.replies.length) {
              <div class="ml-[42px] mt-2.5">
                @if (expanded().has(t.top.id)) {
                  <div class="space-y-3">
                    @for (r of t.replies; track r.id) {
                      <ng-container *ngTemplateOutlet="row; context: { $implicit: r, size: 24 }" />
                    }
                  </div>
                  <button class="text-[12.5px] font-bold text-mute mt-2.5 flex items-center gap-2" (click)="toggle(t.top.id)"><span class="w-6 h-px bg-line"></span>Hide replies</button>
                } @else {
                  <button class="text-[12.5px] font-bold text-mute flex items-center gap-2" (click)="toggle(t.top.id)">
                    <span class="w-6 h-px bg-line"></span>View {{ t.replies.length }} {{ t.replies.length === 1 ? 'reply' : 'replies' }}
                  </button>
                }
              </div>
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
    </div>

    <ng-template #row let-c let-size="size">
      @let parts = split(c.body);
      <div class="flex gap-2.5" appPress (longPress)="menu(c)" [attr.data-comment]="c.id">
        <a class="flex-none self-start" [routerLink]="profileLink(c)" [attr.aria-label]="c.user.displayName"><app-avatar [url]="c.user.avatarUrl" [name]="c.user.displayName" [size]="size" /></a>
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2">
            <a class="font-bold text-[13.5px] truncate" [routerLink]="profileLink(c)">{{ c.user.displayName }}</a>
            <span class="text-[11.5px] text-mute flex-none">{{ ago(c.createdAt) }}</span>
          </div>
          <p class="text-[14px] leading-snug mt-0.5 whitespace-pre-line break-words">@if (parts.mention) {<span class="font-bold text-accent2">{{ parts.mention }}</span>}{{ parts.rest }}</p>
          @if (pro()) {
            <button class="text-[12px] font-bold text-mute mt-1" (click)="reply(c)">Reply</button>
          }
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
    </ng-template>

    @if (pro()) {
      <div class="flex-none sticky bottom-0 bg-s1 pt-3">
        @if (replyTo(); as r) {
          <div class="flex items-center gap-2 text-[12.5px] text-mute mb-2">
            <span class="flex-1 truncate">Replying to <b class="text-ink">{{ r.user.displayName }}</b></span>
            <button class="p-1 -m-1" (click)="cancelReply()" aria-label="Cancel reply"><app-icon name="close" [size]="14" /></button>
          </div>
        }
        <form class="flex gap-2 items-end" (submit)="$event.preventDefault(); send()">
          <textarea #field rows="1" class="field h-[44px] py-[11px] leading-[20px] resize-none block" [style.border-color]="over() ? OVER : null"
                    [placeholder]="replyTo() ? 'Add a reply' : 'Add a comment'" autocomplete="off" aria-label="Comment" (input)="onInput()"></textarea>
          <button class="btn btn-primary !w-[48px] !h-[44px] !p-0 flex-none" type="submit" [disabled]="busy() || !sendable()" aria-label="Send"><app-icon name="up" /></button>
        </form>
        @if (length() > WARN_AT) {
          <div class="num text-[11.5px] text-right mt-1" [class.text-mute]="!over()" [style.color]="over() ? OVER : null" data-test="counter">
            {{ length() }}/{{ LIMIT }}@if (over()) { · Too long}
          </div>
        }
      </div>
    } @else {
      <a class="btn btn-gold btn-sm mt-4 flex-none" routerLink="/paywall"><app-icon name="crown" />Go PRO to comment</a>
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly field = viewChild<ElementRef<HTMLTextAreaElement>>('field');

  readonly feedItemId = input.required<string>();
  readonly count = output<number>();
  readonly blocked = output<string>();

  protected readonly LIMIT = COMMENT_LIMIT;
  protected readonly WARN_AT = WARN_AT;
  protected readonly OVER = OVER;
  protected readonly pro = this.session.pro;
  protected readonly ago = ago;
  protected readonly comments = signal<FeedComment[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly liking = signal<string | null>(null);
  protected readonly replyTo = signal<FeedComment | null>(null);
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly draft = signal('');
  protected readonly length = computed(() => this.draft().trim().length);
  protected readonly over = computed(() => this.length() > COMMENT_LIMIT);
  protected readonly sendable = computed(() => this.length() > 0 && !this.over());
  protected readonly threads = computed<Thread[]>(() => {
    const list = this.comments();
    const tops = list.filter(c => !c.parentId);
    const replies = new Map<string, FeedComment[]>(tops.map(c => [c.id, []]));
    for (const c of list) if (c.parentId) replies.get(c.parentId)?.push(c);
    return tops.map(top => ({ top, replies: replies.get(top.id) ?? [] }));
  });

  ngOnInit(): void {
    void this.load();
  }

  protected split(body: string): { mention: string | null; rest: string } {
    const m = MENTION.exec(body);
    return m ? { mention: m[1], rest: m[2] } : { mention: null, rest: body };
  }

  protected profileLink(c: FeedComment): string | string[] {
    return c.mine ? '/me' : ['/u', c.user.id];
  }

  protected toggle(id: string): void {
    this.expanded.update(s => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected onInput(): void {
    const el = this.field()?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 44), 120)}px`;
    this.draft.set(el.value);
  }

  protected reply(c: FeedComment): void {
    if (!this.pro()) {
      void this.router.navigateByUrl('/paywall');
      return;
    }
    const el = this.field()?.nativeElement;
    if (!el) return;
    this.replyTo.set(c);
    el.value = `@${c.user.handle} ${el.value.replace(/^@[a-z0-9._]+\s*/i, '')}`;
    this.onInput();
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  protected cancelReply(): void {
    const el = this.field()?.nativeElement;
    const tag = this.replyTo() ? `@${this.replyTo()!.user.handle} ` : null;
    this.replyTo.set(null);
    if (el && tag && el.value.startsWith(tag)) {
      el.value = el.value.slice(tag.length);
      this.onInput();
    }
  }

  protected async send(): Promise<void> {
    const el = this.field()?.nativeElement;
    if (!el) return;
    const body = el.value.trim();
    if (!body || body.length > COMMENT_LIMIT || this.busy()) return;
    this.busy.set(true);
    try {
      const c = await this.api.addComment(this.feedItemId(), body, this.replyTo()?.id);
      el.value = '';
      this.onInput();
      this.replyTo.set(null);
      this.comments.update(list => [...list, c]);
      if (c.parentId) this.expanded.update(s => new Set(s).add(c.parentId!));
      this.count.emit(this.comments().length);
      setTimeout(() => this.host.querySelector(`[data-comment="${c.id}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }));
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
    const replies = c.parentId ? 0 : this.comments().filter(x => x.parentId === c.id).length;
    const ok = await this.prompt.confirm('Delete this comment?', replies ? 'It and its replies will be removed for everyone.' : 'It will be removed for everyone.', 'Delete', 'Cancel');
    if (!ok) return;
    this.busy.set(true);
    try {
      await this.api.deleteComment(c.id);
      this.comments.update(list => list.filter(x => x.id !== c.id && x.parentId !== c.id));
      if (this.replyTo()?.id === c.id) this.cancelReply();
      this.count.emit(this.comments().length);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected async menu(c: FeedComment): Promise<void> {
    const extra: ChoiceOption[] = [];
    if (this.pro()) extra.push({ key: 'reply', label: 'Reply', icon: 'comment' });
    extra.push({ key: 'copy', label: 'Copy text', icon: 'copy' });
    if (c.canDelete) extra.push({ key: 'delete', label: 'Delete comment', icon: 'trash', danger: true });
    const action = c.mine
      ? await this.prompt.choose('Your comment', extra)
      : await this.social.menu('COMMENT', c.id, c.user, extra);
    if (action === 'reply') this.reply(c);
    else if (action === 'copy') await this.copy(c);
    else if (action === 'delete') await this.remove(c);
    else if (action === 'blocked') {
      this.comments.update(list => list.filter(x => x.user.id !== c.user.id));
      if (this.replyTo()?.user.id === c.user.id) this.cancelReply();
      this.count.emit(this.comments().length);
      this.blocked.emit(c.user.id);
    }
  }

  protected retry(): void {
    if (!this.loading()) void this.load();
  }

  private async copy(c: FeedComment): Promise<void> {
    try {
      await navigator.clipboard.writeText(c.body);
      this.toast.show('Copied.');
    } catch {
      this.toast.show('Couldn’t copy the text.');
    }
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
    <div class="sheet !max-h-[80dvh] !overflow-hidden flex flex-col" role="dialog" aria-modal="true" aria-label="Comments" sheetDrag (sheetDismiss)="closed.emit()">
      <div class="grabber flex-none"></div>
      <div class="h text-[24px] mt-5 mb-4 flex-none">Comments</div>
      <app-comments class="flex-1" [feedItemId]="feedItemId()" (count)="count.emit($event)" (blocked)="blocked.emit($event)" />
    </div>
  `
})
export class CommentsSheet {
  readonly feedItemId = input.required<string>();
  readonly closed = output<void>();
  readonly count = output<number>();
  readonly blocked = output<string>();
}
