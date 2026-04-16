import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.marinaprizeclub.app',
  appName: 'Prize Clube',
  webDir: 'out',
  server: {
    url: 'https://app.marinaprizeclub.com',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
    scheme: 'Prize Clube',
    preferredContentMode: 'mobile',
  },
};

export default config;
