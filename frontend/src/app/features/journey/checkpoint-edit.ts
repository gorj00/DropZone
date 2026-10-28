import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { isProRequired } from '../../core/api/errors';
import { CheckpointPatch, Goal, PhotoCredit, PostVisibility, Verification } from '../../core/api/models';
import { AudienceService } from '../../core/audience';
import { samePhoto } from '../../core/photo-links';
import { boundsError, rangeText } from '../../core/plausibility';
import { SessionStore } from '../../core/session.store';
import { GoalStore, localDate } from '../../core/stores';
import { ToastService } from '../../core/toast.service';
import { UnitsService } from '../../core/units';
import { ProTag } from '../../ui/bits';
import { Icon } from '../../ui/icon';
import { effectiveVerification, milestoneError, milestoneRange } from './goal-plan';
import { delta, longDate, pad } from './journey.util';
import { RewardPhoto, RewardPhotoPicker, trackUnsplashDownload } from './reward-photo-picker';
import { COMMUNITY_NEEDS_SHARING, MILESTONE_VISIBILITY, visibilityBlock, visibilityOf } from './visibility';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, ProTag, RewardPhotoPicker],
  template: `
    <div class="screen">
      <div class="pad pt-3 h-[62px] flex items-center gap-3">
        <button class="circ" (click)="close()" aria-label="Close"><app-icon name="close" /></button>
        <div class="h text-[26px] truncate">Milestone {{ cp() ? pad(cp()!.index) : '' }}</div>
      </div>

      @if (cp(); as c) {
        <div class="pad mt-2">
          <label class="lbl mb-1.5 block" for="reward">Reward</label>
          <input id="reward" class="field" maxlength="60" placeholder="New running shoes" [value]="title()" (input)="onTitle($event)">
          @if (nameMissing()) {
            <p class="text-[12px] mt-1.5 leading-snug text-accent font-semibold">Name your reward to save its photo.</p>
          }
        </div>

        @if (targetEditable()) {
          <div class="pad mt-4">
            <label class="lbl mb-1.5 block" for="target">Target</label>
            <span class="relative block">
              <input id="target" class="field num !pr-12" type="text" inputmode="decimal" [value]="targetText()" (input)="targetText.set($any($event.target).value)">
              <span class="lbl absolute right-4 top-1/2 -translate-y-1/2">{{ unitLabel() }}</span>
            </span>
            <p class="text-[12px] mt-1.5 leading-snug" [class.text-accent]="!!targetError()" [class.font-semibold]="!!targetError()" [class.text-mute]="!targetError()">{{ targetError() ?? targetHint() }}</p>
          </div>
        }

        <div class="pad mt-4">
          <app-reward-photo-picker [selected]="photo()" [selectedCredit]="c.rewardImageCredit" [initialQuery]="c.rewardTitle ?? ''" (picked)="onPicked($event)" (uploadingChange)="uploading.set($event)" />
        </div>

        <div class="pad mt-4">
          <div class="lbl mb-2">Who can see it</div>
          <div class="space-y-2" role="radiogroup" aria-label="Who can see it">
            @for (v of visibilities; track v.id) {
              @let block = blockOf(v.id);
              <button class="w-full p-3 flex gap-3 items-center text-left disabled:opacity-50" [class]="visibility() === v.id ? 'card-hi' : 'card'" style="border-radius:14px"
                role="radio" [attr.aria-checked]="visibility() === v.id" [attr.data-test]="'vis-' + v.id" [disabled]="!!block && block !== 'PRO'" (click)="setVisibility(v.id)">
                <span class="radio" [class.on]="visibility() === v.id" style="width:18px;height:18px"></span>
                <span class="inline-flex text-mute"><app-icon [name]="v.icon" [size]="17" /></span>
                <span class="flex-1 min-w-0">
                  <span class="font-bold text-[14.5px] flex items-center gap-1.5">{{ v.label }}@if (v.pro && !pro()) { <app-pro-tag /> }</span>
                  <span class="block text-[12px] text-mute">{{ v.hint.replace('{delta}', goal() ? delta(goal()!, c.deltaToEarn) : 'your progress') }}</span>
                </span>
              </button>
            }
          </div>
          @if (visibilityHint(); as h) {
            <p class="text-[12px] text-mute mt-2 flex items-start gap-1.5" data-test="visibility-hint"><app-icon name="flag" [size]="13" />{{ h }}</p>
          }
        </div>

        <div class="pad mt-4">
          <div class="lbl mb-2">Unlock verification</div>
          <div class="grid grid-cols-2 gap-2">
            <button class="p-3 flex gap-2.5 items-start text-left" [class]="verification() === 'AI' ? 'card-hi' : 'card'" style="border-radius:14px" [disabled]="verifyLocked()" (click)="setVerification('AI')">
              <span class="radio" [class.on]="verification() === 'AI'" style="width:18px;height:18px"></span>
              <span>
                <span class="font-bold text-[14px] flex items-center gap-1.5"><app-icon name="ai" [size]="15" class="text-accent2" />AI check</span>
                <span class="block text-[11.5px] text-mute mt-0.5">{{ visibility() !== 'PRIVATE' ? 'Instant · scale photo stays private' : 'Instant, private' }}</span>
              </span>
            </button>
            <button class="p-3 flex gap-2.5 items-start text-left disabled:opacity-50" [class]="verification() === 'COMMUNITY' ? 'card-hi' : 'card'" style="border-radius:14px" data-test="community"
              [disabled]="verifyLocked() || visibility() === 'PRIVATE'" (click)="setVerification('COMMUNITY')">
              <span class="radio" [class.on]="verification() === 'COMMUNITY'" style="width:18px;height:18px"></span>
              <span>
                <span class="font-bold text-[14px] flex items-center gap-1.5"><app-icon name="users" [size]="15" class="text-accent" />Community<app-icon name="crown" [size]="12" class="text-gold" /></span>
                <span class="block text-[11.5px] text-mute mt-0.5">{{ visibility() === 'EVERYONE' ? 'Public · 3 verifies' : visibility() === 'FRIENDS' ? '3 friends verify' : 'Shared milestones only' }}</span>
              </span>
            </button>
          </div>
          @if (verifyLocked()) {
            <p class="text-[12px] text-mute mt-2">Verification can't change once proof is submitted.</p>
          } @else if (visibility() === 'PRIVATE') {
            <p class="text-[12px] text-mute mt-2" data-test="community-hint">{{ communityHint }}</p>
          } @else if (verification() === 'COMMUNITY') {
            <p class="text-[12px] text-mute mt-2">{{ visibility() === 'EVERYONE' ? 'Anyone on PRO can verify it.' : 'Your friends verify it.' }} Your scale photo is shown to the people who verify it.</p>
          }
        </div>

        <div class="mx-5 mt-4 card divide-y divide-line">
          <div class="px-3.5 py-2">
            <div class="flex items-center gap-3 min-h-[40px]">
              <div class="qi" style="width:34px;height:34px;border-radius:10px;background:rgba(255,255,255,.06);color:var(--text)"><app-icon name="cal" [size]="17" /></div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-[15px] leading-tight">Deadline</div>
                <div class="text-[12px] text-mute">{{ deadlineOn() && deadline() ? long(deadline()) + ' · optional' : 'Optional' }}</div>
              </div>
              <button class="tog" [class.on]="deadlineOn()" role="switch" [attr.aria-checked]="deadlineOn()" aria-label="Deadline" (click)="toggleDeadline()"></button>
            </div>
            @if (deadlineOn()) {
              <input type="date" class="field mt-2" style="color-scheme: dark" [min]="today" [value]="deadline()" (change)="onDeadline($event)" aria-label="Deadline date">
            }
          </div>
        </div>

        <div class="mt-auto pad pt-6" style="padding-bottom: calc(40px + env(safe-area-inset-bottom))">
          <button class="btn btn-primary" [disabled]="saving() || uploading() || !!targetError() || nameMissing()" (click)="save()">{{ saving() ? 'Saving…' : 'Save' }}</button>
        </div>
      } @else {
        <div class="pad mt-2 space-y-3">
          <div class="skeleton h-[48px]"></div>
          <div class="skeleton h-[44px]"></div>
          <div class="grid grid-cols-3 gap-2"><div class="skeleton h-[84px]"></div><div class="skeleton h-[84px]"></div><div class="skeleton h-[84px]"></div></div>
          <div class="grid grid-cols-2 gap-2"><div class="skeleton h-[64px]"></div><div class="skeleton h-[64px]"></div></div>
          <div class="skeleton h-[112px]"></div>
        </div>
      }
    </div>
  `
})
export class CheckpointEditPage {
  private readonly goals = inject(GoalStore);
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly audience = inject(AudienceService);

