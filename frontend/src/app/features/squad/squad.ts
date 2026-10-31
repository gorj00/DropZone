import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, RouterLink } from '@angular/router';
import { skip } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { FeedItem, FeedScope } from '../../core/api/models';
import { PhotoLinks } from '../../core/photo-links';
import { SessionStore } from '../../core/session.store';
import { ToastService } from '../../core/toast.service';
import { ProTag } from '../../ui/bits';
import { NotificationBell } from '../../ui/bell';
import { BottomNav } from '../../ui/bottom-nav';
import { Icon } from '../../ui/icon';
import { PULL_TRIGGER, PullRefresh } from '../../ui/pull-refresh';
import { ProLock } from '../paywall/pro-lock';
import { FeedCard } from './feed-card';
import { InView } from './in-view';
import { LeaderboardSwiper } from './leaderboard';

const PAGE = 20;

const wantsToVerify = (p: ParamMap) => p.get('show') === 'verify';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ProTag, BottomNav, Icon, ProLock, InView, PullRefresh, LeaderboardSwiper, FeedCard, NotificationBell],
  template: `
    <div class="screen with-nav relative" appPullRefresh #pr="pull" [refreshing]="refreshing()" (appPullRefresh)="refresh()">
      @if (pro()) {
        <div class="overflow-hidden grid place-items-center text-mute flex-none" [style.height.px]="refreshing() ? 52 : pr.distance()"
             [style.transition]="pr.distance() ? 'none' : 'height .2s ease'" aria-hidden="true" data-test="pull">
          @if (refreshing()) {
            <span class="spin"></span>
          } @else if (pr.distance()) {
            <span class="inline-flex" [class.text-accent]="pr.distance() >= trigger" [style.transform]="'rotate(' + pr.distance() * 3 + 'deg)'"><app-icon name="refresh" [size]="20" /></span>
          }
        </div>
        <div class="pad pt-3 flex items-end justify-between gap-2">
          <div class="flex items-center gap-2"><div class="h text-[38px] [[data-theme=stealth]_&]:text-[42px]">Community</div><app-pro-tag /></div>
          <div class="flex items-center gap-2 mb-1">
            @if (pending() > 0 || scope() === 'TO_VERIFY') {
              <button class="qwait" [style.box-shadow]="scope() === 'TO_VERIFY' ? '0 0 0 1.5px var(--gold)' : null" [attr.aria-pressed]="scope() === 'TO_VERIFY'"
                (click)="toggleToVerify()"><app-icon name="hourglass" />{{ pending() }} to verify</button>
            }
            <app-bell />
            <a class="circ relative" routerLink="/squad/friends" aria-label="Friends">
              <app-icon name="userplus" />
              @if (incoming() > 0) { <span class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]"></span> }
            </a>
          </div>
        </div>

        <div class="pad mt-3">
          <div class="grid grid-cols-2 gap-1 bg-s1 rounded-[14px] p-1 border border-line">
            @for (s of scopes; track s.id) {
              <button class="rounded-[10px] h-[34px] flex items-center justify-center gap-2 font-bold text-[13.5px]" [class.bg-s3]="scope() === s.id" [class.text-mute]="scope() !== s.id" (click)="setScope(s.id)">
                <app-icon [name]="s.icon" [size]="15" />{{ s.label }}
              </button>
            }
          </div>
        </div>

        <app-leaderboard />

        <div class="pad mt-3 space-y-3">
          @if (scope() === 'TO_VERIFY') {
            <div class="flex items-center gap-2">
              <span class="lbl flex-1">Proofs you can verify</span>
              <button class="text-[12.5px] font-bold text-mute" (click)="setScope('FRIENDS')">Back to feed</button>
            </div>
          }
          @for (f of items(); track f.id) {
            <app-feed-card [item]="f" (changed)="replace($event)" (removed)="drop($event)" (blocked)="dropUser($event)" (verified)="onVerified(f.id)" />
          } @empty {
            @if (loading()) {
              <div class="skeleton h-[272px]"></div>
              <div class="skeleton h-[80px]"></div>
            } @else if (failed()) {
              <div class="card p-5 text-center">
                <span class="text-mute inline-flex"><app-icon name="globe" [size]="28" /></span>
                <div class="font-bold text-[15px] mt-2">Couldn't load posts</div>
                <button class="btn btn-ghost btn-sm mx-auto mt-4" (click)="retry()"><app-icon name="refresh" />Retry</button>
              </div>
            } @else {
              <div class="card p-5 text-center">
                <span class="text-mute inline-flex"><app-icon [name]="scope() === 'TO_VERIFY' ? 'check' : 'users'" [size]="28" /></span>
                <div class="font-bold text-[15px] mt-2">{{ emptyTitle() }}</div>
                <div class="text-[12.5px] text-mute mt-1">{{ emptyText() }}</div>
                @if (scope() === 'FRIENDS') { <a class="btn btn-ghost btn-sm mx-auto mt-4" routerLink="/squad/friends"><app-icon name="userplus" />Add friends</a> }
              </div>
            }
          }
          @if (items().length && !done()) {
            <div class="h-10 grid place-items-center" (appInView)="more()">
              @if (loading()) {
                <span class="text-[12px] text-mute">Loading…</span>
              } @else if (failed()) {
                <button class="text-[12px] text-mute font-semibold flex items-center gap-1.5" (click)="retry()"><app-icon name="refresh" [size]="14" />Couldn't load more · Retry</button>
              } @else {
                <button class="text-[12px] text-mute font-semibold" (click)="more()">Load more</button>
              }
            </div>
          }
        </div>
      } @else {
        <div class="pad pt-3"><div class="flex items-center gap-2"><div class="h text-[38px] [[data-theme=stealth]_&]:text-[42px]">Community</div><app-pro-tag /></div></div>
        <div class="mx-5 mt-3 card h-[230px] flex items-end justify-center gap-3 px-4 blur-[5px] opacity-50 pointer-events-none" aria-hidden="true">
          <div class="flex flex-col items-center w-[80px]"><span class="av w-12 h-12 bg-violet"></span><div class="w-full h-[46px] mt-3 rounded-t-[10px] bg-violet"></div></div>
          <div class="flex flex-col items-center w-[88px]"><span class="av w-14 h-14 bg-gold"></span><div class="w-full h-[70px] mt-3 rounded-t-[10px] bg-accent"></div></div>
          <div class="flex flex-col items-center w-[80px]"><span class="av w-11 h-11 bg-accent2"></span><div class="w-full h-[32px] mt-3 rounded-t-[10px] bg-accent2"></div></div>
        </div>
        <div class="mx-5 mt-2.5 card h-[150px] blur-[5px] opacity-40" aria-hidden="true"></div>
        <div class="absolute left-5 right-5 top-[calc(150px+env(safe-area-inset-top))] z-10">
          <app-pro-lock section="Community" title="Drop together" text="On Free your goal stays private." icon="users"
            [features]="['Add friends & follow their drops', 'Share milestone rewards, get hyped', 'Community verification', 'Weekly leaderboards']" />
        </div>
      }
      <app-bottom-nav />
    </div>
  `
})
export class SquadPage {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);

  protected readonly pro = this.session.pro;
  protected readonly scopes: { id: FeedScope; label: string; icon: string }[] = [
    { id: 'FRIENDS', label: 'Friends', icon: 'users' },
    { id: 'EVERYONE', label: 'Everyone', icon: 'globe' }
  ];
  protected readonly scope = signal<FeedScope>('FRIENDS');
  protected readonly items = signal<FeedItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly refreshing = signal(false);
  protected readonly trigger = PULL_TRIGGER;
  protected readonly failed = signal(false);
  protected readonly done = signal(false);
  protected readonly pending = signal(0);
  protected readonly incoming = signal(0);
  private next: string | null = null;

  constructor() {
    if (!this.pro()) return;
    const route = inject(ActivatedRoute);
    if (wantsToVerify(route.snapshot.queryParamMap)) this.scope.set('TO_VERIFY');
    route.queryParamMap.pipe(skip(1), takeUntilDestroyed()).subscribe(p => {
      if (!wantsToVerify(p)) return;
      this.setScope('TO_VERIFY');
      this.loadPending();
    });
    void this.load(true);
    this.loadPending();
    void this.api.friendRequests().then(r => this.incoming.set(r.incoming.length)).catch(() => undefined);
    inject(PhotoLinks).onStale(() => this.load(true));
  }

  protected emptyTitle(): string {
    switch (this.scope()) {
      case 'FRIENDS': return 'Your community is quiet';
      case 'TO_VERIFY': return 'Nothing to verify';
      default: return 'Nothing here yet';
    }
  }

  protected emptyText(): string {
    switch (this.scope()) {
      case 'FRIENDS': return 'Add friends to see their drops and verify their proofs.';
      case 'TO_VERIFY': return 'You are all caught up. New proofs from friends and the community show up here.';
      default: return 'Public proofs, before & afters and cleared milestones show up here.';
    }
  }

  protected setScope(s: FeedScope): void {
    if (this.scope() === s) return;
    this.scope.set(s);
    void this.load(true);
  }

  protected toggleToVerify(): void {
    this.setScope(this.scope() === 'TO_VERIFY' ? 'FRIENDS' : 'TO_VERIFY');
    if (this.scope() === 'TO_VERIFY') this.loadPending();
  }

  protected async refresh(): Promise<void> {
    if (!this.pro() || this.refreshing()) return;
    const scope = this.scope();
    this.refreshing.set(true);
    try {
      const page = await this.api.feed(scope, undefined, PAGE);
      if (scope !== this.scope()) return;
      this.items.set(page.items);
      this.next = page.next;
      this.done.set(!page.next);
      this.failed.set(false);
      this.loadPending();
      void this.api.friendRequests().then(r => this.incoming.set(r.incoming.length)).catch(() => undefined);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.refreshing.set(false);
    }
  }

  protected more(): void {
    if (!this.loading() && !this.done() && !this.failed()) void this.load(false);
  }

  protected retry(): void {
    if (!this.loading()) void this.load(!this.items().length);
  }

  protected onVerified(id: string): void {
    this.pending.update(n => Math.max(0, n - 1));
    if (this.scope() === 'TO_VERIFY') this.drop(id);
  }

  protected drop(id: string): void {
    this.items.update(list => list.filter(x => x.id !== id));
  }

  protected dropUser(userId: string): void {
    this.items.update(list => list.filter(x => x.user.id !== userId));
  }

  protected replace(item: FeedItem): void {
    if (this.scope() === 'EVERYONE' && item.isPublic === false) {
      this.drop(item.id);
      return;
    }
    this.items.update(list => list.map(x => (x.id === item.id ? item : x)));
  }

  private loadPending(): void {
    void this.api.pendingCount().then(r => this.pending.set(r.count)).catch(() => undefined);
  }

  private async load(reset: boolean): Promise<void> {
    const scope = this.scope();
    if (reset) {
      this.items.set([]);
      this.done.set(false);
      this.next = null;
    }
    this.failed.set(false);
    this.loading.set(true);
    try {
      const page = await this.api.feed(scope, reset ? undefined : this.next ?? undefined, PAGE);
      if (scope !== this.scope()) return;
      const seen = new Set(this.items().map(x => x.id));
      this.items.update(list => [...list, ...page.items.filter(x => !seen.has(x.id))]);
      this.next = page.next;
      this.done.set(!page.next);
    } catch {
      if (scope === this.scope()) this.failed.set(true);
    } finally {
      if (scope === this.scope()) this.loading.set(false);
    }
  }
}
