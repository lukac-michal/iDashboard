// ============================================================
// ActionButton - Event action button
// ============================================================

import type { ActionButton as ActionButtonType } from '@shared/types';

interface ActionButtonProps {
  action: ActionButtonType;
  showLabel?: boolean;
  onClick: (e: React.MouseEvent) => void;
}

export function ActionButton({ action, showLabel = true, onClick }: ActionButtonProps) {
  const variantClasses = {
    default: 'bg-gray-700 hover:bg-gray-600 text-gray-200',
    primary: 'bg-indigo-600 hover:bg-indigo-500 text-white',
    danger: 'bg-red-600 hover:bg-red-500 text-white',
  };

  const className = variantClasses[action.variant ?? 'default'];

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${className} titlebar-no-drag`}
      title={action.label}
    >
      {showLabel && <span>{action.label}</span>}
    </button>
  );
}
