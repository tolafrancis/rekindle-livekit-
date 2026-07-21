import { createRoot } from 'react-dom/client';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
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
}

createRoot(document.getElementById('root')!).render(<App />);
