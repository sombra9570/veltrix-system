'use client';
import { useEffect, useState } from 'react';
import { useT } from './i18n';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Registra el service worker (necesario para instalar la app y abrirla sin internet). */
export function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Botón "Instalar app": en Android/PC abre el instalador; en iPhone muestra cómo hacerlo. */
export function InstallAppButton({ className = '' }: { className?: string }) {
  const { t } = useT();
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as InstallEvent); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || (!deferred && !ios)) return null;

  const onClick = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    } else {
      setShowIosHelp(true);
    }
  };

  return (
    <>
      <button type="button" onClick={onClick} className={className}>
        📲 {t('pwa.install')}
      </button>
      {showIosHelp && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setShowIosHelp(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-slate-900 shadow-xl dark:bg-slate-900 dark:text-white" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">{t('pwa.iosTitle')}</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t('pwa.iosSteps')}</p>
            <button type="button" onClick={() => setShowIosHelp(false)} className="mt-4 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white cursor-pointer">
              {t('pwa.close')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
