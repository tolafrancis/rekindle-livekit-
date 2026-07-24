import { createRoot } from 'react-dom/client';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { closeTopModal } from '@rekindle/ui/modal-stack';
import App from './App.tsx';
import './index.css';

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
    if (callIsActive) return;
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

createRoot(document.getElementById('root')!).render(<App />);
