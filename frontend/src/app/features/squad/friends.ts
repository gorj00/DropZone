import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Location, NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { FriendRequest, UserSummary } from '../../core/api/models';
import { shareOrCopy } from '../../core/native/share';
import { PhotoLinks } from '../../core/photo-links';
import { PromptService } from '../../core/prompt.service';
import { SessionStore } from '../../core/session.store';
import { SocialActions } from '../../core/social';
import { ToastService } from '../../core/toast.service';
import { ProLock } from '../paywall/pro-lock';
import { Avatar, ProTag } from '../../ui/bits';
import { Icon } from '../../ui/icon';

export const MIN_SEARCH = 3;

export function searchTerm(q: string): string {
  return q.trim().replace(/^@/, '');
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink, Avatar, ProTag, Icon, ProLock],
  template: `
    <div class="screen pb-[calc(32px+env(safe-area-inset-bottom))]">
      <div class="pad h-[58px] flex items-center gap-3">
        <button class="circ" (click)="back()" aria-label="Back"><app-icon name="back" /></button>
        <div class="h text-[28px] [[data-theme=stealth]_&]:text-[32px] flex-1">Friends</div>
        <app-pro-tag />
      </div>

      @if (pro()) {
        <div class="mx-5 mt-2 tcard">
          <div class="strip"><span>Invite your friends</span><span class="flex items-center gap-1"><app-icon name="link" [size]="13" />Link</span></div>
          <div class="p-3.5">
            <p class="text-[13px] text-mute leading-snug">Friends who open your link send you a friend request. Accept it below to add them.</p>
            <div class="mt-2.5 h-[44px] rounded-[12px] bg-s2 border border-line px-3 flex items-center text-[13.5px] font-semibold truncate">
              @if (inviteUrl(); as u) { <span class="truncate">{{ u }}</span> } @else { <span class="skeleton h-3 w-2/3"></span> }
            </div>
            <div class="grid grid-cols-2 gap-2 mt-2.5">
              <button class="btn btn-primary btn-sm !w-full" [disabled]="!inviteUrl()" (click)="share()"><app-icon name="share" />Share</button>
              <button class="btn btn-ghost btn-sm !w-full" [disabled]="!inviteUrl()" (click)="copy()"><app-icon name="link" />Copy</button>
            </div>
          </div>
        </div>

        <div class="pad mt-4">
          <div class="relative">
            <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-mute inline-flex"><app-icon name="search" [size]="18" /></span>
            <input class="field !pl-11" type="search" placeholder="Search by @handle or full name" autocomplete="off" [value]="query()" (input)="onQuery($any($event.target).value)">
          </div>
          @if (term().length > 0 && term().length < minSearch) {
            <p class="text-[12.5px] text-mute mt-2 px-1">Type at least 3 letters.</p>
          } @else if (term().length >= minSearch) {
            <div class="card mt-2 divide-y divide-line">
              @for (u of results(); track u.id) {
                <div class="flex items-center gap-3 px-3.5 h-[58px]">
                  <a class="flex items-center gap-3 flex-1 min-w-0" [routerLink]="['/u', u.id]"><app-avatar [url]="u.avatarUrl" [name]="u.displayName" [size]="36" />
                  <div class="flex-1 min-w-0"><div class="font-bold text-[14.5px] leading-tight truncate">{{ u.displayName }}</div><div class="text-[12px] text-mute truncate">&#64;{{ u.handle }}</div></div></a>
                  @switch (relation(u)) {
                    @case ('me') { <span class="tag tag-plain">You</span> }
                    @case ('friend') { <span class="tag tag-free">Friend</span> }
                    @case ('sent') { <span class="tag tag-cyan">Requested</span> }
                    @case ('incoming') { <button class="qbtn" (click)="acceptFrom(u)"><app-icon name="check" />Accept</button> }
                    @default { <button class="qbtn" [disabled]="busy() === u.id" (click)="add(u)"><app-icon name="plus" />Add</button> }
                  }
                  @if (relation(u) !== 'me') { <ng-container *ngTemplateOutlet="more; context: { $implicit: u }" /> }
                </div>
              } @empty {
                <div class="px-3.5 py-4 text-[13px] text-mute">{{ searching() ? 'Searching…' : 'No one found.' }}</div>
              }
            </div>
          }
        </div>
      }

      @if (incoming().length) {
        <div class="pad mt-5">
          <div class="lbl mb-2">Requests · {{ incoming().length }}</div>
          <div class="card divide-y divide-line">
            @for (r of incoming(); track r.id) {
              <div class="flex items-center gap-3 px-3.5 h-[58px]">
                <a class="flex items-center gap-3 flex-1 min-w-0" [routerLink]="['/u', r.from.id]"><app-avatar [url]="r.from.avatarUrl" [name]="r.from.displayName" [size]="36" />
                <div class="flex-1 min-w-0"><div class="font-bold text-[14.5px] leading-tight truncate">{{ r.from.displayName }}</div><div class="text-[12px] text-mute truncate">&#64;{{ r.from.handle }}</div></div></a>
                @if (pro()) {
                  <button class="qbtn" [disabled]="busy() === r.id" (click)="accept(r)"><app-icon name="check" />Accept</button>
                } @else {
                  <button class="tag tag-pro" (click)="paywall()">Go PRO to accept</button>
                }
                <button class="circ !w-8 !h-8" [disabled]="busy() === r.id" (click)="decline(r)" aria-label="Decline"><app-icon name="close" [size]="15" /></button>
                <ng-container *ngTemplateOutlet="more; context: { $implicit: r.from }" />
              </div>
            }
          </div>
        </div>
      }

      @if (outgoing().length) {
        <div class="pad mt-5">
          <div class="lbl mb-2">Sent</div>
          <div class="card divide-y divide-line">
            @for (r of outgoing(); track r.id) {
              <div class="flex items-center gap-3 px-3.5 h-[58px]">
                <a class="flex items-center gap-3 flex-1 min-w-0" [routerLink]="['/u', r.to.id]"><app-avatar [url]="r.to.avatarUrl" [name]="r.to.displayName" [size]="36" />
                <div class="flex-1 min-w-0"><div class="font-bold text-[14.5px] leading-tight truncate">{{ r.to.displayName }}</div><div class="text-[12px] text-mute truncate">Waiting for accept</div></div></a>
                <button class="text-[12.5px] font-bold text-mute px-2" [disabled]="busy() === r.id" (click)="decline(r)">Cancel</button>
                <ng-container *ngTemplateOutlet="more; context: { $implicit: r.to }" />
              </div>
            }
          </div>
        </div>
      }

      @if (pro()) {
        <div class="pad mt-5">
          <div class="lbl mb-2">Your friends · {{ friends().length }}</div>
          @if (loading()) {
            <div class="skeleton h-[174px]"></div>
          } @else {
            <div class="card divide-y divide-line">
              @for (u of friends(); track u.id) {
                <div class="flex items-center gap-3 px-3.5 h-[58px]">
                  <a class="flex items-center gap-3 flex-1 min-w-0" [routerLink]="['/u', u.id]"><app-avatar [url]="u.avatarUrl" [name]="u.displayName" [size]="36" />
                  <div class="flex-1 min-w-0">
                    <div class="font-bold text-[14.5px] leading-tight truncate">{{ u.displayName }}</div>
                    <div class="text-[12px] text-mute truncate">&#64;{{ u.handle }}{{ u.path ? ' · ' + (u.path === 'GAIN' ? 'Building muscle' : 'Losing weight') : '' }}</div>
                  </div></a>
                  <button class="circ !w-8 !h-8 text-mute" [disabled]="busy() === u.id" (click)="remove(u)" aria-label="Remove friend"><app-icon name="trash" [size]="15" /></button>
                  <ng-container *ngTemplateOutlet="more; context: { $implicit: u }" />
                </div>
              } @empty {
                <div class="px-3.5 py-5 text-center text-[13px] text-mute">No friends yet. Share your link or search above.</div>
              }
            </div>
          }
        </div>
      } @else {
        <div class="mx-5 mt-5">
          <app-pro-lock section="Friends" title="Drop together" icon="users"
            [text]="incoming().length ? 'Friend requests wait for you. Go PRO to accept them.' : 'Friends are part of PRO.'"
            [features]="proFeatures" />
        </div>
      }
    </div>
    <ng-template #more let-u>
      <button class="text-mute p-1 -mr-1.5 flex-none" (click)="userMenu(u)" [attr.aria-label]="'More about ' + u.displayName"><app-icon name="more" [size]="18" /></button>
    </ng-template>
  `
})
export class FriendsPage {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  private readonly prompt = inject(PromptService);
  private readonly social = inject(SocialActions);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected readonly friends = signal<UserSummary[]>([]);
  protected readonly incoming = signal<FriendRequest[]>([]);
  protected readonly outgoing = signal<FriendRequest[]>([]);
  protected readonly results = signal<UserSummary[]>([]);
  protected readonly query = signal('');
  protected readonly searching = signal(false);
  protected readonly loading = signal(true);
  protected readonly busy = signal<string | null>(null);
  protected readonly inviteUrl = signal<string | null>(null);
  protected readonly pro = this.session.pro;
  protected readonly minSearch = MIN_SEARCH;
  protected readonly proFeatures = ['Accept friend requests', 'Add friends & follow their drops', 'Verify each other’s proofs', 'Weekly leaderboards'];
  protected readonly term = computed(() => searchTerm(this.query()));
  private readonly friendIds = computed(() => new Set(this.friends().map(f => f.id)));

