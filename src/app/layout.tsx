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
  title: 'Veltrix System',
  description: 'Control financiero para tu negocio: ventas, caja, inventario, créditos y cobranza.',
  applicationName: 'Veltrix',
  appleWebApp: { capable: true, title: 'Veltrix', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#020617',
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
const themeScript = `(function(){var d=true;try{d=localStorage.getItem('veltrix_theme')!=='light'}catch(e){}if(d){document.documentElement.classList.add('dark')}var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.name='theme-color';document.head.appendChild(m)}m.content=d?'#020617':'#ffffff'})()`;

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
          <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)] bg-slate-950" />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