  readonly id = input.required<string>();

  protected readonly pad = pad;
  protected readonly visibilities = MILESTONE_VISIBILITY;
  protected readonly communityHint = COMMUNITY_NEEDS_SHARING;
  protected readonly pro = this.session.pro;
  private readonly units = inject(UnitsService);
  protected readonly delta = (g: Goal, v: number) => delta(g, v, this.units.units());
  protected readonly long = longDate;
  protected readonly today = localDate();

  protected readonly goal = this.goals.goal;
  protected readonly cp = computed(() => this.goal()?.checkpoints.find(c => c.id === this.id()) ?? null);
  protected readonly verifyLocked = computed(() => {
    const s = this.cp()?.status;
    return s === 'PENDING_VERIFICATION' || s === 'CLEARED';
  });

  protected readonly title = signal('');
  protected readonly photo = signal<string | null>(null);
  protected readonly nameMissing = computed(() => !!this.photo() && !this.title().trim());
  private readonly unsplashId = signal<string | null>(null);
  private readonly credit = signal<PhotoCredit | null>(null);
  private shownVerification: Verification = 'AI';
  protected readonly uploading = signal(false);
  protected readonly verification = signal<Verification>('AI');
  protected readonly visibility = signal<PostVisibility>('PRIVATE');
  private readonly savedVisibility = computed<PostVisibility>(() => {
    const c = this.cp();
    return c ? visibilityOf(c) : 'PRIVATE';
  });
  protected readonly visibilityHint = computed(() => {
    const blocks = this.visibilities.map(v => this.blockOf(v.id)).filter((b): b is string => !!b && b !== 'PRO');
    return blocks[0] ?? null;
  });
  protected readonly deadlineOn = signal(false);
  protected readonly deadline = signal('');
  protected readonly saving = signal(false);
  protected readonly targetText = signal('');
  protected readonly unitLabel = computed(() => this.units.label(this.goal()?.unit ?? 'kg'));
  protected readonly targetEditable = computed(() => {
    const s = this.cp()?.status;
    return s === 'ACTIVE' || s === 'LOCKED';
  });
  private readonly range = computed(() => {
    const g = this.goal();
    const c = this.cp();
    return g && c ? milestoneRange(g, c) : null;
  });
  private readonly targetValue = computed(() => {
    const v = parseFloat(this.targetText().replace(',', '.'));
    return Number.isFinite(v) && v > 0 ? this.units.toMetric(v, this.goal()?.unit ?? 'kg') : null;
  });
  private readonly targetChanged = computed(() => {
    const c = this.cp();
    const v = this.targetValue();
    return !!c && v !== null && Math.abs(v - c.targetValue) > 0.01;
  });
  protected readonly targetError = computed(() => {
    const g = this.goal();
    const c = this.cp();
    if (!g || !c || !this.targetEditable()) return null;
    const v = this.targetValue();
    if (v === null) return 'Enter a target.';
    if (!this.targetChanged()) return null;
    return boundsError(g.metric, v, this.units.units(), 'Target') ?? milestoneError(g, c, v, x => this.show(x));
  });
  protected readonly targetHint = computed(() => {
    const r = this.range();
    const g = this.goal();
    if (!r || !g) return '';
    if (r.last) return `This is your goal target (${rangeText(g.metric, this.units.units())}). Changing it re-spreads the milestones you haven't reached yet.`;
    return `Between ${this.show(r.previous)} and ${this.show(r.next!)}.`;
  });

