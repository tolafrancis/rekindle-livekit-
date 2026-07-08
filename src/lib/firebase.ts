// src/lib/firebase.ts
// Firebase app + Cloud Messaging (FCM) initialisation for web push.
//
// All values are PUBLIC Firebase web-app config (safe to ship in the bundle) and
// come from VITE_FIREBASE_* env vars. The FCM *sending* credential (service
// account) lives only in the Supabase edge function — never here.

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging';

export const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// The Web Push certificate public key (VAPID) — used by getToken().
export const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/** True only if the minimum config needed for messaging is present. */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId &&
    VAPID_KEY,
  );
}

/** Config subset the background service worker needs to init Firebase. */
export function swConfigParams(): string {
  return new URLSearchParams({
    apiKey:            firebaseConfig.apiKey ?? '',
    authDomain:        firebaseConfig.authDomain ?? '',
    projectId:         firebaseConfig.projectId ?? '',
    storageBucket:     firebaseConfig.storageBucket ?? '',
    messagingSenderId: firebaseConfig.messagingSenderId ?? '',
    appId:             firebaseConfig.appId ?? '',
  }).toString();
}

let app: FirebaseApp | null = null;
export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

/** Returns a Messaging instance, or null if unsupported/unconfigured. */
export async function getMessagingIfSupported(): Promise<Messaging | null> {
  try {
    if (!isFirebaseConfigured()) return null;
    if (!(await isSupported())) return null;
    const a = getFirebaseApp();
    return a ? getMessaging(a) : null;
  } catch (e) {
    console.warn('[firebase] messaging unsupported:', (e as Error)?.message);
    return null;
  }
}
