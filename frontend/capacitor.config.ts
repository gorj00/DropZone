import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dropzone.app',
  appName: 'DropZone',
  webDir: 'dist/dropzone/browser',
  android: {
    backgroundColor: '#0d0a2b'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false
      }
    }
  }
};

export default config;
