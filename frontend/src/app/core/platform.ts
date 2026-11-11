import { Capacitor } from '@capacitor/core';

export const IS_IOS = Capacitor.getPlatform() === 'ios';

export interface Store {
  apple: boolean;
  name: string;
  title: string;
  account: string;
  cancelPath: string;
}

const APP_STORE: Store = { apple: true, name: 'the App Store', title: 'The App Store', account: 'Apple Account', cancelPath: 'Settings › Apple Account › Subscriptions' };
const PLAY: Store = { apple: false, name: 'Google Play', title: 'Google Play', account: 'Google Play account', cancelPath: 'Google Play › Payments & subscriptions' };

export const STORE = IS_IOS ? APP_STORE : PLAY;

export function storeOf(productId: string | null | undefined): Store {
  return IS_IOS && productId?.includes(':') ? PLAY : STORE;
}

export const HEALTH_NAME = IS_IOS ? 'Apple Health' : 'Health Connect';
export const OS_NAME = IS_IOS ? 'iOS' : 'Android';
export const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
