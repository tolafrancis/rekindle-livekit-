import { supabase } from "@rekindle/supabase";
import { useState, useCallback } from "react";
import { getToken, deleteToken } from "firebase/messaging";
import {
  getMessagingIfSupported,
  isFirebaseConfigured,
  swConfigParams,
  VAPID_KEY,
} from "./firebase";

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

export async function registerPush(role: "user" | "counsellor"): Promise<boolean> {
  try {
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
    await navigator.serviceWorker.ready;

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
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

export async function isPushSubscribed(): Promise<boolean> {
  try {
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
