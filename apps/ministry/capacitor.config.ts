import type { CapacitorConfig } from '@capacitor/cli';

// Native shell for the standalone Ministry app (see docs/mobile-app-build-plan.md).
// Capacitor loads the SAME Vite build (`dist/`) the web deploy uses — the web app
// on Cloudflare Pages is unaffected.
const config: CapacitorConfig = {
  appId: 'com.rekindlebc.ministry',
  appName: 'ReKindle Ministry',
  webDir: 'dist',

  // Cleartext stays OFF: every backend this app talks to is HTTPS/WSS
  // (Supabase, and LiveKit at wss://livekit.rekindlebc.com).
  android: {
    allowMixedContent: false,
  },

  server: {
    // MUST stay 'https'. getUserMedia() — and therefore every LiveKit broadcast
    // and meeting — only works in a SECURE CONTEXT. Serving the WebView over
    // http:// silently breaks camera/mic with no obvious error.
    androidScheme: 'https',
    iosScheme: 'https',
  },

  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '1051029806700-cfguuqf00hvt19atva62c7utv63k15ue.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
    // Keep the splash brief; the app shell renders fast from local assets.
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#7c3aed', // ministry purple
      showSpinner: false,
    },
  },
};

export default config;
