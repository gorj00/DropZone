import { WebPlugin } from '@capacitor/core';
import type { AppSettingsPlugin } from './plugins';

export class AppSettingsWeb extends WebPlugin implements AppSettingsPlugin {
  async openNotificationSettings(): Promise<void> { }
}
