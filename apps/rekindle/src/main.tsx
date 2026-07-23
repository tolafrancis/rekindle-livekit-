
import { createRoot } from 'react-dom/client'
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import App from './App.tsx'
import './index.css'

let callIsActive = false;

if (Capacitor.isNativePlatform()) {
  window.addEventListener('call:active', (e: Event) => {
    const active = (e as CustomEvent).detail as boolean;
    callIsActive = active;
    if ((window as any).AndroidBridge) {
      (window as any).AndroidBridge.setCallActive(active);
    }
  });

  CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    if (callIsActive) return; // ignore back while in a call
    console.log('[BACKBUTTON] fired, canGoBack:', canGoBack);
    if (canGoBack) {
      window.history.back();
    } else {
      CapacitorApp.exitApp();
    }
  });

  window.addEventListener('pipModeChanged', (e: Event) => {
    const detail = (e as CustomEvent).detail;
    window.dispatchEvent(new CustomEvent('pip:changed', { detail }));
  });

  FirebaseMessaging.addListener('notificationReceived', (event) => {
    console.log('[Push] Foreground notification received:', event.notification);
    window.dispatchEvent(new CustomEvent('nativePushReceived', { detail: event.notification }));
  });

  FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
    console.log('[Push] Notification tapped:', event.notification);
    if (event.notification.link) {
      window.location.href = event.notification.link;
    }
  });
}

// In development, a service worker left over from a production build (or
// `vite preview`) on the same origin can hijack the page and serve stale
// cached HTML/JS, which shows up as a blank white page. Aggressively purge
// both the worker AND its caches so the dev server always loads fresh.
if (import.meta.env.DEV) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => registrations.forEach((registration) => registration.unregister()))
      .catch((error) => console.error('[main] SW unregister failed:', error?.message));
  }
  if ('caches' in window) {
    caches
      .keys()
      .then((keys) => keys.forEach((key) => caches.delete(key)))
      .catch((error) => console.error('[main] Cache clear failed:', error?.message));
  }
}

// Remove dark mode class addition
createRoot(document.getElementById("root")!).render(<App />);
