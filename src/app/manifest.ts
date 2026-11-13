import type { MetadataRoute } from 'next';

// Hace que Veltrix se pueda instalar como app (PWA) en teléfonos y computadoras
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Veltrix System',
    short_name: 'Veltrix',
    description: 'Ventas, caja, inventario, créditos y cobranza para tu negocio.',
    start_url: '/ingresar',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#020617',
    theme_color: '#2563eb',
    lang: 'es',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
