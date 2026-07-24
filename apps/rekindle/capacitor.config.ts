import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rekindlebc.app',
  appName: 'ReKindle',
  webDir: 'dist',

  android: {
    allowMixedContent: false,
  },

  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#7c3aed',
      showSpinner: false,
    },
  },
};

export default config;
