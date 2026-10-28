import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { apiError } from '../../core/api/errors';
import { AvatarService } from '../../core/avatar.service';
import { SessionStore } from '../../core/session.store';
import { ToastService } from '../../core/toast.service';
import { Avatar, StepBar } from '../../ui/bits';
import { Icon } from '../../ui/icon';
import { ProfileForm, cleanHandle } from '../../ui/profile-form';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StepBar, Avatar, Icon, ProfileForm],
  template: `
    <div class="screen">
      <app-step-bar [step]="1" />
      <div class="pad mt-3">
        <div class="h text-[38px]">Make it yours</div>
        <p class="text-[14.5px] text-mute mt-1.5">This is how friends find you and see your drops.</p>
      </div>
      <div class="pad mt-5 flex items-center gap-3.5">
        <button class="relative flex-none" [class.opacity-60]="avatar.busy()" [disabled]="avatar.busy()" aria-label="Change photo" (click)="avatar.change()">
          <app-avatar [url]="session.user()?.avatarUrl ?? null" [name]="name() || 'You'" [size]="64" ring="var(--accent)" />
          <span class="absolute -right-1 -bottom-0.5 w-6 h-6 rounded-full grid place-items-center bg-s2 border-2 border-bg text-ink"><app-icon name="camera" [size]="12" /></span>
        </button>
        <div class="min-w-0">
          <div class="font-bold text-[18px] leading-tight truncate">{{ name() || 'Your name' }}</div>
          <div class="text-[13.5px] text-mute truncate">&#64;{{ handle() || 'handle' }}</div>
          <button class="text-[12.5px] font-bold text-accent mt-1" [disabled]="avatar.busy()" (click)="avatar.change()">{{ avatar.busy() ? 'Saving…' : session.user()?.avatarUrl ? 'Change photo' : 'Add photo' }}</button>
        </div>
      </div>
      <div class="pad mt-5">
        <app-profile-form [(name)]="name" [(handle)]="handle" [(bio)]="bio" />
      </div>
      <div class="mt-auto pad pt-6 pb-[calc(32px+env(safe-area-inset-bottom))]">
        <button class="btn btn-primary" [disabled]="busy() || !form()?.valid()" (click)="next()">{{ busy() ? 'Saving…' : 'Continue' }}</button>
      </div>
    </div>
  `
})
export class ProfileStepPage {
  protected readonly session = inject(SessionStore);
  protected readonly avatar = inject(AvatarService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly form = viewChild(ProfileForm);

  protected readonly name = signal(this.session.user()?.displayName ?? '');
  protected readonly handle = signal(cleanHandle(this.session.user()?.handle ?? ''));
  protected readonly bio = signal(this.session.user()?.bio ?? '');
  protected readonly busy = signal(false);

  protected async next(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.session.update({ displayName: this.name().trim(), handle: this.handle(), bio: this.bio().trim() });
      await this.router.navigateByUrl('/onboarding/path');
    } catch (e) {
      this.toast.show(apiError(e).message, true);
    } finally {
      this.busy.set(false);
    }
  }
}
