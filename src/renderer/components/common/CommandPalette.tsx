// ============================================================
// CommandPalette - Cmd+K overlay with quick actions
// ============================================================

import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useDashboardStore } from '@renderer/store/dashboard';

interface Command {
  id: string;
  label: string;
  shortcut: string;
  action: () => void;
}

export function CommandPalette() {
  const backdropRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const setCommandPaletteOpen = useDashboardStore(s => s.setCommandPaletteOpen);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const close = useCallback(() => {
    setCommandPaletteOpen(false);
  }, [setCommandPaletteOpen]);

  const commands: Command[] = useMemo(() => [
    {
      id: 'toggle-visibility',
      label: 'Toggle Visibility',
      shortcut: 'Cmd+H',
      action: () => {
        window.iDashboard?.minimizeWindow();
        close();
      },
    },
    {
      id: 'dismiss-all',
      label: 'Dismiss All',
      shortcut: 'Cmd+D',
      action: () => {
        const events = useDashboardStore.getState().activeEvents;
        const dismiss = useDashboardStore.getState().dismissEvent;
        for (const event of events) {
          dismiss(event.id);
        }
        close();
      },
    },
    {
      id: 'refresh-connectors',
      label: 'Refresh Connectors',
      shortcut: 'Cmd+R',
      action: () => {
        window.iDashboard?.getConnectors();
        close();
      },
    },
  ], [close]);

  // Focus the active button whenever focusedIndex changes
  useEffect(() => {
    itemRefs.current[focusedIndex]?.focus();
  }, [focusedIndex]);

  // Arrow-key navigation scoped to the menu element
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const count = commands.length;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % count);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + count) % count);
      }
    };
    menu.addEventListener('keydown', handleKeyDown);
    return () => menu.removeEventListener('keydown', handleKeyDown);
  }, [commands.length]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) close();
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/60"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-md mx-4"
      >
        <div className="px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-medium text-gray-200">Command Palette</h3>
        </div>
        <ul ref={menuRef} className="py-1" role="menu" aria-label="Commands">
          {commands.map((cmd, idx) => (
            <li key={cmd.id} role="none">
              <button
                ref={(el) => { itemRefs.current[idx] = el; }}
                role="menuitem"
                tabIndex={idx === focusedIndex ? 0 : -1}
                onClick={cmd.action}
                onMouseEnter={() => setFocusedIndex(idx)}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                  idx === focusedIndex
                    ? 'bg-gray-800 text-gray-100'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-gray-100'
                }`}
              >
                <span>{cmd.label}</span>
                <kbd className="text-xs text-gray-500 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5">
                  {cmd.shortcut}
                </kbd>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
