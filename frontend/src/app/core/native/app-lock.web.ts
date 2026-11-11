import { WebPlugin } from '@capacitor/core';
import type { AppLockConfig, AppLockPlugin, AppLockStatus } from './plugins';

export class AppLockWeb extends WebPlugin implements AppLockPlugin {
  private config: AppLockConfig | null = null;

  async getStatus(): Promise<AppLockStatus> {
    return { serviceEnabled: true, overlayPermission: true, usagePermission: true, advancedProtection: false, minutesUsed: 0, minutesLeft: 0 };
  }

  async openAccessibilitySettings(): Promise<void> { }

  async openOverlaySettings(): Promise<void> { }

  async setConfig(config: AppLockConfig): Promise<void> {
    this.config = config;
  }

  async requestAuthorization(): Promise<{ granted: boolean }> {
    return { granted: true };
  }

  async pickApp(): Promise<{ picked: boolean }> {
    return { picked: true };
  }

  async forgetApp(): Promise<void> { }
}
