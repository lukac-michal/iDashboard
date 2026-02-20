/// <reference types="vite/client" />

import type { IDashboardAPI } from '../preload/index';

declare global {
  interface Window {
    iDashboard: IDashboardAPI;
  }
}
