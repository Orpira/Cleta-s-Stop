import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Juegos — orpira.es',
  description:
    'Suite de juegos multijugador en línea: Dominó 3D, ¡Stop!/Basta, Categorías rápidas, Triki y Puntos y Cajas.',
  applicationName: 'orpira · juegos',
  // iPhone: nombre bajo el icono y modo app a pantalla completa al abrirlo
  // desde la pantalla de inicio (el icono es app/apple-icon.png)
  appleWebApp: {
    capable: true,
    title: 'Juegos',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#121b33',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
