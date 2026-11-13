'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '../theme';
import { RegionSelectors, ui } from '../site-header';
import { useT } from '../i18n';
import type { DictKey } from '../i18n/es';

export type NavItem = { href: string; icon: string; label: DictKey; soon?: boolean };

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

  const menu = (
    <nav className="flex h-full flex-col">
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
                <span>{t(item.label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
        <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{userName}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{roleLabel}</p>
        <button type="button" onClick={onLogout} className={`${ui.btnGhost} mt-3 w-full !py-2 text-xs`}>
          {t('shell.logout')}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Menú lateral fijo en pantallas grandes */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900/60">
        <div className="sticky top-0 h-screen">{menu}</div>
      </aside>

      {/* Menú desplegable en celular */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl rtl:left-auto rtl:right-0 dark:bg-slate-900">{menu}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t('shell.menu')}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 text-lg lg:hidden dark:border-slate-700 cursor-pointer"
          >
            ☰
          </button>
          <p className="truncate text-sm font-bold text-slate-900 lg:hidden dark:text-white">{orgName}</p>
          <div className="ml-auto flex items-center gap-2 rtl:ml-0 rtl:mr-auto">
            <div className="hidden sm:block"><RegionSelectors /></div>
            <ThemeToggle />
          </div>
        </header>

        {banner}
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
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
