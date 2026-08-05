import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '¡Stop! — orpira.es',
  description: 'El clásico juego de Stop / Basta, en línea y multijugador.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
