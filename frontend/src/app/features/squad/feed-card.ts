import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { isProRequired } from '../../core/api/errors';
import { FeedItem } from '../../core/api/models';
import { ChoiceOption, PromptService } from '../../core/prompt.service';
import { SessionStore } from '../../core/session.store';
import { SocialActions } from '../../core/social';
import { GoalStore, TodayStore } from '../../core/stores';
import { ToastService } from '../../core/toast.service';
import { UnitsService } from '../../core/units';
import { Avatar } from '../../ui/bits';
import { Badge } from '../../ui/badge';
import { Icon } from '../../ui/icon';
import { ReportedFlag } from '../../ui/reported-flag';
import { TransformationViewer } from '../../ui/transformation-viewer';
import { CommentsSheet } from './comments';
import { ago } from './in-view';

@Component({
  selector: 'app-feed-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, Badge, Icon, TransformationViewer, CommentsSheet, ReportedFlag],
  template: `
    @let f = item();
    @if (f.type === 'CHECKPOINT_CLEARED') {
      <div class="card-gold p-3 !rounded-[18px]">
        <div class="flex items-center gap-3">
          <div class="w-[54px] h-[54px] rounded-[12px] overflow-hidden flex-none grid place-items-center bg-s2">
            @if (f.photoUrl) { <img class="ph" [src]="f.photoUrl" alt="" loading="lazy"> } @else { <app-badge tone="gold" [size]="34" icon="trophy" /> }
          </div>
          <div class="flex-1 min-w-0">
            <div class="lbl flex items-center gap-1 !text-gold !text-[10px]"><app-icon name="trophy" [size]="12" /><span class="truncate">{{ f.title }}</span></div>
            <div class="font-bold text-[14.5px] leading-tight mt-1 truncate">{{ f.user.displayName }}</div>
            <div class="text-[12px] text-mute truncate">{{ subtitle() }}</div>
          </div>
          <button class="relative w-10 h-10 rounded-xl grid place-items-center flex-none text-gold border border-[rgba(var(--gold-rgb),.35)]"
            [style.background]="f.hypedByMe ? 'var(--gold-grad)' : 'rgba(var(--gold-rgb),.12)'" [style.color]="f.hypedByMe ? '#2a1a00' : null"
            [attr.aria-busy]="hyping()" (click)="hype()" aria-label="Hype">
            <app-icon name="bolt" [size]="18" />
            @if (f.hypeCount) { <span class="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-s3 text-ink text-[10px] font-bold grid place-items-center">{{ f.hypeCount }}</span> }
          </button>
        </div>
        @if (reported()) {
          <div class="mt-2.5"><app-reported-flag [state]="f.moderation" /></div>
        }
        <div class="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-[rgba(var(--gold-rgb),.2)]">
          @if (f.hidden && !reported()) { <span class="chip !text-accent"><app-icon name="eyeoff" />HIDDEN · IN REVIEW</span> }
          <button class="flex items-center gap-1.5 text-[13px] font-semibold text-mute" (click)="openComments()"><app-icon name="comment" [size]="16" />{{ commentLabel() }}</button>
          <button class="ml-auto text-mute p-1" [disabled]="busy()" (click)="menu()" aria-label="More"><app-icon name="more" [size]="18" /></button>
        </div>
      </div>
    } @else {
      <div class="card overflow-hidden">
        <div class="flex items-center gap-2.5 px-3.5 h-[56px]">
          <app-avatar [url]="f.user.avatarUrl" [name]="f.user.displayName" [size]="36" />
          <div class="flex-1 min-w-0">
            <div class="font-bold text-[14.5px] leading-tight truncate">{{ f.user.displayName }}</div>
            <div class="text-[12px] text-mute truncate">{{ f.title }} · {{ ago(f.createdAt) }}</div>
          </div>
          @if (f.verification?.canVerify && !f.verification?.verifiedByMe) {
            <button class="qbtn !h-[30px]" [disabled]="busy()" (click)="verify()"><app-icon name="check" />Verify</button>
          } @else if (f.type === 'CHECKPOINT_PROOF') {
            <span class="chip !text-gold"><app-icon name="flag" />MILESTONE</span>
          } @else if (f.type === 'TRANSFORMATION') {
            <span class="chip !text-accent2"><app-icon name="trend" />BEFORE · AFTER</span>
          }
          <button class="text-mute p-1 -mr-1" [disabled]="busy()" (click)="menu()" aria-label="More"><app-icon name="more" [size]="18" /></button>
        </div>
        @if (f.transformation; as t) {
          <app-transformation-viewer [t]="t" [height]="300" />
        } @else if (f.photoUrl) {
          <div class="h-[168px] relative bg-s2"><img class="ph" [src]="f.photoUrl" alt="" loading="lazy"></div>
        }
        @if (reported()) {
          <div class="px-3.5 pt-3"><app-reported-flag [state]="f.moderation" /></div>
        }
        <div class="flex items-center gap-2 px-3.5 h-[48px]">
          @if (f.hidden && !reported()) {
            <span class="chip !text-accent"><app-icon name="eyeoff" />HIDDEN · IN REVIEW</span>
          } @else if (f.type === 'QUEST_PROOF' && f.aiChecked) {
            <span class="chip !text-accent2" data-test="ai-chip"><app-icon name="ai" />AI VERIFIED</span>
          } @else if (f.type !== 'TRANSFORMATION' && f.subtitle) {
            <span class="text-[12px] text-mute truncate">{{ subtitle() }}</span>
          }
          @if (f.verification; as v) {
            @if (v.count >= v.required) {
              <span class="chip !text-ok !bg-[rgba(var(--ok-rgb),.08)] !border-[rgba(var(--ok-rgb),.25)]"><app-icon name="check" />VERIFIED {{ v.count }}/{{ v.required }}</span>
            } @else {
              <span class="chip !text-gold"><app-icon name="hourglass" />{{ v.count }}/{{ v.required }}{{ v.verifiedByMe ? ' · YOU' : '' }}</span>
            }
          }
          <button class="ml-auto flex items-center gap-1 num text-[15px] text-mute" (click)="openComments()" aria-label="Comments">
            <app-icon name="comment" [size]="16" />{{ f.commentCount }}
          </button>
          <button class="flex items-center gap-1 num text-[15px] ml-2" [class.text-accent]="f.hypedByMe" [class.text-mute]="!f.hypedByMe" [attr.aria-busy]="hyping()" (click)="hype()" aria-label="Hype">
            <span class="inline-flex text-accent"><app-icon name="bolt" [size]="16" /></span>{{ f.hypeCount }}
          </button>
        </div>
      </div>
    }
    @if (commentsOpen()) {
      <app-comments-sheet [feedItemId]="f.id" (closed)="commentsOpen.set(false)" (count)="setCount($event)" (blocked)="blocked.emit($event)" />
    }
  `
})
export class FeedCard {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly social = inject(SocialActions);
  private readonly prompt = inject(PromptService);
  private readonly toast = inject(ToastService);
  private readonly units = inject(UnitsService);
  private readonly router = inject(Router);
  private readonly today = inject(TodayStore);
  private readonly goals = inject(GoalStore);

