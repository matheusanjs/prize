import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.marinaprizeclub.app',
  appName: 'Prize Clube',
  webDir: 'out',
  server: {
    url: 'https://app.marinaprizeclub.com',
    cleartext: false,
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
    scheme: 'Prize Clube',
    preferredContentMode: 'mobile',
    backgroundColor: '#0D1B2A',
  },
  plugins: {
    PushNotifications: {
      // Show banner + play sound + update badge even when the app is open (foreground).
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
