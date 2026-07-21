
import { createRoot } from 'react-dom/client'
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import App from './App.tsx'
import './index.css'

if (Capacitor.isNativePlatform()) {
  CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    console.log('[BACKBUTTON] fired, canGoBack:', canGoBack);
    if (canGoBack) {
      window.history.back();
    } else {
      CapacitorApp.exitApp();
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
