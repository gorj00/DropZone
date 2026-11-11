import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, isSignInCancelled } from '../../core/auth';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../ui/icon';
import { NeonHero } from './neon-hero';

const FEATURES = [
  { label: 'Daily quests', icon: 'bolt', color: 'var(--accent-2)' },
  { label: 'Milestone rewards', icon: 'gift', color: 'var(--gold)' },
  { label: 'App lock', icon: 'lock', color: 'var(--accent)' }
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, NeonHero],
  template: `
    <div class="screen relative overflow-hidden">
      <app-neon-hero />

      <div class="relative z-10 px-6 mt-3 flex items-center gap-2">
        <span class="text-accent"><app-icon name="chute" [size]="22" /></span>
        <span class="h text-[21px] tracking-[.1em]">Drop<span class="text-accent">Zone</span></span>
      </div>

      <div class="relative z-10 mt-auto px-6 pb-[calc(36px+env(safe-area-inset-bottom))]">
        <div class="flex flex-wrap gap-2">
          @for (f of features; track f.label) {
            <span class="chip"><span class="inline-flex" [style.color]="f.color"><app-icon [name]="f.icon" /></span>{{ f.label }}</span>
          }
        </div>
        <div class="h text-[46px] mt-4">You vs<br><span class="text-accent glow-text">your goal</span></div>
        <p class="text-[15px] text-mute mt-3 leading-snug">Daily quests, real rewards and friends who keep you honest.</p>
        <div class="mt-6">
          @if (apple) {
            <button class="btn mb-3 bg-white text-black" [disabled]="busy()" (click)="start('apple')">
              <svg viewBox="0 0 24 24" class="w-[22px] h-[22px] shrink-0" fill="currentColor" aria-hidden="true">
                <path d="M16.37 12.6c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.39.81 1.4-.03 2.29-1.27 3.14-2.53.99-1.45 1.4-2.85 1.42-2.92-.03-.01-2.72-1.04-2.74-4.13zM13.79 4.98c.72-.87 1.2-2.08 1.07-3.28-1.03.04-2.28.69-3.02 1.55-.66.77-1.24 2-1.09 3.18 1.15.09 2.32-.58 3.04-1.45z"/>
              </svg>
              {{ busy() ? 'Signing in…' : 'Continue with Apple' }}
            </button>
          }
          @if (google) {
          <button class="btn btn-primary" [disabled]="busy()" (click)="start()">
            <span class="grid place-items-center w-8 h-8 rounded-full bg-white shrink-0">
              <svg viewBox="0 0 48 48" class="w-[18px] h-[18px]" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            </span>
            {{ busy() ? 'Signing in…' : 'Continue with Google' }}
          </button>
          }
        </div>
      </div>
    </div>
  `
})
export class WelcomePage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  protected readonly features = FEATURES;
  protected readonly busy = signal(false);
  protected readonly apple = this.auth.apple;
  protected readonly google = this.auth.showGoogle;

  protected async start(provider: 'google' | 'apple' = 'google'): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const user = provider === 'apple' ? await this.auth.signInWithApple() : await this.auth.signInWithGoogle();
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      const next = returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : user.onboarded ? '/today' : '/onboarding/profile';
      await this.router.navigateByUrl(next, { replaceUrl: true });
    } catch (e) {
      if (!isSignInCancelled(e)) this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
