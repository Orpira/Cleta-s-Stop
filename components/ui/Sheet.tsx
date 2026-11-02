import { ReactNode } from 'react';

interface SheetProps {
  brand: string;
  maxWidth?: number;
  children: ReactNode;
}

export function Sheet({ brand, maxWidth, children }: SheetProps) {
  return (
    <div className="page">
      <div className="sheet" style={maxWidth ? { maxWidth } : undefined}>
        <a href="/juegos" className="brand" title="Volver a todos los juegos">
          {brand}
        </a>
        {children}
      </div>
    </div>
  );
}
