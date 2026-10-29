import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Today, User } from '../api/models';
import { DisclosureService } from './disclosure';
import { AppLock, AppLockPlugin, AppLockStatus } from './plugins';

export const APP_LOCK = new InjectionToken<AppLockPlugin>('AppLock', {
  providedIn: 'root',
  factory: () => ({
    getStatus: () => AppLock.getStatus(),
    openAccessibilitySettings: options => AppLock.openAccessibilitySettings(options),
    openOverlaySettings: () => AppLock.openOverlaySettings(),
    setConfig: config => AppLock.setConfig(config)
  })
});

@Injectable({ providedIn: 'root' })
export class LockService {
  private readonly plugin = inject(APP_LOCK);
  private readonly disclosure = inject(DisclosureService);

  readonly native = Capacitor.getPlatform() === 'android';
  readonly status = signal<AppLockStatus | null>(null);
  readonly ready = computed(() => !this.native || !!this.status()?.serviceEnabled);
  readonly blocked = computed(() => this.native && !!this.status()?.advancedProtection);

  async refreshStatus(): Promise<AppLockStatus> {
    const s = await this.plugin.getStatus();
    this.status.set(s);
    return s;
  }

  async openSettings(): Promise<boolean> {
    if (!(await this.disclosure.ask('ACCESSIBILITY'))) return false;
    await this.plugin.openAccessibilitySettings({ guide: true });
    return true;
  }

  async manage(): Promise<void> {
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
