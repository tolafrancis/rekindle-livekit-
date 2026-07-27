import { supabase } from "@rekindle/supabase";
import { useState, useCallback } from "react";
import { getToken, deleteToken } from "firebase/messaging";
import {
  getMessagingIfSupported,
  isFirebaseConfigured,
  swConfigParams,
  VAPID_KEY,
} from "./firebase";
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';

// Firebase Cloud Messaging (FCM HTTP v1) web push.
// The client mints an FCM *registration token* via getToken() and stores it in
// push_tokens.device_token. The edge function send-push-notification then sends
// to that token through the FCM v1 API. The background handler lives in
// public/firebase-messaging-sw.js.

// Firebase's conventional scope for its messaging SW. Kept separate from the
// app's offline cache worker (public/sw.js, scope '/') so they don't clobber
// each other's registration.
const FCM_SW_SCOPE = "/firebase-cloud-messaging-push-scope";
const FCM_SW_URL = "/firebase-messaging-sw.js";

/** Register (or reuse) the FCM background service worker, config passed via URL. */
async function getFcmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const url = `${FCM_SW_URL}?${swConfigParams()}`;
  return navigator.serviceWorker.register(url, { scope: FCM_SW_SCOPE });
}

/**
 * Waits for THIS registration's worker to reach 'activated' — not
 * navigator.serviceWorker.ready, which waits for whatever worker controls
 * the current page (a different, unrelated condition that never resolves
 * here, since the FCM worker's scope never controls the page). A freshly
 * registered worker can still be 'installing' when getFcmServiceWorker()
 * returns, and PushManager.subscribe() throws AbortError against a
 * not-yet-active registration — this closes that race. Bounded by a
 * timeout so a worker that never activates still can't hang the caller
 * forever (that was the original bug this replaced).
 */
async function waitForActive(reg: ServiceWorkerRegistration, timeoutMs = 10000): Promise<boolean> {
  if (reg.active) return true;
  const worker = reg.installing || reg.waiting;
  if (!worker) return false;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") {
        clearTimeout(timer);
        resolve(true);
      } else if (worker.state === "redundant") {
        clearTimeout(timer);
        resolve(false);
      }
    });
  });
}

export async function registerPush(role: "user" | "counsellor"): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const permStatus = await FirebaseMessaging.checkPermissions();
      let granted = permStatus.receive === 'granted';
      if (!granted) {
        const requested = await FirebaseMessaging.requestPermissions();
        granted = requested.receive === 'granted';
      }
      if (!granted) {
        console.warn("Push notification permission denied (native)");
        return false;
      }

      const { token } = await FirebaseMessaging.getToken();
      if (!token) {
        console.warn("Failed to obtain native FCM token");
        return false;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn("No authenticated user");
        return false;
      }

      const platform = Capacitor.getPlatform(); // 'android' | 'ios'
      const { error } = await supabase
        .from("push_tokens")
        .upsert(
          {
            user_id:      user.id,
            device_token: token,
            platform,
            updated_at:   new Date().toISOString(),
          },
          { onConflict: "device_token" },
        );

      if (error) {
        console.error("Failed to save native push token:", error);
        return false;
      }

      console.log(`Native FCM push registered successfully (${platform})`);
      return true;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.warn("Push notifications not supported in this browser");
      return false;
    }
    if (!isFirebaseConfigured()) {
      console.error(
        "Firebase not configured. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, " +
        "VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID and VITE_FIREBASE_VAPID_KEY.",
      );
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("Notification permission denied");
      return false;
    }

    const messaging = await getMessagingIfSupported();
    if (!messaging) {
      console.warn("FCM messaging not supported on this device");
      return false;
    }

    const swReg = await getFcmServiceWorker();
    if (!swReg) return false;
    if (!(await waitForActive(swReg))) {
      console.warn("FCM service worker did not activate in time");
      return false;
    }

    // Mint the FCM registration token (this also creates the push subscription).
    const fcmToken = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    if (!fcmToken) {
      console.warn("Failed to obtain FCM token");
      return false;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn("No authenticated user");
      return false;
    }

    // The table's unique constraint is on device_token alone
    // (push_tokens_device_token_key), so upsert on that column — this re-homes
    // the token to the current user and refreshes updated_at without duplicates.
    const { error } = await supabase
      .from("push_tokens")
      .upsert(
        {
          user_id:      user.id,
          device_token: fcmToken,
          platform:     "web",
          updated_at:   new Date().toISOString(),
        },
        { onConflict: "device_token" },
      );

    if (error) {
      console.error("Failed to save push token:", error);
      return false;
    }

    console.log("FCM push registered successfully");
    return true;
  } catch (error) {
    console.error("Error registering push notification:", error);
    return false;
  }
}

export async function unregisterPush(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { token } = await FirebaseMessaging.getToken().catch(() => ({ token: null }));
      const { data: { user } } = await supabase.auth.getUser();
      if (user && token) {
        await supabase
          .from("push_tokens")
          .delete()
          .eq("user_id", user.id)
          .eq("device_token", token);
      }
      await FirebaseMessaging.deleteToken().catch(() => {});
      return true;
    }

    const messaging = await getMessagingIfSupported();
    if (!messaging) return false;

    const swReg = await getFcmServiceWorker();
    if (!swReg) return false;

    // Fetch the current token so we can remove its row, then invalidate it.
    let currentToken: string | null = null;
    try {
      currentToken = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg,
      });
    } catch { /* token may already be gone */ }

    const { data: { user } } = await supabase.auth.getUser();
    if (user && currentToken) {
      await supabase
        .from("push_tokens")
        .delete()
        .eq("user_id", user.id)
        .eq("device_token", currentToken);
    }

    await deleteToken(messaging).catch(() => {});
    return true;
  } catch (error) {
    console.error("Error unregistering push notification:", error);
    return false;
  }
}

export async function checkPushPermission(): Promise<NotificationPermission> {
  if (Capacitor.isNativePlatform()) {
    const status = await FirebaseMessaging.checkPermissions();
    if (status.receive === 'granted') return 'granted';
    if (status.receive === 'denied') return 'denied';
    return 'default';
  }
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

export async function isPushSubscribed(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const status = await FirebaseMessaging.checkPermissions();
      return status.receive === 'granted';
    }
    if (!("serviceWorker" in navigator)) return false;
    if (Notification.permission !== "granted") return false;
    // A live push subscription under the FCM scope means we're subscribed,
    // without the side effect of minting a new token.
    const reg = await navigator.serviceWorker.getRegistration(FCM_SW_SCOPE);
    const sub = await reg?.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

// React hook for push notification management
export function usePushNotifications() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  const checkStatus = useCallback(async () => {
    const perm = await checkPushPermission();
    setPermission(perm);
    const subscribed = await isPushSubscribed();
    setIsSubscribed(subscribed);
  }, []);

  const subscribe = useCallback(async (role: "user" | "counsellor" = "user") => {
    setIsLoading(true);
    try {
      const success = await registerPush(role);
      if (success) {
        setIsSubscribed(true);
        setPermission("granted");
      }
      return success;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    try {
      const success = await unregisterPush();
      if (success) setIsSubscribed(false);
      return success;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { isSubscribed, isLoading, permission, checkStatus, subscribe, unsubscribe };
}
