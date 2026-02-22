/// <reference types="vite/client" />

import type { IDashboardAPI } from '../preload/index';

declare const __APP_VERSION__: string;

declare global {
  interface Window {
    iDashboard: IDashboardAPI;
  }
}
