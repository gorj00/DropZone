import { registerPlugin } from '@capacitor/core';

export interface AppLockStatus {
  serviceEnabled: boolean;
  overlayPermission: boolean;
  usagePermission: boolean;
  advancedProtection: boolean;
  minutesUsed: number;
  minutesLeft: number;
}

export interface AppLockConfig {
  enabled: boolean;
  packages: string[];
  unlockedUntil: number | null;
  minutesBudget: number;
  budgetDay: string | null;
  title: string;
  message: string;
}

export interface AppLockPlugin {
  getStatus(): Promise<AppLockStatus>;
  openAccessibilitySettings(): Promise<void>;
  openOverlaySettings(): Promise<void>;
  setConfig(config: AppLockConfig): Promise<void>;
}

export const AppLock = registerPlugin<AppLockPlugin>('AppLock', {
  web: () => import('./app-lock.web').then(m => new m.AppLockWeb())
});

export interface AppSettingsPlugin {
  openNotificationSettings(): Promise<void>;
}

export const AppSettings = registerPlugin<AppSettingsPlugin>('AppSettings', {
  web: () => import('./app-settings.web').then(m => new m.AppSettingsWeb())
});
