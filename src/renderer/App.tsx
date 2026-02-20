// ============================================================
// App - Root component
// ============================================================

import { useIPCSync } from '@renderer/hooks/useIPCSync';
import { TitleBar } from '@renderer/components/layout/TitleBar';
import { NetworkStatusBar } from '@renderer/components/common/NetworkStatusBar';
import { AdaptiveGrid } from '@renderer/components/layout/AdaptiveGrid';

export default function App() {
  // Sync main process state with Zustand store
  useIPCSync();

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      <TitleBar />
      <NetworkStatusBar />
      <main className="flex-1 min-h-0">
        <AdaptiveGrid />
      </main>
    </div>
  );
}
