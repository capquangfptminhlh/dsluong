import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './shell-fixes.css';
import AppRouter from './AppRouter.jsx';
import './landing-polish.css';
import './layout-audit.css';
import './ui-refresh.css';
import './mobile-layout-v2.css';
import './interaction-layout-fixes.css';
import './tourist-reference-refresh.css';
import './commercial-system-v2.css';
import './commercial-motion-v1.css';
import './button-motion-v2.css';
import './mobile-pc-parity-v1.css';
import './readability-final-v1.css';
import './mobile-color-system-v2.css';
import './pos-final-fix.css';
import './pos-viewport-fix.css';
import './app-light-final.css';
import './app-contrast-final.css';
import './pos-motion-final.css';
import './landing-color-final.css';
import './typography-final.css';
import './sidebar-light-final.css';
import './shell-ui-final.css';
import './pwa-mobile.css';
import { installAutoTaxButtonMotion } from './button-motion.js';
import { registerAutoTaxPWA } from './pwa-client.js';
import PWAStatus from './components/PWAStatus.jsx';

installAutoTaxButtonMotion();
registerAutoTaxPWA();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRouter />
    <PWAStatus />
  </StrictMode>,
);
