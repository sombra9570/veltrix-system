import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { LanguageProvider } from './language-selector';
import { LangSync } from './i18n';
import { PwaRegister, NoZoom } from './pwa';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://www.veltrixsystem.app'),
  title: { default: 'Veltrix System — control de ventas, caja e inventario para tu negocio', template: '%s | Veltrix System' },
  description: 'Control financiero para tu negocio: ventas, caja, inventario, créditos y cobranza.',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website', url: '/', siteName: 'Veltrix System', locale: 'es_LA',
    title: 'Veltrix System — control de ventas, caja e inventario',
    description: 'Ventas, caja, inventario, créditos y cobranza en un solo sistema, para negocios de 1 a 100 trabajadores.',
  },
  applicationName: 'Veltrix',
  appleWebApp: { capable: true, title: 'Veltrix', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

// Aplica el tema guardado antes de pintar la página (evita el parpadeo).
// Por defecto: oscuro.
// También pinta la barra del teléfono/navegador del mismo color que la app.
const themeScript = `(function(){var d=false;try{d=localStorage.getItem('veltrix_theme')==='dark'}catch(e){}if(d){document.documentElement.classList.add('dark')}var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.name='theme-color';document.head.appendChild(m)}m.content=d?'#020617':'#ffffff'})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col safe-x">
        <LanguageProvider>
          <LangSync />
          <PwaRegister />
          <NoZoom />
          {/* Franja bajo el reloj y la batería del iPhone (app instalada): siempre oscura para que se lean */}
          <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)] bg-white dark:bg-slate-950" />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
