import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AppNotification, NotificationType, UserSummary } from '../../core/api/models';
import { openExternal } from '../../core/config.service';
import { isExternal, notificationLink } from '../../core/links';
import { PhotoLinks } from '../../core/photo-links';
import { SessionStore } from '../../core/session.store';
import { NotificationsStore, SocialActions } from '../../core/social';
import { ToastService } from '../../core/toast.service';
import { STORE } from '../../core/platform';
import { Avatar } from '../../ui/bits';
import { Icon } from '../../ui/icon';
import { InView, ago } from '../squad/in-view';

export { notificationLink } from '../../core/links';

const PAGE = 30;

const META: Record<NotificationType, { icon: string; tone: string }> = {
  COMMENT: { icon: 'comment', tone: 'var(--accent-2)' },
  COMMENT_REPLY: { icon: 'comment', tone: 'var(--accent-2)' },
  COMMENT_LIKE: { icon: 'heart', tone: 'var(--accent)' },
  HYPE: { icon: 'bolt', tone: 'var(--accent)' },
  VERIFY: { icon: 'check', tone: 'var(--ok)' },
  PROOF_VERIFIED: { icon: 'trophy', tone: 'var(--gold)' },
  FRIEND_REQUEST: { icon: 'userplus', tone: 'var(--accent-2)' },
  FRIEND_ACCEPTED: { icon: 'users', tone: 'var(--ok)' },
  TRIAL_ENDING: { icon: 'crown', tone: 'var(--gold)' },
  PROOF_REJECTED: { icon: 'imgoff', tone: 'var(--accent)' },
  ADMIN_REPORT: { icon: 'flag', tone: 'var(--gold)' },
  TRIAL_ENDED: { icon: 'hourglass', tone: 'var(--gold)' },
  BILLING_ISSUE: { icon: 'coins', tone: 'var(--accent)' },
  PRO_ENDED: { icon: 'crown', tone: 'var(--mute)' },
  PRO_BACK: { icon: 'crown', tone: 'var(--gold)' },
  LIFETIME_PRO: { icon: 'crown', tone: 'var(--gold)' }
};

const TITLES: Partial<Record<NotificationType, string>> = {
  TRIAL_ENDED: 'Your PRO trial has ended',
  BILLING_ISSUE: `Payment problem — fix it in ${STORE.name} to keep PRO`,
  PRO_ENDED: 'Your PRO subscription ended',
  PRO_BACK: 'Welcome back to PRO',
  LIFETIME_PRO: 'You’ve got PRO for life!'
};

