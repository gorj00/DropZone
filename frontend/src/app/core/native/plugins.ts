import { registerPlugin } from '@capacitor/core';

export interface AppLockStatus {
  serviceEnabled: boolean;
  overlayPermission: boolean;
  usagePermission: boolean;
  advancedProtection: boolean;
  minutesUsed: number;
  minutesLeft: number;
  pickedPackages?: string[];
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
  openAccessibilitySettings(options?: { guide?: boolean }): Promise<void>;
  openOverlaySettings(): Promise<void>;
  setConfig(config: AppLockConfig): Promise<void>;
  requestAuthorization(): Promise<{ granted: boolean }>;
  pickApp(options: { package: string; name: string }): Promise<{ picked: boolean }>;
  forgetApp(options: { package: string }): Promise<void>;
}

export const AppLock = registerPlugin<AppLockPlugin>('AppLock', {
  web: () => import('./app-lock.web').then(m => new m.AppLockWeb())
});

export interface AppSettingsPlugin {
  setIconTheme(options: { theme: 'NEON' | 'STEALTH' }): Promise<void>;
  getRegion(): Promise<{ sim: string; network: string; locale: string }>;
}

export const AppSettings = registerPlugin<AppSettingsPlugin>('AppSettings', {
  web: () => import('./app-settings.web').then(m => new m.AppSettingsWeb())
});
