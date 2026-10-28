import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { isProRequired } from '../../core/api/errors';
import { CheckAudience, ProofType, QuestGroup } from '../../core/api/models';
import { AudienceService, audienceLabel, isNeedFriends } from '../../core/audience';
import { SessionStore } from '../../core/session.store';
import { ToastService } from '../../core/toast.service';
import { ProTag } from '../../ui/bits';
import { Icon } from '../../ui/icon';

const GROUP_HINTS: Record<QuestGroup, string> = {
  BURN_FUEL: 'Burn & fuel: moving and eating well, like a workout, steps or a healthy meal.',
  BEAT_BINGE: 'Beat the binge: things that replace boredom eating, like a hobby, a movie night or meeting friends.',
  BUILD_FUEL: 'Build & fuel: training and eating more, like the gym, a protein meal or beating a lift.',
  RECOVERY: 'Recovery: rest that helps you grow, like sleep, mobility or a recovery walk.'
};

const PROOF_HINTS: Partial<Record<ProofType, string>> = {
  PHOTO: 'Photo: take a live photo when it is done. It counts as a photo proof, or 3 people verify it if Friends check is on.',
  REPS: 'Reps: do the reps in front of the camera and the app counts your squats or push-ups.',
  CHECKIN: 'Check: just tick it off when it is done. No photo needed.'
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, ProTag],
  template: `
    <div class="screen pb-[calc(24px+env(safe-area-inset-bottom))]">
      <div class="pad h-[58px] flex items-center gap-3">
        <button class="circ" (click)="close()" aria-label="Close"><app-icon name="close" /></button>
        <div class="h text-[28px] [[data-theme=stealth]_&]:text-[30px] flex-1">New quest</div>
        <app-pro-tag />
      </div>

      <div class="pad mt-2">
        <label class="lbl block mb-1.5" for="cq-name">Name</label>
        <input id="cq-name" class="field" maxlength="40" placeholder="Meal prep Sunday" [value]="name()" (input)="name.set($any($event.target).value)">
      </div>

      <div class="pad mt-3.5">
        <div class="lbl mb-2">Icon</div>
        <div class="grid grid-cols-7 gap-1.5">
          @for (i of icons; track i) {
            <button class="icon-pick" [class.on]="icon() === i" (click)="icon.set(i)" [attr.aria-label]="i"><app-icon [name]="i" /></button>
          }
        </div>
      </div>

      <div class="pad mt-3.5">
        <div class="lbl mb-2">Proof</div>
        <div class="seg3 grid-cols-3">
          @for (p of proofs; track p.id) {
            <button [class.on]="proof() === p.id" (click)="proof.set(p.id)"><app-icon [name]="p.icon" />{{ p.label }}</button>
          }
        </div>
        <p class="text-[12.5px] text-mute mt-2 leading-snug">{{ proofHint() }}</p>
      </div>

      <div class="pad mt-3.5">
        <div class="lbl mb-2">Repeat</div>
        <div class="flex justify-between">
          @for (d of week; track d.n) {
            <button class="day" [class.on]="days().includes(d.n)" (click)="toggleDay(d.n)" [attr.aria-label]="d.name">{{ d.short }}</button>
          }
        </div>
      </div>

      <div class="pad mt-3.5">
        <div class="lbl mb-2">Group</div>
        <div class="grid grid-cols-2 gap-2">
          @for (g of groups(); track g.id) {
            <button class="pick" [class.on]="group() === g.id" (click)="group.set(g.id)"><app-icon [name]="g.icon" />{{ g.label }}</button>
          }
        </div>
        <p class="text-[12.5px] text-mute mt-2 leading-snug">{{ groupHint() }}</p>
      </div>

      @if (proof() === 'PHOTO') {
        <button class="mx-5 mt-3 card flex items-center gap-3 px-3.5 h-[56px] text-left" role="switch" [attr.aria-checked]="squad()" (click)="toggleSquad()">
          <span class="qi !w-[34px] !h-[34px] !rounded-[10px] bg-[rgba(var(--accent-rgb),.14)] text-[var(--accent-light)]"><app-icon name="users" [size]="17" /></span>
          <span class="flex-1"><span class="block font-bold text-[14.5px] leading-tight">Friends check</span><span class="block text-[12px] text-mute">{{ squad() ? audienceText() + ' · 3 people verify it' : '3 people verify the photo before your streak counts it' }}</span></span>
          <span class="tog" [class.on]="squad()"></span>
        </button>
      }

      <div class="mt-auto pad pt-6"><button class="btn btn-primary" [disabled]="!valid() || saving()" (click)="save()">Add quest</button></div>
    </div>
  `
})
export class CustomQuestPage {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly audience = inject(AudienceService);