const NO_QUOTE: NotificationType[] = ['TRIAL_ENDING', 'PROOF_REJECTED', 'ADMIN_REPORT', 'TRIAL_ENDED', 'BILLING_ISSUE', 'PRO_ENDED', 'PRO_BACK', 'LIFETIME_PRO'];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, Icon, InView],
  template: `
    <div class="screen">
      <div class="pad pt-3 flex items-center gap-3">
        <button class="circ" (click)="back()" aria-label="Back"><app-icon name="back" /></button>
        <div class="h text-[30px] flex-1">Notifications</div>
      </div>
      <div class="pad mt-4 mb-8 space-y-2">
        @for (n of items(); track n.id) {
          <div class="card w-full p-3 flex items-center gap-3 text-left cursor-pointer" role="button" tabindex="0" [class.card-hi]="!n.read" (click)="open(n)" (keydown.enter)="open(n)">
            <div class="relative flex-none">
              @if (n.actor; as a) {
                <button class="block rounded-full" [attr.aria-label]="a.displayName" (click)="$event.stopPropagation(); actorMenu(a)"><app-avatar [url]="a.avatarUrl" [name]="a.displayName" [size]="42" /></button>
              } @else {
                <span class="w-[42px] h-[42px] rounded-full grid place-items-center bg-s2" [style.color]="meta(n).tone"><app-icon [name]="meta(n).icon" [size]="20" /></span>
              }
              <span class="absolute -bottom-1 -right-1 w-[22px] h-[22px] rounded-full grid place-items-center bg-s1 border border-line pointer-events-none" [style.color]="meta(n).tone"><app-icon [name]="meta(n).icon" [size]="12" /></span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-[14px] leading-snug">@if (n.actor; as a) { <b>{{ a.displayName }}</b> }{{ verb(n) }}</div>
              @if (detail(n); as d) { <div class="text-[12.5px] text-mute leading-snug mt-0.5">{{ d }}</div> }
              @if (quote(n); as q) { <div class="text-[12.5px] text-mute truncate mt-0.5">“{{ q }}”</div> }
            </div>
            <div class="flex flex-col items-end gap-1.5 flex-none">
              <span class="text-[11.5px] text-mute">{{ ago(n.createdAt) }}</span>
              @if (!n.read) { <span class="w-2 h-2 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]"></span> }
            </div>
          </div>
        } @empty {
          @if (loading()) {
            <div class="skeleton h-[68px]"></div>
            <div class="skeleton h-[68px]"></div>
            <div class="skeleton h-[68px]"></div>
          } @else {
            <div class="card p-6 text-center">
              <span class="text-mute inline-flex"><app-icon name="bell" [size]="28" /></span>
              <div class="font-bold text-[15px] mt-2">All quiet</div>
              <div class="text-[12.5px] text-mute mt-1">Comments, hypes, verifies and friend requests show up here.</div>
            </div>
          }
        }
        @if (items().length && !done()) {
          <div class="h-10 grid place-items-center" (appInView)="more()"><span class="text-[12px] text-mute">Loading…</span></div>
        }
      </div>
    </div>
  `
})
export class NotificationsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly store = inject(NotificationsStore);
  private readonly social = inject(SocialActions);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  protected readonly ago = ago;
  protected readonly items = signal<AppNotification[]>([]);
  protected readonly loading = signal(true);
  protected readonly done = signal(false);
  private next: string | null = null;

  constructor() {
    inject(PhotoLinks).onStale(() => this.load(true));
  }

  ngOnInit(): void {
    void this.load(true).then(() => this.store.markAllRead());
  }

  protected meta(n: AppNotification): { icon: string; tone: string } {
    return META[n.type] ?? { icon: 'bell', tone: 'var(--mute)' };
  }

  protected verb(n: AppNotification): string {
    switch (n.type) {
      case 'COMMENT': return ' commented on your post';
      case 'COMMENT_REPLY': return ' replied to your comment';
      case 'COMMENT_LIKE': return ' liked your comment';
      case 'HYPE': return ' hyped your post';
      case 'VERIFY': return ' verified your proof';
      case 'PROOF_VERIFIED': return 'Your community fully verified your proof';
      case 'FRIEND_REQUEST': return ' wants to drop together';
      case 'FRIEND_ACCEPTED': return ' is now your friend';
      case 'TRIAL_ENDING': return n.text ?? 'Your PRO trial ends soon';
      case 'PROOF_REJECTED': return n.text ?? 'A moderator removed your proof. Upload a new one to finish it.';
      case 'ADMIN_REPORT': return n.text ?? 'New report to review';
      default: return TITLES[n.type] ?? n.text ?? '';
    }
  }

  protected detail(n: AppNotification): string | null {
    return TITLES[n.type] ? n.text : null;
  }

  protected quote(n: AppNotification): string | null {
    return NO_QUOTE.includes(n.type) ? null : n.text;
  }

  protected open(n: AppNotification): void {
    const link = notificationLink(n, this.session.user()?.proProductId);
    if (!link) return;
    if (isExternal(link)) openExternal(link);
    else void this.router.navigateByUrl(link);
  }

  protected actorMenu(user: UserSummary): void {
    void this.social.userMenu(user).then(r => {
      if (r === 'blocked') this.items.update(list => list.filter(x => x.actor?.id !== user.id));
    });
  }

  protected more(): void {
    if (!this.loading() && !this.done()) void this.load(false);
  }

  protected back(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl('/today');
  }

  private async load(reset: boolean): Promise<void> {
    this.loading.set(true);
    try {
      const page = await this.api.notifications(reset ? undefined : this.next ?? undefined, PAGE);
      const seen = new Set(reset ? [] : this.items().map(x => x.id));
      this.items.update(list => (reset ? page.items : [...list, ...page.items.filter(x => !seen.has(x.id))]));
      this.next = page.next;
      this.done.set(!page.next);
    } catch (e) {
      this.toast.error(e);
      this.done.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
