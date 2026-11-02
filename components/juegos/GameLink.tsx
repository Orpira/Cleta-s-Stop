import Link from 'next/link';
import { ReactNode } from 'react';
import { GameInfo } from '@/lib/games/catalog';

/** Enlace a un juego: interno con <Link>, externo en pestaña nueva. */
export function GameLink({
  game,
  className,
  tabIndex,
  children,
}: {
  game: GameInfo;
  className?: string;
  tabIndex?: number;
  children: ReactNode;
}) {
  if (game.external) {
    return (
      <a href={game.href} target="_blank" rel="noopener noreferrer" className={className} tabIndex={tabIndex}>
        {children}
        <span className="sr-only"> (se abre en otra pestaña)</span>
      </a>
    );
  }
  return (
    <Link href={game.href} className={className} tabIndex={tabIndex}>
      {children}
    </Link>
  );
}