  protected readonly icons = ['meal', 'scale', 'steps', 'gym', 'bike', 'hike', 'ball', 'swim', 'palette', 'film', 'users', 'drop', 'yoga', 'protein'];
  protected readonly proofs: { id: ProofType; label: string; icon: string }[] = [
    { id: 'PHOTO', label: 'Photo', icon: 'camera' },
    { id: 'REPS', label: 'Reps', icon: 'reps' },
    { id: 'CHECKIN', label: 'Check', icon: 'check' }
  ];
  protected readonly week = [
    { n: 1, short: 'M', name: 'Monday' }, { n: 2, short: 'T', name: 'Tuesday' }, { n: 3, short: 'W', name: 'Wednesday' },
    { n: 4, short: 'T', name: 'Thursday' }, { n: 5, short: 'F', name: 'Friday' }, { n: 6, short: 'S', name: 'Saturday' },
    { n: 7, short: 'S', name: 'Sunday' }
  ];
  protected readonly groups = computed<{ id: QuestGroup; label: string; icon: string }[]>(() =>
    this.session.path() === 'GAIN'
      ? [{ id: 'BUILD_FUEL', label: 'Build & fuel', icon: 'gym' }, { id: 'RECOVERY', label: 'Recovery', icon: 'moon' }]
      : [{ id: 'BURN_FUEL', label: 'Burn & fuel', icon: 'meal' }, { id: 'BEAT_BINGE', label: 'Beat the binge', icon: 'palette' }]
  );

  protected readonly name = signal('');
  protected readonly icon = signal('meal');
  protected readonly proof = signal<ProofType>('PHOTO');
  protected readonly days = signal<number[]>([1, 2, 3, 4, 5, 6, 7]);
  protected readonly group = signal<QuestGroup>(this.groups()[0].id);
  protected readonly groupHint = computed(() => GROUP_HINTS[this.group()]);
  protected readonly proofHint = computed(() => PROOF_HINTS[this.proof()] ?? '');
  protected readonly squad = signal(false);
  protected readonly checkAudience = signal<CheckAudience>('FRIENDS');
  protected readonly audienceText = computed(() => audienceLabel(this.checkAudience()));
  protected readonly saving = signal(false);
  protected readonly valid = computed(() => this.name().trim().length > 1 && this.days().length > 0);

  constructor() {
    if (!this.session.pro()) void this.router.navigateByUrl('/paywall', { replaceUrl: true });
  }

  protected toggleDay(n: number): void {
    this.days.update(d => (d.includes(n) ? d.filter(x => x !== n) : [...d, n].sort()));
  }

  protected close(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl('/stats');
  }

  protected async toggleSquad(): Promise<void> {
    if (this.squad()) {
      this.squad.set(false);
      return;
    }
    const pick = await this.audience.choose('quest');
    if (pick !== 'FRIENDS' && pick !== 'EVERYONE') return;
    this.checkAudience.set(pick);
    this.squad.set(true);
  }

  protected async save(): Promise<void> {
    if (!this.valid() || this.saving()) return;
    this.saving.set(true);
    const squad = this.proof() === 'PHOTO' && this.squad();
    try {
      await this.api.addCustomQuest({
        name: this.name().trim(),
        icon: this.icon(),
        proof: this.proof(),
        group: this.group(),
        days: this.days(),
        squadCheck: squad,
        ...(squad ? { checkAudience: this.checkAudience() } : {})
      });
      this.toast.show('Quest added.');
      this.close();
    } catch (e) {
      if (isProRequired(e)) void this.router.navigateByUrl('/paywall');
      else if (isNeedFriends(e)) {
        this.saving.set(false);
        const instead = await this.audience.needFriends();
        if (instead) {
          this.checkAudience.set(instead);
          await this.save();
        }
      } else this.toast.error(e);
    } finally {
      this.saving.set(false);
    }
  }
}