  private inited = false;

  constructor() {
    if (!this.goal()) void this.goals.load();
    effect(() => {
      const c = this.cp();
      if (!c || this.inited) return;
      this.inited = true;
      this.title.set(c.rewardTitle ?? '');
      this.photo.set(c.rewardImageUrl);
      this.credit.set(c.rewardImageCredit ?? null);
      this.shownVerification = effectiveVerification(c, this.session.pro());
      this.verification.set(this.shownVerification);
      this.visibility.set(visibilityOf(c));
      this.deadlineOn.set(!!c.deadline);
      this.deadline.set(c.deadline ?? '');
      this.targetText.set(this.units.fmt(c.targetValue, this.goal()?.unit ?? 'kg'));
    });
  }

  protected close(): void {
    void this.router.navigate(['/journey', this.id()], { replaceUrl: true });
  }

  protected onTitle(e: Event): void {
    this.title.set((e.target as HTMLInputElement).value);
  }

  protected onPicked(t: RewardPhoto | null): void {
    this.photo.set(t?.url ?? null);
    this.unsplashId.set(t?.unsplashId ?? null);
    this.credit.set(t?.credit ?? null);
  }

  protected blockOf(v: PostVisibility): 'PRO' | string | null {
    const c = this.cp();
    if (!c) return null;
    const pendingCommunity = c.status === 'PENDING_VERIFICATION' && c.requiredVerifications > 0;
    return visibilityBlock(this.savedVisibility(), v, { pro: this.session.pro(), moderation: c.moderation, pendingCommunity });
  }