  constructor() {
    inject(DestroyRef).onDestroy(() => { if (this.timer) clearTimeout(this.timer); });
    const pro = this.session.pro();
    inject(PhotoLinks).onStale(() => (pro ? this.load() : this.loadRequests()));
    if (!pro) {
      void this.loadRequests();
      return;
    }
    void this.load();
    void this.api.invite().then(r => this.inviteUrl.set(r.url)).catch(e => this.toast.error(e));
  }

  protected back(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl('/squad');
  }

  protected relation(u: UserSummary): 'me' | 'friend' | 'sent' | 'incoming' | 'none' {
    if (u.id === this.session.user()?.id) return 'me';
    if (this.friendIds().has(u.id)) return 'friend';
    if (this.outgoing().some(r => r.to.id === u.id)) return 'sent';
    if (this.incoming().some(r => r.from.id === u.id)) return 'incoming';
    return 'none';
  }

  protected onQuery(q: string): void {
    this.query.set(q);
    if (this.timer) clearTimeout(this.timer);
    const term = searchTerm(q);
    if (term.length < MIN_SEARCH) {
      this.results.set([]);
      return;
    }
    this.searching.set(true);
    this.timer = setTimeout(async () => {
      try {
        const r = await this.api.searchUsers(term);
        if (searchTerm(this.query()) === term) this.results.set(r);
      } catch (e) {
        this.toast.error(e);
      } finally {
        this.searching.set(false);
      }
    }, 300);
  }

