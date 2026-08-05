import { ReactNode } from 'react';

interface PlayerChipProps {
  children: ReactNode;
  actions?: ReactNode;
}

export function PlayerChip({ children, actions }: PlayerChipProps) {
  return (
    <div className="player-chip">
      <span>{children}</span>
      {actions}
    </div>
  );
}
