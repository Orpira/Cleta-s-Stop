import { ReactNode } from 'react';
import { BackToGames } from './BackToGames';

interface SheetProps {
  brand: string;
  maxWidth?: number;
  /** Pide confirmación al volver a la portada (partida en marcha). */
  leaveWarning?: boolean;
  children: ReactNode;
}

export function Sheet({ brand, maxWidth, leaveWarning, children }: SheetProps) {
  return (
    <div className="page">
      <div className="sheet" style={maxWidth ? { maxWidth } : undefined}>
        <div className="sheet-top">
          <BackToGames leaveWarning={leaveWarning} />
          <span className="brand">{brand}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
