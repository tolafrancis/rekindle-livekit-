import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rekindlebc.app',
  appName: 'ReKindleBC',
  webDir: 'dist',

  android: {
    allowMixedContent: false,
  },

  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: ['rekindlebc.com', 'app.rekindlebc.com', '*.rekindlebc.com'],
  },

  // The Firebase plugins share firebase-ios-sdk; without symlinked package
  // paths SwiftPM reports an identity collision (capacitor-firebase#959).
  experimental: {
    ios: {
      spm: {
        packageOptions: {
          '@capacitor-firebase/authentication': { symlink: true },
          '@capacitor-firebase/messaging': { symlink: true },
        },
      },
    },
  },

  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com'],
    },
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#7c3aed',
      showSpinner: false,
    },
  },
};

export default config;
