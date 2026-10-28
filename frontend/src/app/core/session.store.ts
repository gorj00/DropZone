import { Injectable, NgZone, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { App as CapApp } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { ApiService } from './api/api.service';
import { apiError } from './api/errors';
import { User, UserPatch } from './api/models';
import { LockService } from './native/lock';
import { ThemeService } from './theme.service';

const TOKEN_KEY = 'dz-token';
export const RETRY_DELAYS_MS = [3000, 6000, 15000, 30000];
export const EXPIRY_REFRESH_DELAY_MS = 60_000;
export const RENEWAL_LEEWAY_MS = 6 * 3_600_000;
const MAX_TIMER_MS = 2_000_000_000;

export function expiryRefreshIn(user: User, now = Date.now()): number | null {
  if (user.trial) {
    if (!user.trialEndsAt) return null;
    const ms = new Date(user.trialEndsAt).getTime() - now;
    return ms > 0 ? ms + 1000 : null;
  }
  if (!user.pro || !user.proExpiresAt) return null;
  const end = new Date(user.proExpiresAt).getTime();
  const at = [end + EXPIRY_REFRESH_DELAY_MS, ...(user.willRenew ? [end + RENEWAL_LEEWAY_MS + EXPIRY_REFRESH_DELAY_MS] : [])].find(t => t > now);
  return at === undefined ? null : at - now;
}

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(ApiService);
  private readonly theme = inject(ThemeService);
  private readonly lock = inject(LockService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private attempt: Promise<boolean> | null = null;
  private waiting: (() => void)[] = [];
  private readonly resets: (() => unknown)[] = [];

  readonly token = signal<string | null>(null);
  readonly user = signal<User | null>(null);
  readonly ready = signal(false);
  readonly offline = signal(false);
  readonly retrying = signal(false);
  readonly suspended = signal(false);

  readonly loggedIn = computed(() => !!this.token() && !!this.user());
  readonly pro = computed(() => !!this.user()?.pro);
  readonly path = computed(() => this.user()?.path ?? 'LOSE');
  readonly trial = computed(() => !!this.user()?.trial);
  readonly subscribed = computed(() => this.pro() && !this.trial());
  readonly trialEndsAt = computed(() => (this.user()?.trial ? this.user()?.trialEndsAt ?? null : null));
  readonly trialAhead = computed(() => {
    const u = this.user();
    return !!u && !u.onboarded && !u.pro && !u.trialEndsAt;
  });
  readonly onboardingPro = computed(() => this.pro() || this.trialAhead());

  constructor() {
    void CapApp.addListener('appStateChange', s => {
      if (s.isActive) this.zone.run(() => void (this.offline() ? this.retry() : this.refresh().catch(() => undefined)));
    }).catch(() => undefined);
  }

  async init(): Promise<void> {
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    if (value) {
      this.token.set(value);
      await this.retry();
    }
    this.ready.set(true);
  }

  retry(): Promise<boolean> {
    if (!this.token()) return Promise.resolve(false);
    this.attempt ??= this.load().finally(() => (this.attempt = null));
    return this.attempt;
  }

  whenSettled(): Promise<void> {
    return this.offline() ? new Promise(resolve => this.waiting.push(resolve)) : Promise.resolve();
  }

  onClear(reset: () => unknown): void {
    this.resets.push(reset);
  }

  async signIn(token: string, user: User): Promise<void> {
    await this.storeToken(token);
    this.setUser(user);
    this.settle();
  }

  setUser(user: User): void {
    this.user.set(user);
    this.suspended.set(!!user.suspended);
    this.theme.set(user.theme);
    this.watchExpiry(user);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!user.suspended && tz && user.timezone !== tz) void this.api.updateMe({ timezone: tz }).then(u => this.user.set(u)).catch(() => undefined);
  }

  markSuspended(): void {
    if (this.token()) this.suspended.set(true);
  }

  async refresh(): Promise<User | null> {
    const sent = this.token();
    if (!sent) return null;
    const { user, token } = await this.api.me();
    if (!this.token()) return null;
    if (token && this.token() === sent) await this.storeToken(token);
    this.setUser(user);
    this.settle();
    return user;
  }

  async update(patch: UserPatch): Promise<User> {
    const u = await this.api.updateMe(patch);
    this.setUser(u);
    return u;
  }

  async logout(): Promise<void> {
    await this.clear();
    await this.router.navigateByUrl('/welcome');
  }

  async clear(): Promise<void> {
    this.stopExpiryTimer();
    this.token.set(null);
    this.user.set(null);
    this.suspended.set(false);
    this.settle();
    await Preferences.remove({ key: TOKEN_KEY });
    await this.lock.disable().catch(() => undefined);
    for (const reset of this.resets) {
      try { await reset(); } catch { }
    }
  }

  private async load(): Promise<boolean> {
    this.stopRetry();
    this.retrying.set(true);
    try {
      return !!(await this.refresh());
    } catch (e) {
      if (!this.token()) return false;
      if (apiError(e).status === 401) {
        await this.clear();
        return false;
      }
      this.offline.set(true);
      this.scheduleRetry();
      return false;
    } finally {
      this.retrying.set(false);
    }
  }

  private async storeToken(token: string): Promise<void> {
    this.token.set(token);
    await Preferences.set({ key: TOKEN_KEY, value: token });
  }

  private settle(): void {
    this.stopRetry();
    this.retries = 0;
    this.offline.set(false);
    const waiting = this.waiting;
    this.waiting = [];
    waiting.forEach(resolve => resolve());
  }

  private scheduleRetry(): void {
    const delay = RETRY_DELAYS_MS[Math.min(this.retries, RETRY_DELAYS_MS.length - 1)];
    this.retries++;
    this.retryTimer = setTimeout(() => this.zone.run(() => void this.retry()), delay);
  }

  private stopRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private watchExpiry(user: User): void {
    this.stopExpiryTimer();
    const ms = expiryRefreshIn(user);
    if (ms !== null && ms < MAX_TIMER_MS) this.expiryTimer = setTimeout(() => this.zone.run(() => void this.refresh().catch(() => undefined)), ms);
  }

  private stopExpiryTimer(): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
  }
}
