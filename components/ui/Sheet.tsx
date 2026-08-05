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
        <div className="brand">{brand}</div>
        {children}
      </div>
    </div>
  );
}
