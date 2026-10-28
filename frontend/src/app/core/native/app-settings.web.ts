import { WebPlugin } from '@capacitor/core';
import type { AppSettingsPlugin } from './plugins';

export class AppSettingsWeb extends WebPlugin implements AppSettingsPlugin {
  async openNotificationSettings(): Promise<void> { }
  async setIconTheme(): Promise<void> { }
  async getRegion(): Promise<{ sim: string; network: string; locale: string }> {
    return { sim: '', network: '', locale: '' };
  }
}
