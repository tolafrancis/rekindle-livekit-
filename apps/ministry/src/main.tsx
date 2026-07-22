import { createRoot } from 'react-dom/client';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { closeTopModal, hasOpenModal } from '@rekindle/ui/modal-stack';
import App from './App.tsx';
import './index.css';

if (Capacitor.isNativePlatform()) {
  CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    if (hasOpenModal()) {
      closeTopModal();
    } else if (canGoBack) {
      window.history.back();
    } else {
      CapacitorApp.exitApp();
    }
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
