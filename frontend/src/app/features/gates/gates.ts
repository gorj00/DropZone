import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { apiError } from '../../core/api/errors';
import { AuthService } from '../../core/auth';
import { ConfigService, PLAY_LISTING_URL, openExternal } from '../../core/config.service';
import { DataExportService } from '../../core/data-export';
import { DisclosureKind, DisclosureService } from '../../core/native/disclosure';
import { RegionService } from '../../core/region';
import { SessionStore } from '../../core/session.store';
import { ToastService } from '../../core/toast.service';
import { Badge } from '../../ui/badge';
import { Icon } from '../../ui/icon';
import { DeleteAccountSheet } from '../settings/delete-account';

@Component({
  selector: 'app-update-gate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge],
  host: { class: 'fixed inset-0 z-[70] bg-bg overflow-y-auto', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'update-title' },
  template: `
    <div class="screen pad items-center justify-center text-center">
      <span class="float"><app-badge tone="accent" [size]="72" icon="refresh" [glowing]="true" /></span>
      <div id="update-title" class="h text-[30px] mt-5">Update DropZone</div>
      <p class="text-[14px] text-mute mt-2 max-w-[300px]">This version is no longer supported. Get the latest version from Google Play to keep going.</p>
      <button class="btn btn-primary mt-6 max-w-[280px]" (click)="update()">Update in Google Play</button>
    </div>
  `
})
export class UpdateGate {
  protected update(): void {
    openExternal(PLAY_LISTING_URL);
  }
}

@Component({
  selector: 'app-offline-gate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, Icon],
  host: { class: 'fixed inset-0 z-[70] bg-bg overflow-y-auto', role: 'alert' },
  template: `
    <div class="screen pad items-center justify-center text-center">
      <app-badge tone="off" [size]="68" icon="globe" />
      <div class="h text-[28px] mt-5">Can't reach DropZone</div>
      <p class="text-[14px] text-mute mt-2 max-w-[300px]">Check your connection. You're still signed in and we keep trying.</p>
      <button class="btn btn-ghost mt-6 max-w-[280px]" [disabled]="session.retrying() || signingOut()" (click)="session.retry()">
        <app-icon name="refresh" />{{ session.retrying() ? 'Retrying…' : 'Retry' }}
      </button>
      <button class="text-[13.5px] font-bold text-mute mt-4" [disabled]="signingOut()" (click)="signOut()">{{ signingOut() ? 'Signing out…' : 'Sign out' }}</button>
    </div>
  `
})
export class OfflineGate {
  protected readonly session = inject(SessionStore);
  private readonly auth = inject(AuthService);
  protected readonly signingOut = signal(false);

  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    try {
      await this.auth.signOut();
    } finally {
      this.signingOut.set(false);
    }
  }
}

@Component({
  selector: 'app-suspended-gate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, Icon, DeleteAccountSheet],
  host: { class: 'fixed inset-0 z-[70] bg-bg overflow-y-auto', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'suspended-title' },
  template: `
    <div class="screen pad items-center justify-center text-center">
      <app-badge tone="off" [size]="68" icon="block" />
      <div id="suspended-title" class="h text-[28px] mt-5">Your account is suspended</div>
      <p class="text-[14px] text-mute mt-2 max-w-[300px] leading-snug">Your account was suspended for breaking the community rules. Your posts and profile are hidden from others.</p>
      <button class="btn btn-ghost mt-6 max-w-[280px]" [disabled]="signingOut()" (click)="signOut()">{{ signingOut() ? 'Signing out…' : 'Sign out' }}</button>
      <button class="btn btn-ghost mt-3 max-w-[280px]" [disabled]="signingOut() || exporting()" (click)="exportData()"><app-icon name="download" />{{ exporting() ? 'Preparing your data…' : 'Download my data' }}</button>
      <button class="text-[13.5px] font-bold text-mute mt-4" [disabled]="signingOut()" (click)="deleting.set(true)">Delete account</button>
    </div>
    @if (deleting()) {
      <app-delete-account-sheet (closed)="deleting.set(false)" />
    }
  `
})
export class SuspendedGate {
  private readonly auth = inject(AuthService);
  private readonly dataExport = inject(DataExportService);
  private readonly toast = inject(ToastService);
  protected readonly signingOut = signal(false);
  protected readonly deleting = signal(false);
  protected readonly exporting = signal(false);

  protected async exportData(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      if ((await this.dataExport.download()) === 'saved') this.toast.show('Your data was downloaded.');
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.exporting.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    try {
      await this.auth.signOut();
    } finally {
      this.signingOut.set(false);
    }
  }
}

const DISCLOSURES: Record<DisclosureKind, { title: string; lead: string; icon: string; points: { icon: string; title: string; text: string }[]; yes: string; footer: string | null }> = {
  ACCESSIBILITY: {
    title: 'App lock uses Accessibility',
    lead: 'DropZone uses the Android Accessibility service only to lock the apps you picked.',
    icon: 'lock',
    points: [
      { icon: 'search', title: 'What it sees', text: 'Which app is open on your screen. Nothing else: not what you type, read or watch.' },
      { icon: 'lock', title: 'Why', text: 'To cover the apps you chose until today\'s quests are done.' },
      { icon: 'eyeoff', title: 'Stays on your phone', text: 'It is checked on this phone only. It is never stored, sent to us or shared with anyone.' }
    ],
    yes: 'Agree',
    footer: 'Next, Android opens Accessibility settings. Find DropZone there and turn it on.'
  },
  HEALTH: {
    title: 'Connect Health Connect',
    lead: 'Steps and sleep from Health Connect complete your quests.',
    icon: 'steps',
    points: [
      { icon: 'steps', title: 'What we read', text: 'Your steps and your sleep. Nothing else from Health Connect.' },
      { icon: 'chart', title: 'What is saved', text: 'Only daily totals, to mark your steps and sleep quests done.' }
    ],
    yes: 'Continue',
    footer: 'Next, Health Connect asks which data DropZone may read.'
  }
};

