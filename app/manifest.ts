import type { MetadataRoute } from 'next';

// Manifiesto web: nombre, colores e iconos al "Añadir a pantalla de inicio"
// en Android/Chrome. En iPhone se usan app/apple-icon.png y appleWebApp
// (layout.tsx).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'orpira · juegos',
    short_name: 'Juegos',
    description: 'Juega con tus amigos sin instalar nada: Dominó 3D, ¡Stop!, Categorías rápidas, Triki y Puntos y Cajas.',
    lang: 'es',
    start_url: '/juegos',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#121b33',
    theme_color: '#121b33',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