  protected setVisibility(v: PostVisibility): void {
    const block = this.blockOf(v);
    if (block === 'PRO') {
      void this.router.navigateByUrl('/paywall');
      return;
    }
    if (block) return;
    this.visibility.set(v);
    if (v === 'PRIVATE' && !this.verifyLocked() && this.verification() === 'COMMUNITY') this.verification.set('AI');
  }

  protected async setVerification(v: Verification): Promise<void> {
    if (v === 'COMMUNITY' && !this.session.pro()) {
      void this.router.navigateByUrl('/paywall');
      return;
    }
    if (v === 'AI') {
      this.verification.set(v);
      return;
    }
    if (this.visibility() === 'PRIVATE') return;
    const shared = this.visibility() === 'EVERYONE' ? 'EVERYONE' : 'FRIENDS';
    const pick = await this.audience.choose('milestone', shared);
    if (pick !== 'FRIENDS' && pick !== 'EVERYONE') return;
    const block = this.blockOf(pick);
    if (block === 'PRO') {
      void this.router.navigateByUrl('/paywall');
      return;
    }
    if (block) {
      this.toast.show(block, true);
      return;
    }
    this.visibility.set(pick);
    this.verification.set('COMMUNITY');
  }

  protected toggleDeadline(): void {
    const on = !this.deadlineOn();
    this.deadlineOn.set(on);
    if (on && !this.deadline()) this.deadline.set(localDate(new Date(Date.now() + 30 * 86_400_000)));
  }

  protected onDeadline(e: Event): void {
    this.deadline.set((e.target as HTMLInputElement).value);
  }

  protected async save(): Promise<void> {
    const c = this.cp();
    if (!c) return;
    const patch: CheckpointPatch = {
      rewardTitle: this.title().trim() || null,
      deadline: this.deadlineOn() && this.deadline() ? this.deadline() : null
    };
    if (!samePhoto(this.photo(), c.rewardImageUrl)) {
      patch.rewardImageUrl = this.photo();
      patch.rewardImageCredit = this.photo() ? this.credit() : null;
    }
    if (this.visibility() !== this.savedVisibility()) patch.visibility = this.visibility();
    if (!this.verifyLocked() && this.verification() !== this.shownVerification) patch.verification = this.verification();
    const retarget = this.targetEditable() && this.targetChanged() ? this.targetValue() : null;
    if (retarget !== null) patch.targetValue = retarget;
    this.saving.set(true);
    try {
      await this.goals.update(c.id, patch);
      if (retarget !== null && this.range()?.last) await this.goals.load();
      this.trackDownload();
      this.toast.show('Milestone reward saved.');
      this.close();
    } catch (e) {
      if (isProRequired(e)) void this.router.navigateByUrl('/paywall');
      else this.toast.error(e);
    } finally {
      this.saving.set(false);
    }
  }

  private show(v: number): string {
    return `${this.units.fmt(v, this.goal()?.unit ?? 'kg')} ${this.unitLabel()}`;
  }

  private trackDownload(): void {
    if (this.photo() !== null) trackUnsplashDownload(this.api, this.unsplashId());
  }
}
