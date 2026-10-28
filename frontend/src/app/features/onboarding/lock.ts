import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { App as CapApp } from '@capacitor/app';
import { ApiService } from '../../core/api/api.service';
import { isProRequired } from '../../core/api/errors';
import { UnlockMode } from '../../core/api/models';
import { PendingInvite } from '../../core/invite';
import { LockService } from '../../core/native/lock';
import { SessionStore } from '../../core/session.store';
import { GoalStore } from '../../core/stores';
import { ToastService } from '../../core/toast.service';
import { AppTile, LOCKABLE_APPS, LockableApp } from '../../ui/app-tile';
import { ApWarning } from '../../ui/ap-warning';
import { StepBar } from '../../ui/bits';
import { Icon } from '../../ui/icon';
import { OnboardingState } from './onboarding.state';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StepBar, Icon, AppTile, ApWarning],
  template: `
    <div class="screen">
      <app-step-bar [step]="5" />
      <div class="pad mt-3">
        <div class="h text-[38px]">Lock your apps</div>
        <p class="text-[14.5px] text-mute mt-1.5">They stay locked until today's quests are cleared.</p>
      </div>

      <div class="mx-5 mt-4 card divide-y divide-line overflow-hidden">
        @for (a of apps; track a.pkg) {
          @let locked = !pro() && !a.free;
          <button class="w-full flex items-center gap-3 px-4 h-[62px] text-left" (click)="toggle(a)">
            <app-tile [key]="a.key" />
            <div class="flex-1">
              <div class="font-bold text-[15.5px]">{{ a.name }}</div>
              @if (a.free) { <span class="tag tag-free">Free</span> } @else { <span class="tag tag-pro"><app-icon name="crown" />PRO</span> }
            </div>
            <span class="tog" [class.on]="isOn(a)" [class.opacity-50]="locked"></span>
          </button>
        }
      </div>

      @if (lock.blocked()) {
        <div class="mx-5 mt-3"><app-ap-warning /></div>
      } @else if (lock.native) {
        @let st = lock.status();
        @if (st?.serviceEnabled) {
          <div class="mx-5 mt-3 card-ok px-4 h-[54px] flex items-center gap-3">
            <span class="qok"><app-icon name="check" /></span>
            <div class="flex-1 text-[13.5px] font-bold leading-tight">App lock is on<div class="text-mute font-medium text-[12px]">DropZone can block the apps above.</div></div>
          </div>
        } @else {
          <div class="mx-5 mt-3 card-gold p-3.5 flex items-center gap-3">
            <span class="qi bg-[rgba(var(--gold-rgb),.12)] text-gold"><app-icon name="lock" /></span>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-[14.5px]">Turn on app lock</div>
              <p class="text-[12.5px] text-mute leading-snug mt-0.5">Allow DropZone in Accessibility so it can cover locked apps.</p>
            </div>
            <button class="qbtn soft" (click)="enable()">Enable</button>
          </div>
        }
      }

      <div class="pad mt-4">
        <div class="lbl mb-2.5">How do you unlock?</div>
        <div class="space-y-2.5">
          @for (m of modes; track m.key) {
            @let on = state.unlockMode() === m.key;
            <button class="w-full text-left p-3.5 flex gap-3 items-start" [class.card-hi]="on" [class.card]="!on" (click)="setMode(m.key)">
              <span class="radio mt-0.5" [class.on]="on"></span>
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span [class.text-gold]="m.key === 'WHOLE_DAY'" [class.text-accent2]="m.key === 'MINUTES'"><app-icon [name]="m.icon" [size]="17" /></span>
                  <span class="font-bold text-[15.5px]">{{ m.title }}</span>
                  @if (m.key === 'WHOLE_DAY') { <span class="tag tag-plain">Default</span> } @else if (!pro()) { <span class="tag tag-pro"><app-icon name="crown" />PRO</span> }
                </div>
                <p class="text-[13px] text-mute mt-1">{{ m.text }}</p>
              </div>
            </button>
          }
        </div>
      </div>

      <div class="mt-auto pad pt-6 pb-[calc(32px+env(safe-area-inset-bottom))]">
        @if (!state.valid()) {
          <p class="text-center text-[12.5px] font-semibold mb-2.5" style="color:var(--accent-light)">Your goal can't be split into milestones. Go back to the goal step and change it.</p>
        } @else if (needsLock()) {
          <p class="text-center text-[12.5px] text-mute mb-2.5">Turn on app lock above to continue, or switch the apps off.</p>
        }
        <button class="btn btn-primary" [disabled]="busy() || needsLock() || !state.valid()" (click)="finish()"><app-icon name="lock" />{{ busy() ? 'Locking…' : 'Lock it in' }}</button>
      </div>
    </div>
  `
})
export class LockPage implements OnInit {
  protected readonly state = inject(OnboardingState);
  protected readonly lock = inject(LockService);
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly goals = inject(GoalStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly invite = inject(PendingInvite);

  protected readonly apps = LOCKABLE_APPS;
  protected readonly pro = this.session.onboardingPro;
  protected readonly busy = signal(false);
  protected readonly needsLock = computed(() => this.state.lockedApps().length > 0 && !this.lock.blocked() && !this.lock.ready());
  protected readonly modes: { key: UnlockMode; title: string; text: string; icon: string }[] = [
    { key: 'WHOLE_DAY', title: 'Whole day', text: 'All quests cleared → open till midnight.', icon: 'sun' },
    { key: 'MINUTES', title: 'Minutes per quest', text: 'Each quest earns screen time.', icon: 'timer' }
  ];

  ngOnInit(): void {
    if (!this.pro()) {
      this.state.lockedApps.update(list => list.filter(p => LOCKABLE_APPS.find(a => a.pkg === p)?.free));
      this.state.unlockMode.set('WHOLE_DAY');
    }
    if (!this.lock.native) return;
    void this.refresh();
    const handle = CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive) void this.refresh(); });
    this.destroyRef.onDestroy(() => void handle.then(h => h.remove()));
  }

  protected isOn(a: LockableApp): boolean {
    return this.state.lockedApps().includes(a.pkg);
  }

  protected toggle(a: LockableApp): void {
    if (!this.pro() && !a.free) {
      void this.router.navigateByUrl('/paywall');
      return;
    }
    this.state.lockedApps.update(list => (list.includes(a.pkg) ? list.filter(p => p !== a.pkg) : [...list, a.pkg]));
  }

  protected setMode(mode: UnlockMode): void {
    if (mode === 'MINUTES' && !this.pro()) {
      void this.router.navigateByUrl('/paywall');
      return;
    }
    this.state.unlockMode.set(mode);
  }

  protected async enable(): Promise<void> {
    try {
      await this.lock.openSettings();
    } catch (e) {
      this.toast.error(e);
    }
  }

  protected async finish(): Promise<void> {
    if (this.busy() || this.needsLock() || !this.state.valid()) return;
    this.busy.set(true);
    try {
      const { user, goal } = await this.api.onboard(this.state.request());
      this.session.setUser(user);
      this.goals.goal.set(goal);
      this.state.reset();
      await this.invite.acceptPending().catch(() => undefined);
      await this.router.navigateByUrl(user.trial ? '/trial' : '/today', { replaceUrl: true });
    } catch (e) {
      if (isProRequired(e)) void this.router.navigateByUrl('/paywall');
      else this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  private async refresh(): Promise<void> {
    try { await this.lock.refreshStatus(); } catch { }
  }
}
