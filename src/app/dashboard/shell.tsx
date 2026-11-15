'use client';
import { useEffect, useState } from 'react';
import { rpc } from '../../lib/supabase';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '../theme';
import { HelpButton } from './help';
import { RegionSelectors, ui } from '../site-header';
import { useT } from '../i18n';
import { useSync, SyncButton, NetBanner } from './sync';
import { loadAuth } from '../auth-system';
import type { DictKey } from '../i18n/es';

export type NavItem = { href: string; icon: string; label: DictKey; soon?: boolean; module?: string };

/**
 * Estructura común de todos los paneles: menú lateral (en celular, desplegable),
 * barra superior y contenido al centro.
 */
export function AppShell({
  nav, orgName, userName, roleLabel, onLogout, children, banner,
}: {
  nav: NavItem[];
  orgName: string;
  userName: string;
  roleLabel: string;
  onLogout: () => void;
  children: React.ReactNode;
  banner?: React.ReactNode;
}) {
  const pathname = usePathname();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  // Mensajes sin leer del equipo (insignia en "Mensajes")
  const loadUnread = () => rpc<number>('chat_unread_total').then((n) => setUnread(n ?? 0)).catch(() => {});
  useEffect(() => { loadUnread(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useSync(loadUnread, 5 * 60_000);
  useSync(loadAuth);

  // Menú móvil: se cierra con Escape y no deja mover la página de fondo
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const menu = (
    <nav className="safe-top safe-bottom flex h-full flex-col">
      <div className="px-5 py-5">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
          Veltrix <span className="text-blue-600 dark:text-blue-500">System</span>
        </Link>
        <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{orgName}</p>
      </div>

      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {nav.map((item) => {
          const active = pathname === item.href;
          const base = 'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition';
          if (item.soon) {
            return (
              <li key={item.href}>
                <span className={`${base} cursor-not-allowed text-slate-400 dark:text-slate-600`}>
                  <span className="text-base">{item.icon}</span>
                  <span className="flex-1">{t(item.label)}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {t('nav.soon')}
                  </span>
                </span>
              </li>
            );
          }
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className={`${base} ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span className="flex-1">{t(item.label)}</span>
                {item.href.endsWith('/mensajes') && unread > 0 && (
                  <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold ${active ? 'bg-white text-blue-700' : 'bg-blue-600 text-white'}`}>{unread > 99 ? '99+' : unread}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* En celular el país y el idioma viven aquí (arriba no caben) */}
      <div className="border-t border-slate-200 px-4 pt-4 sm:hidden dark:border-slate-800">
        <RegionSelectors stacked />
      </div>

      <div className="border-t border-slate-200 p-4 dark:border-slate-800 max-sm:border-t-0">
        <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{userName}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{roleLabel}</p>
        <button type="button" onClick={onLogout} className={`${ui.btnGhost} mt-3 w-full !py-2 text-xs`}>
          {t('shell.logout')}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-slate-50 dark:bg-slate-950">
      {/* Menú lateral fijo en pantallas grandes */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900/60">
        <div className="sticky top-0 h-dvh">{menu}</div>
      </aside>

      {/* Menú desplegable en celular */}
      {open && (
        <div className="fixed inset-x-0 top-0 z-40 h-dvh lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-dvh w-72 max-w-[85vw] overflow-y-auto overscroll-contain bg-white shadow-xl rtl:left-auto rtl:right-0 dark:bg-slate-900">{menu}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t('shell.menu')}
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-300 text-lg lg:hidden dark:border-slate-700 cursor-pointer"
          >
            ☰
            {unread > 0 && <span className="absolute -end-1 -top-1 h-3 w-3 rounded-full bg-blue-600 ring-2 ring-white dark:ring-slate-950" />}
          </button>
          <p className="truncate text-sm font-bold text-slate-900 lg:hidden dark:text-white">{orgName}</p>
          <div className="ml-auto flex items-center gap-2 rtl:ml-0 rtl:mr-auto">
            <div className="hidden sm:block"><RegionSelectors /></div>
            <SyncButton />
            <HelpButton />
            <ThemeToggle />
          </div>
        </header>

        <NetBanner />
        {banner}
        <main className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 px-4 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}

/** Barra de uso: "3 de 5" con color según qué tan lleno está */
export function UsageBar({ label, used, max }: { label: string; used: number; max: number | null }) {
  const { t } = useT();
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const color = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-blue-600';
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="text-slate-500 dark:text-slate-400">
          {max === null ? used : t('owner.of', { used, max })}
        </span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.max(pct, used > 0 ? 4 : 0)}%` }} />
      </div>
    </div>
  );
}

/** Tarjeta simple para números y secciones */
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl p-5 ${ui.card} ${className}`}>{children}</div>;
}
