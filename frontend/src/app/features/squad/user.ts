import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { isProRequired } from '../../core/api/errors';
import { FeedItem, UserProfile } from '../../core/api/models';
import { PhotoLinks } from '../../core/photo-links';
import { PromptService } from '../../core/prompt.service';
import { SessionStore } from '../../core/session.store';
import { SocialActions } from '../../core/social';
import { ToastService } from '../../core/toast.service';
import { Avatar } from '../../ui/bits';
import { Badge } from '../../ui/badge';
import { Icon } from '../../ui/icon';
import { FeedCard } from './feed-card';
import { InView } from './in-view';

const PAGE = 20;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, Badge, Icon, FeedCard, InView],
  template: `
    <div class="screen">
      <div class="pad pt-3 flex items-center gap-3">
        <button class="circ" (click)="back()" aria-label="Back"><app-icon name="back" /></button>
        <div class="h text-[26px] flex-1 truncate">{{ profile()?.user?.displayName ?? 'Profile' }}</div>
        @if (profile()) { <button class="circ" (click)="menu()" aria-label="More"><app-icon name="more" /></button> }
      </div>
      @if (missing()) {
        <div class="pad flex-1 flex flex-col items-center justify-center text-center pb-24">
          <app-badge tone="off" [size]="68" icon="user" />
          <div class="h text-[26px] mt-5">Profile not found</div>
          <p class="text-[14px] text-mute mt-2">This person may have left DropZone.</p>
          <a class="btn btn-ghost mt-6 max-w-[280px]" routerLink="/squad">Go to Community</a>
        </div>
      } @else if (profile(); as p) {
        <div class="pad mt-4 flex items-center gap-4">
          <app-avatar [url]="p.user.avatarUrl" [name]="p.user.displayName" [size]="76" />
          <div class="flex-1 min-w-0">
            <div class="font-bold text-[19px] leading-tight truncate">{{ p.user.displayName }}</div>
            <div class="text-[13px] text-mute truncate mt-0.5">&#64;{{ p.user.handle }}</div>
            @if (p.user.path) {
              <span class="chip mt-2 !text-accent2"><app-icon [name]="p.user.path === 'GAIN' ? 'gym' : 'trend'" />{{ p.user.path === 'GAIN' ? 'BUILDING MUSCLE' : 'LOSING WEIGHT' }}</span>
            }
          </div>
        </div>
        @if (p.user.bio) { <p class="pad mt-3 text-[14px] leading-snug whitespace-pre-line break-words">{{ p.user.bio }}</p> }
        <div class="pad mt-4 flex gap-2">
          @switch (p.relation) {
            @case ('FRIEND') { <button class="btn btn-ghost flex-1" [disabled]="busy()" (click)="friendMenu(p)"><app-icon name="users" />Friends</button> }
            @case ('REQUESTED') { <button class="btn btn-ghost flex-1" [disabled]="busy()" (click)="cancelRequest(p)"><app-icon name="hourglass" />Requested</button> }
            @case ('INCOMING') {
              <button class="btn btn-primary flex-1" [disabled]="busy()" (click)="accept(p)"><app-icon name="check" />Accept</button>
              <button class="btn btn-ghost flex-1" [disabled]="busy()" (click)="decline(p)">Decline</button>
            }
            @case ('NONE') { <button class="btn btn-primary flex-1" [disabled]="busy()" (click)="add(p)"><app-icon name="userplus" />Add friend</button> }
          }
        </div>
        <div class="pad mt-6"><div class="lbl">Posts</div></div>
        <div class="pad mt-2 pb-10 space-y-3">
          @for (f of items(); track f.id) {
            <app-feed-card [item]="f" (changed)="replace($event)" (removed)="drop($event)" (blocked)="back()" />
          } @empty {
            @if (loading()) {
              <div class="skeleton h-[272px]"></div>
            } @else if (failed()) {
              <div class="card p-5 text-center">
                <div class="font-bold text-[15px]">Couldn't load posts</div>
                <button class="btn btn-ghost btn-sm mx-auto mt-4" (click)="retry()"><app-icon name="refresh" />Retry</button>
              </div>
            } @else {
              <div class="card p-5 text-center">
                <span class="text-mute inline-flex"><app-icon name="image" [size]="28" /></span>
                <div class="font-bold text-[15px] mt-2">No posts yet</div>
                <div class="text-[12.5px] text-mute mt-1">{{ p.relation === 'FRIEND' ? 'Their posts show up here.' : 'Their public posts show up here. Add them as a friend to see more.' }}</div>
              </div>
            }
          }
          @if (items().length && !done()) {
            <div class="h-10 grid place-items-center" (appInView)="more()">
              @if (failed()) {
                <button class="text-[12px] text-mute font-semibold flex items-center gap-1.5" (click)="retry()"><app-icon name="refresh" [size]="14" />Couldn't load more · Retry</button>
              } @else { <span class="spin text-mute"></span> }
            </div>
          }
        </div>
      } @else {
        <div class="pad mt-4 space-y-3"><div class="skeleton h-[120px]"></div><div class="skeleton h-[272px]"></div></div>
      }
    </div>
  `
})
export class UserPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly social = inject(SocialActions);
  private readonly prompt = inject(PromptService);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  protected readonly profile = signal<UserProfile | null>(null);
  protected readonly missing = signal(false);
  protected readonly busy = signal(false);
  protected readonly items = signal<FeedItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly done = signal(false);
  private next: string | null = null;

  constructor() {
    inject(PhotoLinks).onStale(() => this.load(true));
  }

  ngOnInit(): void {
    if (this.id() === this.session.user()?.id) {
      void this.router.navigateByUrl('/me', { replaceUrl: true });
      return;
    }
    void this.loadProfile();
  }

  protected back(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl('/squad');
  }

  protected async menu(): Promise<void> {
    const p = this.profile();
    if (p && (await this.social.userMenu(p.user)) === 'blocked') this.back();
  }

  protected async add(p: UserProfile): Promise<void> {
    await this.run(async () => {
      const r = await this.api.sendFriendRequest(p.user.id);
      this.profile.set({ ...p, relation: 'REQUESTED', requestId: r.id });
      this.toast.show(`Request sent to ${p.user.displayName}.`);
    });
  }

  protected async cancelRequest(p: UserProfile): Promise<void> {
    const action = await this.prompt.choose(p.user.displayName, [{ key: 'cancel', label: 'Cancel friend request', icon: 'close', danger: true }]);
    if (action !== 'cancel' || !p.requestId) return;
    await this.run(async () => {
      await this.api.deleteFriendRequest(p.requestId!);
      this.profile.set({ ...p, relation: 'NONE', requestId: null });
    });
  }

  protected async accept(p: UserProfile): Promise<void> {
    if (!p.requestId) return;
    await this.run(async () => {
      await this.api.acceptFriendRequest(p.requestId!);
      this.profile.set({ ...p, relation: 'FRIEND', requestId: null });
      this.toast.show(`${p.user.displayName} joined your community.`);
      void this.load(true);
    });
  }

  protected async decline(p: UserProfile): Promise<void> {
    if (!p.requestId) return;
    await this.run(async () => {
      await this.api.deleteFriendRequest(p.requestId!);
      this.profile.set({ ...p, relation: 'NONE', requestId: null });
    });
  }

  protected async friendMenu(p: UserProfile): Promise<void> {
    const action = await this.prompt.choose(p.user.displayName, [{ key: 'remove', label: 'Remove friend', icon: 'close', danger: true }]);
    if (action !== 'remove') return;
    const ok = await this.prompt.confirm(`Remove ${p.user.displayName}?`, 'You will stop seeing each other’s friends-only posts.', 'Remove', 'Cancel');
    if (!ok) return;
    await this.run(async () => {
      await this.api.removeFriend(p.user.id);
      this.profile.set({ ...p, relation: 'NONE', requestId: null });
      void this.load(true);
    });
  }

  protected more(): void {
    if (!this.loading() && !this.done() && !this.failed()) void this.load(false);
  }

  protected retry(): void {
    if (!this.loading()) void this.load(!this.items().length);
  }

  protected replace(item: FeedItem): void {
    this.items.update(list => list.map(x => (x.id === item.id ? item : x)));
  }

  protected drop(id: string): void {
    this.items.update(list => list.filter(x => x.id !== id));
  }

  private async loadProfile(): Promise<void> {
    try {
      const p = await this.api.userProfile(this.id());
      if (p.relation === 'SELF') {
        void this.router.navigateByUrl('/me', { replaceUrl: true });
        return;
      }
      this.profile.set(p);
      void this.load(true);
    } catch (e) {
      if (isProRequired(e)) void this.router.navigateByUrl('/paywall');
      else if ((e as { status?: number })?.status === 404) this.missing.set(true);
      else this.toast.error(e);
    }
  }

  private async load(reset: boolean): Promise<void> {
    if (reset) {
      this.next = null;
      this.done.set(false);
    }
    this.failed.set(false);
    this.loading.set(true);
    try {
      const page = await this.api.userFeed(this.id(), reset ? undefined : this.next ?? undefined, PAGE);
      const seen = new Set(reset ? [] : this.items().map(x => x.id));
      this.items.update(list => [...(reset ? [] : list), ...page.items.filter(x => !seen.has(x.id))]);
      this.next = page.next;
      this.done.set(!page.next);
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await fn();
    } catch (e) {
      if (isProRequired(e)) void this.router.navigateByUrl('/paywall');
      else this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
