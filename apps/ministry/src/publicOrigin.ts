// Registers this app's public web origin for share/invite links (see
// publicWebOrigin() in @rekindle/features/platform). Imported first in main.tsx
// so it is set before any module builds a link at import time. Inside the
// Capacitor/Electron shells window.location.origin is a private localhost
// address, so links have to point at the real site instead.
import { setPublicWebOrigin } from '@rekindle/features/platform';

setPublicWebOrigin(import.meta.env.VITE_MINISTRY_APP_URL || 'https://rekindlebc.com');
