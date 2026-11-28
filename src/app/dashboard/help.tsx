'use client';
import { useEffect, useMemo, useState } from 'react';
import { ui } from '../site-header';
import { useT } from '../i18n';
import type { DictKey } from '../i18n/es';
import { IconClose } from '../icons';

const N = 10;

/** Ayuda rápida: las 10 dudas más comunes, en el idioma del usuario. Gratis y sin conexión. */
export function HelpButton() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const items = useMemo(() => {
    const all = Array.from({ length: N }, (_, i) => ({
      i, q: t(`help.q${i + 1}` as DictKey), a: t(`help.a${i + 1}` as DictKey),
    }));
    const s = q.trim().toLowerCase();
    return s ? all.filter((x) => x.q.toLowerCase().includes(s) || x.a.toLowerCase().includes(s)) : all;
  }, [q, t]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t('help.title')} title={t('help.title')}
        className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-base font-bold hover:border-slate-400 cursor-pointer dark:border-slate-700 dark:bg-slate-900">
        ?
      </button>

      {open && (
        <div className="fixed inset-x-0 top-0 z-50 h-dvh">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[90dvh] max-w-2xl flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-extrabold">❓ {t('help.title')}</h2>
                <p className={`text-xs ${ui.muted}`}>{t('help.subtitle')}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t('pos.close')} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-300 cursor-pointer dark:border-slate-700"><IconClose /></button>
            </div>
            <div className="p-5 pb-2">
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('help.search')} className={ui.input} />
            </div>
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 pb-5">
              {items.length === 0 && <li className={`py-6 text-center text-sm ${ui.muted}`}>{t('help.noResults')}</li>}
              {items.map((x) => {
                const isOpen = openIdx === x.i || q.trim() !== '';
                return (
                  <li key={x.i} className="rounded-2xl border border-slate-200 dark:border-slate-800">
                    <button type="button" onClick={() => setOpenIdx(openIdx === x.i ? null : x.i)}
                      className="flex w-full items-center gap-3 p-4 text-left font-semibold cursor-pointer">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{x.i + 1}</span>
                      <span className="flex-1">{x.q}</span>
                      <span className={ui.muted}>{isOpen ? '−' : '+'}</span>
                    </button>
                    {isOpen && <p className="whitespace-pre-line px-4 pb-4 ps-14 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{x.a}</p>}
                  </li>
                );
              })}
            </ul>
            <div className={`border-t border-slate-200 p-4 text-center text-xs ${ui.muted} dark:border-slate-800`}>
              {t('help.more')}{' '}
              <a href="mailto:hola@veltrixsystem.app" className="font-bold text-blue-600 dark:text-blue-400">hola@veltrixsystem.app</a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
