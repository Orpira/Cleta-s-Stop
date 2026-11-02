import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Juegos — orpira.es',
  description:
    'Suite de juegos multijugador en línea: Dominó 3D, ¡Stop!/Basta, Categorías rápidas, Triki y Puntos y Cajas.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
