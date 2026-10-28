import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { isProRequired } from '../../core/api/errors';
import { HiddenReason, ProofView } from '../../core/api/models';
import { proofLink, shareOrCopy } from '../../core/native/share';
import { PhotoLinks } from '../../core/photo-links';
import { SessionStore } from '../../core/session.store';
import { SocialActions } from '../../core/social';
import { ToastService } from '../../core/toast.service';
import { UnitsService } from '../../core/units';
import { Avatar } from '../../ui/bits';
import { Badge } from '../../ui/badge';
import { Icon } from '../../ui/icon';
import { PendingActions } from '../../ui/pending-actions';
import { ReportedFlag } from '../../ui/reported-flag';
import { ProLock } from '../paywall/pro-lock';
import { CommentsSheet } from './comments';
import { ago } from './in-view';

export function proofHiddenText(reason: HiddenReason | null, owner: string): string {
  switch (reason) {
    case 'UNDER_REVIEW': return 'This post is under review.';
    case 'REMOVED': return 'This post was removed.';
    default: return `Only ${owner}'s friends can see and verify this proof. Add them to drop together.`;
  }
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar, Badge, Icon, ProLock, CommentsSheet, PendingActions, ReportedFlag],
  template: `
    <div class="screen">
      <div class="pad pt-3 flex items-center gap-3">
        <button class="circ" (click)="back()" aria-label="Back"><app-icon name="back" /></button>
        <div class="h text-[26px] flex-1">Proof</div>
        @if (view(); as v) {
          @if (v.relation === 'SELF') {
            @if (shareable(v)) { <button class="circ" [disabled]="busy()" (click)="share()" aria-label="Share"><app-icon name="share" /></button> }
          } @else {
            <button class="circ" [disabled]="busy()" (click)="ownerMenu()" aria-label="More"><app-icon name="more" /></button>
          }
        }
      </div>

      @if (locked()) {
        <div class="mx-5 mt-6">
          <app-pro-lock section="Community" title="Verify your community" icon="users"
            text="Proofs, verifying and hypes are part of DropZone PRO."
            [features]="['Verify proofs from friends', 'Hype their drops', 'Share your own milestone rewards']" />
        </div>
      } @else if (missing()) {
        <div class="pad flex-1 flex flex-col items-center justify-center text-center pb-24">
          <app-badge tone="off" [size]="68" icon="lock" />
          <div class="h text-[26px] mt-5">Proof not found</div>
          <p class="text-[14px] text-mute mt-2">The link may be wrong, or the proof was removed.</p>
          <a class="btn btn-ghost mt-6 max-w-[280px]" routerLink="/squad">Go to Community</a>
        </div>
      } @else if (view(); as v) {
        @if (v.visible && v.post; as p) {
          <div class="mx-5 mt-4 card overflow-hidden">
            <div class="flex items-center gap-2.5 px-3.5 h-[60px]">
              <app-avatar [url]="v.owner.avatarUrl" [name]="v.owner.displayName" [size]="38" />
              <div class="flex-1 min-w-0">
                <div class="font-bold text-[15px] leading-tight truncate">{{ v.owner.displayName }}</div>
                <div class="text-[12px] text-mute truncate">{{ p.title }} · {{ ago(p.createdAt) }}</div>
              </div>
              @if (p.type !== 'QUEST_PROOF') { <span class="chip !text-gold"><app-icon name="flag" />MILESTONE</span> }
            </div>
            @if (p.photoUrl) {
              <div class="h-[300px] relative bg-s2"><img class="ph" [src]="p.photoUrl" alt="Proof photo"></div>
            }
            <div class="px-3.5 py-3">
              @if (p.value !== null) {
                <div class="num text-[26px] leading-none text-ok">{{ u.amount(p.value, p.unit) }}</div>
              }
              @if (p.subtitle) { <div class="text-[13px] text-mute" [class.mt-1]="p.value !== null">{{ p.subtitle }}</div> }
              @if (p.deltaValue !== null && p.unit) {
                <div class="num text-[26px] leading-none mt-1.5 text-ok">{{ p.deltaValue > 0 ? '+' : '−' }}{{ u.amount(abs(p.deltaValue), p.unit) }}</div>
              }
              @if (p.verification; as ver) {
                <div class="flex items-center gap-2 mt-3">
                  @for (done of slots(); track $index) {
                    <span class="w-9 h-9 rounded-full grid place-items-center border" [class.border-dashed]="!done"
                      [style.background]="done ? 'rgba(var(--ok-rgb),.14)' : null" [style.border-color]="done ? 'rgba(var(--ok-rgb),.5)' : 'var(--line)'">
                      @if (done) { <span class="text-ok inline-flex"><app-icon name="check" [size]="16" /></span> }
                    </span>
                  }
                  <span class="text-[12.5px] text-mute ml-1 leading-tight">
                    @if (ver.count >= ver.required) { Verified by the community } @else { {{ ver.required - ver.count }} more {{ ver.required - ver.count === 1 ? 'verify' : 'verifies' }} needed }
                  </span>
                </div>
              }
            </div>
            <div class="flex items-center gap-2 px-3.5 h-[48px] border-t border-line">
              @if (v.status === 'VERIFIED') {
                <span class="chip !text-ok !bg-[rgba(var(--ok-rgb),.08)] !border-[rgba(var(--ok-rgb),.25)]"><app-icon name="check" />VERIFIED</span>
              } @else if (v.status === 'REJECTED') {
                <span class="chip !text-accent"><app-icon name="close" />REMOVED</span>
              } @else if (v.status === 'WITHDRAWN') {
                <span class="chip"><app-icon name="close" />WITHDRAWN</span>
              } @else {
                <span class="chip !text-gold"><app-icon name="hourglass" />WAITING</span>
              }
              @if (p.id) {
                <button class="ml-auto flex items-center gap-1 num text-[15px] text-mute" (click)="openComments()" aria-label="Comments">
                  <app-icon name="comment" [size]="16" />{{ p.commentCount }}
                </button>
                <button class="ml-2 flex items-center gap-1 num text-[15px]" [class.text-accent]="p.hypedByMe" [class.text-mute]="!p.hypedByMe" [disabled]="busy()" (click)="hype()" aria-label="Hype">
                  <span class="inline-flex text-accent"><app-icon name="bolt" [size]="16" /></span>{{ p.hypeCount }}
                </button>
              }
            </div>
          </div>

          @if (commentsOpen() && p.id) {
            <app-comments-sheet [feedItemId]="p.id" (closed)="commentsOpen.set(false)" (count)="setCommentCount($event)" />
          }
          @if (v.relation === 'SELF' && v.moderation) {
            <div class="mx-5 mt-3"><app-reported-flag [state]="v.moderation" /></div>
          }
          <div class="mt-auto pad pt-6 pb-[calc(28px+env(safe-area-inset-bottom))] space-y-3">
            @if (v.status === 'REJECTED') {
              <p class="text-[13.5px] text-mute text-center leading-snug">{{ v.relation === 'SELF' ? 'This proof was removed. Upload a new one to finish it.' : 'This proof was removed.' }}</p>
            } @else if (v.status === 'WITHDRAWN') {
              <p class="text-[13.5px] text-mute text-center leading-snug">{{ v.relation === 'SELF' ? 'You withdrew this proof. Send a new one to finish it.' : 'This proof was withdrawn.' }}</p>
            } @else if (p.verification?.canVerify) {
              @if (pro()) {
                <button class="btn btn-primary" [disabled]="busy()" (click)="verify()"><app-icon name="check" />Verify this proof</button>
              } @else {
                <a class="btn btn-gold" routerLink="/paywall"><app-icon name="crown" />Go PRO to verify</a>
              }
            } @else if (p.verification?.verifiedByMe) {
              <div class="card-ok px-4 h-[52px] flex items-center gap-3"><span class="qok"><app-icon name="check" /></span><span class="font-bold text-[14px]">You verified this proof</span></div>
            }
            @if (v.relation === 'SELF' && shareable(v)) {
              <button class="btn btn-ghost" [disabled]="busy()" (click)="share()"><app-icon name="share" />Share to get verified</button>
            }
            <app-pending-actions [view]="v" (changed)="onPendingChange($event)" />
          </div>
        } @else {
          <div class="pad flex-1 flex flex-col items-center justify-center text-center pb-24">
            <app-avatar [url]="v.owner.avatarUrl" [name]="v.owner.displayName" [size]="84" ring="var(--accent)" />
            <div class="h text-[28px] mt-4">{{ v.owner.displayName }}</div>
            <div class="text-[13px] text-mute">&#64;{{ v.owner.handle }}</div>
            <p class="text-[14px] text-mute mt-4 max-w-[290px]">{{ hiddenText() }}</p>
            @if (canAddFriend()) {
              <div class="w-full max-w-[300px] mt-6">
                @switch (v.relation) {
                  @case ('REQUESTED') {
                    <button class="btn btn-ghost" disabled><app-icon name="hourglass" />Request sent</button>
                  }
                  @case ('INCOMING') {
                    <a class="btn btn-primary" routerLink="/squad/friends"><app-icon name="userplus" />Accept their request</a>
                  }
                  @default {
                    <button class="btn btn-primary" [disabled]="busy()" (click)="addFriend()"><app-icon name="userplus" />Add friend</button>
                  }
                }
              </div>
            } @else {
              <a class="btn btn-ghost mt-6 max-w-[280px]" routerLink="/squad">Go to Community</a>
            }
          </div>
        }
      } @else {
        <div class="mx-5 mt-4 skeleton h-[420px]"></div>
      }
    </div>
  `
})
export class ProofPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly social = inject(SocialActions);

  readonly id = input.required<string>();
  protected readonly view = signal<ProofView | null>(null);
  protected readonly missing = signal(false);
  protected readonly locked = signal(false);
  protected readonly busy = signal(false);
  protected readonly commentsOpen = signal(false);
  protected readonly pro = this.session.pro;
  protected readonly ago = ago;
  protected readonly abs = Math.abs;
  protected readonly u = inject(UnitsService);
  protected readonly first = computed(() => this.view()?.owner.displayName.split(/\s+/)[0] ?? '');
  protected readonly hiddenReason = computed(() => {
    const v = this.view();
    if (!v) return null;
    return v.reason ?? (v.relation === 'FRIEND' || v.relation === 'SELF' ? 'REMOVED' : 'FRIENDS_ONLY');
  });
  protected readonly canAddFriend = computed(() => this.hiddenReason() === 'FRIENDS_ONLY' && this.view()?.relation !== 'FRIEND' && this.view()?.relation !== 'SELF');
  protected readonly hiddenText = computed(() => proofHiddenText(this.hiddenReason(), this.first()));
  protected readonly slots = computed(() => {
    const v = this.view()?.post?.verification;
    return v ? Array.from({ length: v.required }, (_, i) => i < v.count) : [];
  });

  constructor() {
    inject(PhotoLinks).onStale(() => this.load());
  }

  ngOnInit(): void {
    void this.load();
  }

  protected shareable(v: ProofView): boolean {
    return v.status !== 'REJECTED' && v.status !== 'WITHDRAWN' && !v.moderation;
  }

  protected onPendingChange(v: ProofView): void {
    if (v.status === 'WITHDRAWN') void this.router.navigateByUrl(v.kind === 'CHECKPOINT' ? '/journey' : '/today', { replaceUrl: true });
    else void this.load();
  }

  protected back(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl(this.session.user()?.onboarded ? '/squad' : '/onboarding/profile');
  }

  protected async verify(): Promise<void> {
    await this.run(async () => {
      await this.api.verifyProof(this.id());
      this.toast.show('Verified. Thanks for keeping it real.');
      await this.load();
    });
  }

  protected openComments(): void {
    if (!this.pro() && this.view()?.relation !== 'SELF') {
      void this.router.navigateByUrl('/paywall');
      return;
    }
    this.commentsOpen.set(true);
  }

  protected setCommentCount(n: number): void {
    this.view.update(v => (v?.post ? { ...v, post: { ...v.post, commentCount: n } } : v));
  }

  protected async hype(): Promise<void> {
    const p = this.view()?.post;
    if (!p?.id) return;
    if (!this.pro()) {
      void this.router.navigateByUrl('/paywall');
      return;
    }
    await this.run(async () => {
      const updated = await this.api.hype(p.id!);
      this.view.update(v => (v ? { ...v, post: updated } : v));
    });
  }

  protected async ownerMenu(): Promise<void> {
    const v = this.view();
    if (!v) return;
    if ((await this.social.userMenu(v.owner)) === 'blocked') void this.router.navigateByUrl('/squad', { replaceUrl: true });
  }

  protected async addFriend(): Promise<void> {
    if (!this.pro()) {
      this.toast.show('Friends are a PRO feature.');
      void this.router.navigateByUrl('/paywall');
      return;
    }
    const v = this.view();
    if (!v) return;
    await this.run(async () => {
      await this.api.sendFriendRequest(v.owner.id);
      this.toast.show(`Request sent to ${v.owner.displayName}.`);
      this.view.set({ ...v, relation: 'REQUESTED' });
    });
  }

  protected async share(): Promise<void> {
    const v = this.view();
    if (!v) return;
    this.busy.set(true);
    const res = await shareOrCopy({
      title: 'Verify my proof on DropZone',
      text: `Verify my ${v.post?.title ?? 'proof'} on DropZone!`,
      url: proofLink(v.id)
    });
    this.busy.set(false);
    if (res === 'copied') this.toast.show('Link copied. Send it to your friends.');
    else if (res === 'failed') this.toast.show('Could not share right now.', true);
  }

  private async load(): Promise<void> {
    try {
      this.view.set(await this.api.proof(this.id()));
    } catch (e) {
      if (isProRequired(e)) this.locked.set(true);
      else if ((e as { status?: number })?.status === 404) this.missing.set(true);
      else this.toast.error(e);
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
