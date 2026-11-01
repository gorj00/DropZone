import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { ApiService, errorMessage } from '../core/api';
import { loadGoogle } from '../core/google';
import { Session } from '../core/session';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh flex items-center justify-center p-6">
      <div class="card w-full max-w-[400px] p-8 text-center">
        <img src="favicon.ico" alt="" class="w-14 h-14 rounded-[16px] mx-auto">
        <div class="h text-[30px] mt-4">DROP<em class="not-italic text-accent">ZONE</em></div>
        <div class="lbl mt-1">Backoffice</div>
        <p class="text-[15px] text-mute mt-5">Sign in with the admin Google account. Any other account is refused.</p>
        <div class="mt-6 min-h-[44px] flex justify-center" #button></div>
        @if (busy()) { <div class="flex justify-center mt-4"><span class="spin"></span></div> }
        @if (error(); as e) { <p class="text-[15px] text-danger font-semibold mt-4">{{ e }}</p> }
        @if (devLogin) {
          <form class="mt-8 pt-6 border-t border-line text-left" (submit)="$event.preventDefault(); dev(email.value)">
            <div class="lbl">Dev sign-in (local only)</div>
            <input #email class="field w-full mt-2" type="email" placeholder="admin e-mail" required>
            <button class="btn btn-ghost btn-sm mt-3 w-full" type="submit" [disabled]="busy()">Sign in without Google</button>
          </form>
        }
      </div>
    </div>
  `
})
export class LoginPage implements AfterViewInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly button = viewChild.required<ElementRef<HTMLElement>>('button');

  readonly returnUrl = input<string>();
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly devLogin = !environment.production && !!environment.devLoginPath;

  async ngAfterViewInit(): Promise<void> {
    if (!environment.googleClientId) {
      this.error.set('Google sign-in is not configured.');
      return;
    }
    try {
      const google = await loadGoogle();
      google.initialize({
        client_id: environment.googleClientId,
        callback: (response: { credential?: string }) => void this.signIn(response.credential),
        ux_mode: 'popup',
        auto_select: false,
        itp_support: true
      });
      google.renderButton(this.button().nativeElement, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', width: 280 });
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  protected async dev(email: string): Promise<void> {
    await this.finish(() => this.api.loginDev(email));
  }

  private async signIn(idToken: string | undefined): Promise<void> {
    if (!idToken) {
      this.error.set('Google did not return a token.');
      return;
    }
    await this.finish(() => this.api.loginAdmin(idToken));
  }

  private async finish(login: () => Promise<{ token: string; user: { admin: boolean } }>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { token, user } = await login();
      this.session.signIn(token, user as never);
      await this.router.navigateByUrl(this.returnUrl() || '/');
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
