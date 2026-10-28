import { Component, NgZone, effect, inject, untracked } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { ConfigService } from './core/config.service';
import { PendingInvite } from './core/invite';
import { BillingService } from './core/native/billing';
import { PushService } from './core/native/push';
import { PromptService } from './core/prompt.service';
import { SessionStore } from './core/session.store';
import { NotificationsStore } from './core/social';
import { ThemeService } from './core/theme.service';
import { ToastService } from './core/toast.service';
import { DisclosureService } from './core/native/disclosure';
import { PhotoLinks } from './core/photo-links';
import { ConsentGate, DisclosureGate, OfflineGate, SuspendedGate, UpdateGate } from './features/gates/gates';
import { Icon } from './ui/icon';
import { SheetDrag } from './ui/sheet-drag';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Icon, SheetDrag, UpdateGate, OfflineGate, SuspendedGate, ConsentGate, DisclosureGate],
  template: `
    <router-outlet />
    @if (config.updateRequired()) {
      <app-update-gate />
    } @else if (session.offline()) {
      <app-offline-gate />
    } @else if (session.suspended()) {
      <app-suspended-gate />
    } @else if (session.user()?.consentRequired) {
      <app-consent-gate />
    }
    @if (disclosure.current()) {
      <app-disclosure-gate />
    }
    @if (prompt.current(); as p) {
      <div class="sheet-backdrop" (click)="prompt.close(null)"></div>
      <form class="sheet" sheetDrag (sheetDismiss)="prompt.close(null)" (submit)="$event.preventDefault(); prompt.close(input.value)">
        <div class="grabber"></div>
        <div class="lbl mt-5">Enter value</div>
        <div class="h text-[24px] mt-1">{{ p.label }}</div>
        <div class="relative mt-4">
          <input #input class="field num text-[22px]! pr-14" type="text" inputmode="decimal" [value]="p.value ?? ''" autofocus required />
          @if (p.unit) { <span class="lbl absolute right-4 top-1/2 -translate-y-1/2">{{ p.unit }}</span> }
        </div>
        <div class="flex gap-3 mt-5">
          <button type="button" class="btn btn-ghost flex-1" (click)="prompt.close(null)">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1">Save</button>
        </div>
      </form>
    }
    @if (prompt.confirmation(); as c) {
      <div class="sheet-backdrop" (click)="prompt.answer(false)"></div>
      <div class="sheet" role="dialog" aria-modal="true" sheetDrag (sheetDismiss)="prompt.answer(false)">
        <div class="grabber"></div>
        <div class="h text-[24px] mt-5">{{ c.title }}</div>
        <p class="text-[14px] text-mute mt-2 leading-snug">{{ c.message }}</p>
        <div class="flex gap-3 mt-5">
          <button type="button" class="btn btn-ghost flex-1" (click)="prompt.answer(false)">{{ c.no }}</button>
          <button type="button" class="btn btn-primary flex-1" (click)="prompt.answer(true)">{{ c.yes }}</button>
        </div>
      </div>
    }
    @if (prompt.choice(); as ch) {
      <div class="sheet-backdrop" (click)="prompt.pick(null)"></div>
      <div class="sheet" role="dialog" aria-modal="true" sheetDrag (sheetDismiss)="prompt.pick(null)">
        <div class="grabber"></div>
        <div class="h text-[24px] mt-5">{{ ch.title }}</div>
        @if (ch.message) { <p class="text-[14px] text-mute mt-2 leading-snug">{{ ch.message }}</p> }
        <div class="mt-4 space-y-2">
          @for (o of ch.options; track o.key) {
            <button type="button" class="card w-full h-[52px] px-4 flex items-center gap-3 font-bold text-[15px] text-left" [class.text-accent]="o.danger" (click)="prompt.pick(o.key)">
              @if (o.icon) { <app-icon [name]="o.icon" [size]="18" /> }{{ o.label }}
            </button>
          }
        </div>
        <button type="button" class="btn btn-ghost mt-3" (click)="prompt.pick(null)">Cancel</button>
      </div>
    }
    @if (toast.message(); as m) {
      <div class="toast" [class.err]="m.error" role="status">{{ m.text }}</div>
    }
  `
})
export class App {
  protected readonly toast = inject(ToastService);
  protected readonly prompt = inject(PromptService);
  protected readonly session = inject(SessionStore);
  protected readonly config = inject(ConfigService);
  protected readonly disclosure = inject(DisclosureService);
  private readonly invite = inject(PendingInvite);
  private readonly theme = inject(ThemeService);
  private readonly push = inject(PushService);
  private readonly billing = inject(BillingService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly notifications = inject(NotificationsStore);

  constructor() {
    inject(PhotoLinks).install();
    effect(() => {
      const user = this.session.user();
      if (user) void this.billing.init().catch(() => undefined);
      if (user?.onboarded && !user.consentRequired && !user.suspended) void this.push.start().catch(() => undefined);
      if (user?.onboarded) untracked(() => void this.notifications.refresh());
    });
    effect(() => {
      const t = this.theme.theme();
      if (Capacitor.isNativePlatform()) {
        void StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
        void StatusBar.setBackgroundColor({ color: t === 'STEALTH' ? '#08090c' : '#0d0a2b' }).catch(() => undefined);
      }
    });
    if (Capacitor.isNativePlatform()) {
      void CapApp.addListener('appUrlOpen', e => {
        const m = /(?:\/\/|\/)(invite|p)\/([A-Za-z0-9_-]+)/.exec(e.url);
        if (!m) return;
        if (m[1] === 'invite') void this.invite.remember(m[2]);
        this.zone.run(() => void this.router.navigateByUrl(`/${m[1]}/${m[2]}`));
      });
    }
  }
}