@Component({
  selector: 'app-disclosure-gate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, Icon],
  host: { class: 'fixed inset-0 z-[75] bg-bg overflow-y-auto', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'disclosure-title' },
  template: `
    @if (content(); as c) {
      <div class="screen pad pt-10" style="padding-bottom: calc(32px + env(safe-area-inset-bottom))">
        <span class="mx-auto"><app-badge tone="accent" [size]="64" [icon]="c.icon" [glowing]="true" /></span>
        <div id="disclosure-title" class="h text-[30px] mt-5 text-center">{{ c.title }}</div>
        <p class="text-[14.5px] text-mute mt-2 text-center leading-snug">{{ c.lead }}</p>
        <div class="card mt-5 divide-y divide-line">
          @for (p of c.points; track p.title) {
            <div class="flex gap-3 px-3.5 py-3">
              <span class="qi !w-[34px] !h-[34px] !rounded-[10px] bg-s2 text-accent2 flex-none"><app-icon [name]="p.icon" [size]="17" /></span>
              <div class="min-w-0">
                <div class="font-bold text-[14.5px] leading-tight">{{ p.title }}</div>
                <p class="text-[13px] text-mute mt-0.5 leading-snug">{{ p.text }}</p>
              </div>
            </div>
          }
        </div>
        @if (c.footer) { <p class="text-[12.5px] text-mute mt-4 text-center leading-snug">{{ c.footer }}</p> }
        <div class="mt-auto pt-6 space-y-3">
          <button class="btn btn-primary" (click)="disclosure.answer(true)">{{ c.yes }}</button>
          <button class="btn btn-ghost" (click)="disclosure.answer(false)">Not now</button>
        </div>
      </div>
    }
  `
})
export class DisclosureGate {
  protected readonly disclosure = inject(DisclosureService);
  protected readonly content = computed(() => {
    const d = this.disclosure.current();
    return d ? DISCLOSURES[d.kind] : null;
  });
}

@Component({
  selector: 'app-consent-gate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge],
  host: { class: 'fixed inset-0 z-[70] bg-bg overflow-y-auto', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'consent-title' },
  template: `
    <div class="screen pad items-center justify-center text-center">
      <span class="float"><app-badge tone="accent" [size]="72" icon="check" [glowing]="true" /></span>
      <div id="consent-title" class="h text-[30px] mt-5">Before you continue</div>
      <p class="text-[14.5px] text-mute mt-2 max-w-[300px] leading-snug">
        By continuing you agree to the
        @if (config()?.termsUrl; as url) { <a class="text-accent font-bold" [href]="url" (click)="open($event, url)">Terms</a> } @else { Terms }
        and the
        @if (config()?.privacyUrl; as url) { <a class="text-accent font-bold" [href]="url" (click)="open($event, url)">Privacy Policy</a>. } @else { Privacy Policy. }
      </p>
      <label class="card mt-5 w-full max-w-[300px] px-3.5 py-3 flex items-center gap-3 text-left cursor-pointer">
        <input type="checkbox" class="w-5 h-5 flex-none accent-accent" [checked]="adult()" (change)="adult.set($any($event.target).checked)" />
        <span class="font-semibold text-[14.5px] leading-snug">I'm 18 or older</span>
      </label>
      @if (eu()) {
        <label class="card mt-2.5 w-full max-w-[300px] px-3.5 py-3 flex items-start gap-3 text-left cursor-pointer">
          <input type="checkbox" class="w-5 h-5 mt-0.5 flex-none accent-accent" [checked]="share()" (change)="share.set($any($event.target).checked)" />
          <span class="leading-snug">
            <span class="block font-semibold text-[14.5px]">Help improve DropZone</span>
            <span class="block text-[12.5px] text-mute mt-0.5">Share anonymised insights with us and our partners to improve the service. Your personal data stays private.</span>
          </span>
        </label>
      }
      <button class="btn btn-primary mt-4 max-w-[280px]" [disabled]="busy() || !adult()" (click)="accept()">{{ busy() ? 'Saving…' : 'Accept' }}</button>
    </div>
  `
})
export class ConsentGate {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly configs = inject(ConfigService);
  private readonly toast = inject(ToastService);
  private readonly region = inject(RegionService);

  protected readonly config = this.configs.config;
  protected readonly busy = signal(false);
  protected readonly adult = signal(false);
  protected readonly share = signal(false);
  protected readonly eu = this.region.eu;

  constructor() {
    if (!this.config()) void this.configs.load();
  }

  protected open(event: Event, url: string): void {
    event.preventDefault();
    openExternal(url);
  }

  protected async accept(): Promise<void> {
    if (this.busy() || !this.adult()) return;
    this.busy.set(true);
    try {
      const config = this.config() ?? (await this.configs.load());
      if (!config) {
        this.toast.show('No connection to the server. Try again.', true);
        return;
      }
      const region = this.region.region();
      this.session.setUser(await this.api.acceptConsent(config.termsVersion, config.privacyVersion, region.eu ? this.share() : true, region));
    } catch (e) {
      if (apiError(e).status === 409) {
        await this.configs.load();
        this.toast.show('The terms were just updated. Please review them and accept again.', true);
      } else {
        this.toast.error(e);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
