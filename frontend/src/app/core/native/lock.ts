import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Today, User } from '../api/models';
import { IS_IOS } from '../platform';
import { DisclosureService } from './disclosure';
import { AppLock, AppLockPlugin, AppLockStatus } from './plugins';

export const APP_LOCK = new InjectionToken<AppLockPlugin>('AppLock', {
  providedIn: 'root',
  factory: () => ({
    getStatus: () => AppLock.getStatus(),
    openAccessibilitySettings: options => AppLock.openAccessibilitySettings(options),
    openOverlaySettings: () => AppLock.openOverlaySettings(),
    setConfig: config => AppLock.setConfig(config),
    requestAuthorization: () => AppLock.requestAuthorization(),
    pickApp: options => AppLock.pickApp(options),
    forgetApp: options => AppLock.forgetApp(options)
  })
});

@Injectable({ providedIn: 'root' })
export class LockService {
  private readonly plugin = inject(APP_LOCK);
  private readonly disclosure = inject(DisclosureService);

  readonly ios = IS_IOS;
  readonly native = this.ios || Capacitor.getPlatform() === 'android';
  readonly status = signal<AppLockStatus | null>(null);
  readonly picked = computed(() => this.status()?.pickedPackages ?? []);
  readonly ready = computed(() => !this.native || !!this.status()?.serviceEnabled);
  readonly blocked = computed(() => this.native && !!this.status()?.advancedProtection);

  async refreshStatus(): Promise<AppLockStatus> {
    const s = await this.plugin.getStatus();
    this.status.set(s);
    return s;
  }

  allowed(app: { pkg: string; free: boolean }, pro: boolean, selected: string[]): boolean {
    if (pro) return true;
    return this.ios ? selected.length === 0 || selected.includes(app.pkg) : app.free;
  }

  incomplete(packages: string[]): boolean {
    return this.ios && packages.some(p => !this.picked().includes(p));
  }

  async ensureApp(app: { pkg: string; name: string }): Promise<boolean> {
    if (!this.ios) return true;
    const s = this.status() ?? (await this.refreshStatus());
    if (!s.serviceEnabled && !(await this.openSettings())) return false;
    if (this.picked().includes(app.pkg)) return true;
    const { picked } = await this.plugin.pickApp({ package: app.pkg, name: app.name });
    await this.refreshStatus();
    return picked;
  }

  async ensureApps(apps: { pkg: string; name: string }[]): Promise<boolean> {
    for (const app of apps) {
      if (!(await this.ensureApp(app))) return false;
    }
    return true;
  }

  async forget(pkg: string): Promise<void> {
    if (!this.ios) return;
    await this.plugin.forgetApp({ package: pkg });
    await this.refreshStatus();
  }

  async openSettings(): Promise<boolean> {
    if (this.ios) {
      const { granted } = await this.plugin.requestAuthorization();
      await this.refreshStatus();
      return granted;
    }
    if (!(await this.disclosure.ask('ACCESSIBILITY'))) return false;
    await this.plugin.openAccessibilitySettings({ guide: true });
    return true;
  }

  async manage(): Promise<void> {
    if (this.ios) return;
    await this.plugin.openAccessibilitySettings();
  }

  async disable(): Promise<void> {
    if (!this.native) return;
    await this.plugin.setConfig({ enabled: false, packages: [], unlockedUntil: null, minutesBudget: 0, budgetDay: null, title: 'Locked by DropZone', message: '' });
  }

  async sync(user: User | null, today: Today | null): Promise<void> {
    if (!user) return;
    const left = today ? Math.max(0, today.totalCount - today.doneCount) : 0;
    const unlockedUntil = today?.unlocked && today.unlockedUntil ? Date.parse(today.unlockedUntil) : null;
    await this.plugin.setConfig({
      enabled: user.onboarded && user.lockedApps.length > 0,
      packages: user.lockedApps,
      unlockedUntil,
      minutesBudget: today?.unlocked ? today.minutesEarned : 0,
      budgetDay: today?.date ?? null,
      title: 'Locked by DropZone',
      message: left > 0 ? `${left} quest${left === 1 ? '' : 's'} left. Clear them to unlock.` : 'Clear today\'s quests to unlock.'
    });
  }
}
