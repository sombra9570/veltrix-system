import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { LanguageProvider } from './language-selector';
import { LangSync } from './i18n';
import { PwaRegister, NoZoom, SplashHide } from './pwa';

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
  appleWebApp: {
    capable: true, title: 'Veltrix', statusBarStyle: 'black-translucent',
    // Pantalla de arranque en iPhone: logo centrado en lugar de blanco
    startupImage: [
      { url: '/splash/440x956@3.png', media: '(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/402x874@3.png', media: '(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/430x932@3.png', media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/393x852@3.png', media: '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/428x926@3.png', media: '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/390x844@3.png', media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/375x812@3.png', media: '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/414x896@3.png', media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/414x896@2.png', media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      { url: '/splash/375x667@2.png', media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      { url: '/splash/414x736@3.png', media: '(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/320x568@2.png', media: '(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
    ],
  },
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

// Pantalla de arranque propia (solo en la app instalada): se pinta con el primer HTML, sin esperar JavaScript
const splashCss = '#vx-splash{display:none}@media (display-mode: standalone){#vx-splash{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#f8fafc;color:#0f172a;font:800 28px system-ui,sans-serif;letter-spacing:-.02em}.dark #vx-splash{background:#020617;color:#fff}#vx-splash img{width:112px;height:112px;object-fit:contain}#vx-splash b{color:#155efd}}';
const splashFallback = "setTimeout(function(){var s=document.getElementById('vx-splash');if(s)s.style.display='none'},8000)";

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
        <style dangerouslySetInnerHTML={{ __html: splashCss }} />
      </head>
      <body className="min-h-full flex flex-col safe-x">
        <div id="vx-splash" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/veltrix-v.png" alt="" width={112} height={112} />
          <span>Veltrix <b>System</b></span>
        </div>
        <script dangerouslySetInnerHTML={{ __html: splashFallback }} />
        <LanguageProvider>
          <LangSync />
          <PwaRegister />
          <SplashHide />
          <NoZoom />
          {/* Franja bajo el reloj y la batería del iPhone (app instalada): siempre oscura para que se lean */}
          <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)] bg-white dark:bg-slate-950" />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