  protected paywall(): void {
    void this.router.navigateByUrl('/paywall');
  }

  protected async userMenu(u: UserSummary): Promise<void> {
    if ((await this.social.userMenu(u)) !== 'blocked') return;
    this.results.update(list => list.filter(x => x.id !== u.id));
    this.friends.update(list => list.filter(x => x.id !== u.id));
    this.incoming.update(list => list.filter(r => r.from.id !== u.id));
    this.outgoing.update(list => list.filter(r => r.to.id !== u.id));
  }

  protected async add(u: UserSummary): Promise<void> {
    await this.run(u.id, async () => {
      const r = await this.api.sendFriendRequest(u.id);
      this.outgoing.update(list => [r, ...list]);
      this.toast.show(`Request sent to ${u.displayName}.`);
    });
  }

  protected async acceptFrom(u: UserSummary): Promise<void> {
    const r = this.incoming().find(x => x.from.id === u.id);
    if (r) await this.accept(r);
  }

  protected async accept(r: FriendRequest): Promise<void> {
    await this.run(r.id, async () => {
      const friend = await this.api.acceptFriendRequest(r.id);
      this.incoming.update(list => list.filter(x => x.id !== r.id));
      this.friends.update(list => [friend, ...list.filter(x => x.id !== friend.id)]);
      this.toast.show(`${friend.displayName} joined your community.`);
    });
  }

  protected async decline(r: FriendRequest): Promise<void> {
    const sent = this.outgoing().some(x => x.id === r.id);
    const name = sent ? r.to.displayName : r.from.displayName;
    const ok = sent
      ? await this.prompt.confirm('Cancel friend request?', `Your request to ${name} will be withdrawn.`, 'Cancel request', 'Keep')
      : await this.prompt.confirm('Decline friend request?', `${name} won't be added to your friends.`, 'Decline', 'Cancel');
    if (!ok) return;
    await this.run(r.id, async () => {
      await this.api.deleteFriendRequest(r.id);
      this.incoming.update(list => list.filter(x => x.id !== r.id));
      this.outgoing.update(list => list.filter(x => x.id !== r.id));
    });
  }

  protected async remove(u: UserSummary): Promise<void> {
    const ok = await this.prompt.confirm(`Remove ${u.displayName}?`, 'They will be removed from your friends. You can add each other again later.', 'Remove', 'Cancel');
    if (!ok) return;
    await this.run(u.id, async () => {
      await this.api.removeFriend(u.id);
      this.friends.update(list => list.filter(x => x.id !== u.id));
    });
  }

  protected async share(): Promise<void> {
    const url = this.inviteUrl();
    if (!url) return;
    const res = await shareOrCopy({ title: 'DropZone', text: 'Drop with me on DropZone. Earn your scroll.', url });
    if (res === 'copied') this.toast.show('Invite link copied.');
    else if (res === 'failed') this.toast.show(url);
  }

  protected async copy(): Promise<void> {
    const url = this.inviteUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.toast.show('Invite link copied.');
    } catch {
      this.toast.show(url);
    }
  }

  private async load(): Promise<void> {
    try {
      const [friends, requests] = await Promise.all([this.api.friends(), this.api.friendRequests()]);
      this.friends.set(friends);
      this.incoming.set(requests.incoming);
      this.outgoing.set(requests.outgoing);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadRequests(): Promise<void> {
    try {
      const requests = await this.api.friendRequests();
      this.incoming.set(requests.incoming);
      this.outgoing.set(requests.outgoing);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  private async run(id: string, fn: () => Promise<void>): Promise<void> {
    this.busy.set(id);
    try {
      await fn();
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(null);
    }
  }
}
