import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.marinaprizeclub.app',
  appName: 'Prize Clube',
  webDir: 'out',
  server: {
    url: 'https://app.marinaprizeclub.com',
    cleartext: false,
    androidScheme: 'https',
    allowNavigation: ['app.marinaprizeclub.com', 'api.marinaprizeclub.com'],
  },
  ios: {
    preferredContentMode: 'mobile',
    backgroundColor: '#0D1B2A',
    infoPlist: {
      NSCameraUsageDescription: 'O aplicativo precisa acessar a câmera para registrar fotos de inspeção de embarcações, nível de combustível e evidências de danos.',
      NSPhotoLibraryUsageDescription: 'O aplicativo precisa acessar a biblioteca de fotos para selecionar imagens de inspeção de embarcações e nível de combustível.',
      NSPhotoLibraryAddUsageDescription: 'O aplicativo precisa salvar fotos de inspeção na sua biblioteca.',
    },
  } as any,
  plugins: {
    PushNotifications: {
      // Show banner + play sound + update badge even when the app is open (foreground).
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
