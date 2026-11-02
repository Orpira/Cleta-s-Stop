'use client';

import { MouseEvent } from 'react';

/**
 * Enlace visible para volver a la portada de la suite y cambiar de juego.
 * Con una partida en marcha pide confirmación: salir no te saca de la sala
 * (puedes volver con el mismo enlace), pero sí te pierdes lo que pase mientras.
 */
export function BackToGames({ leaveWarning = false }: { leaveWarning?: boolean }) {
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!leaveWarning) return;
    const ok = window.confirm(
      'Hay una partida en marcha. ¿Volver a la lista de juegos? Puedes regresar a esta sala con el mismo enlace.'
    );
    if (!ok) e.preventDefault();
  }

  return (
    <a href="/juegos" className="back-to-games" onClick={onClick}>
      <span aria-hidden="true">←</span> Todos los juegos
    </a>
  );
}
