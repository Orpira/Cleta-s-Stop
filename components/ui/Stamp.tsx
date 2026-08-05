import { ReactNode } from 'react';

export function Stamp({ children }: { children: ReactNode }) {
  return <div className="stamp">{children}</div>;
}