  readonly item = input.required<FeedItem>();
  readonly changed = output<FeedItem>();
  readonly removed = output<string>();
  readonly blocked = output<string>();
  readonly verified = output<void>();

  protected readonly ago = ago;
  protected readonly busy = signal(false);
  protected readonly hyping = signal(false);
  protected readonly commentsOpen = signal(false);
  protected readonly mine = computed(() => this.item().user.id === this.session.user()?.id);
  protected readonly reported = computed(() => this.mine() && !!this.item().moderation);
  protected readonly commentLabel = computed(() => {
    const n = this.item().commentCount;
    return n ? `${n} ${n === 1 ? 'comment' : 'comments'}` : 'Comment';
  });
  protected readonly subtitle = computed(() => {
    const f = this.item();
    if (f.value !== null) return this.units.withNote(f.value, f.subtitle, f.unit) ?? '';
    if (f.subtitle) return f.subtitle;
    if (f.deltaValue !== null) return `${f.deltaValue > 0 ? '+' : '−'}${this.units.amount(Math.abs(f.deltaValue), f.unit)} to earn`;
    return ago(f.createdAt);
  });

  protected openComments(): void {
    if (!this.session.pro() && !this.mine()) {
      void this.router.navigateByUrl('/paywall');
      return;
    }
    this.commentsOpen.set(true);
  }

  protected setCount(n: number): void {
    this.changed.emit({ ...this.item(), commentCount: n });
  }

  protected async verify(): Promise<void> {
    const f = this.item();
    if (!f.proofId) return;
    this.busy.set(true);
    try {
      this.changed.emit(await this.api.verifyProof(f.proofId));
      this.verified.emit();
      this.toast.show('Verified. Thanks for keeping it real.');
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected async hype(): Promise<void> {
    if (this.hyping()) return;
    this.hyping.set(true);
    const f = this.item();
    this.changed.emit({ ...f, hypedByMe: !f.hypedByMe, hypeCount: Math.max(0, f.hypeCount + (f.hypedByMe ? -1 : 1)) });
    try {
      this.changed.emit(await this.api.hype(f.id));
    } catch (e) {
      this.changed.emit(f);
      this.toast.error(e);
    } finally {
      this.hyping.set(false);
    }
  }

  protected async menu(): Promise<void> {
    const f = this.item();
    if (this.mine()) {
      await this.ownMenu(f);
      return;
    }
    if ((await this.social.menu('POST', f.id, f.user)) === 'blocked') this.blocked.emit(f.user.id);
  }

  private async ownMenu(f: FeedItem): Promise<void> {
    const options: ChoiceOption[] = [];
    if (f.isPublic) options.push({ key: 'private', label: 'Friends only', icon: 'users' });
    options.push({ key: 'delete', label: 'Delete post', icon: 'trash', danger: true });
    const action = await this.prompt.choose('Your post', options, f.isPublic ? 'Everyone can see this post.' : 'Only your friends can see this post.');
    if (action === 'private') await this.makePrivate(f);
    else if (action === 'delete') await this.remove(f);
  }

  private async makePrivate(f: FeedItem): Promise<void> {
    await this.run(async () => {
      const updated = await this.api.updateFeedItem(f.id, { isPublic: false });
      this.changed.emit(updated);
      if (f.type === 'CHECKPOINT_PROOF' || f.type === 'CHECKPOINT_CLEARED') void this.goals.load();
      this.toast.show('Only your friends can see this post now.');
    });
  }

  private async remove(f: FeedItem): Promise<void> {
    const pending = !!f.verification && f.verification.count < f.verification.required;
    const ok = await this.prompt.confirm('Delete this post?',
      pending ? 'Its comments and hypes are removed too, and the proof is cancelled. You can send a new one.' : 'Its comments and hypes are removed too. This cannot be undone.',
      'Delete', 'Cancel');
    if (!ok) return;
    await this.run(async () => {
      await this.api.deleteFeedItem(f.id);
      this.removed.emit(f.id);
      if (f.proofId) {
        void this.today.load().catch(() => undefined);
        void this.goals.load();
      }
      this.toast.show('Post deleted.');
    });
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
