'use client';
import { useEffect, useState } from 'react';
import { useLanguage } from './language-selector';
import { useT } from './i18n';

// Vista previa de la portada: el panel real de un negocio mediano (dueño, cobrador y caja).
// Los montos están en USD y se muestran en la moneda del visitante.
type Tab = 'owner' | 'collector' | 'cash';
const TABS: Tab[] = ['owner', 'collector', 'cash'];
const WEEK = [1820, 2110, 1960, 2480, 2290, 2950, 2650];
const ROUTES: [number, number, number, number][] = [[1, 38, 46, 820], [2, 29, 40, 610], [3, 44, 52, 760], [4, 17, 35, 460]];
const BRANCHES: [number, number][] = [[1, 640], [2, 455], [3, 303]];

export function HomeShowcase() {
  const { t } = useT();
  const { formatMoney } = useLanguage();
  const [tab, setTab] = useState<Tab>('owner');
  const [auto, setAuto] = useState(true);
  const m = (usd: number) => formatMoney(usd).replace(/\s*\(\$[\d.,]+\)$/, '').replace(/ USD$/, '').replace(/[.,]\d{2}$/, '');

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setTab((x) => TABS[(TABS.indexOf(x) + 1) % TABS.length]), 6000);
    return () => clearInterval(id);
  }, [auto]);

  const pick = (x: Tab) => { setAuto(false); setTab(x); };
  const max = Math.max(...WEEK);
  const card = 'rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900';
  const lbl = 'text-[10px] font-semibold uppercase tracking-wide text-slate-500';

  return (
    <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
      {/* Avisos flotantes: lo que pasa en vivo */}
      <div className="absolute -top-4 end-3 z-10 hidden rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold shadow-lg sm:block dark:border-emerald-500/30 dark:bg-slate-900">
        <span className="text-emerald-600 dark:text-emerald-400">● </span>{t('home.sc.toast1', { n: 3 })} · <span className="text-emerald-600 dark:text-emerald-400">+{m(35)}</span>
      </div>
      <div className="absolute -bottom-4 start-3 z-10 hidden rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-bold shadow-lg sm:block dark:border-amber-500/30 dark:bg-slate-900">
        ⏰ {t('home.sc.toast2', { n: 12 })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        {/* Barra de ventana */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ms-2 truncate rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">veltrixsystem.app</span>
        </div>
        {/* Pestañas por rol */}
        <div className="flex gap-1 border-b border-slate-200 bg-white px-2 pt-2 dark:border-slate-800 dark:bg-slate-900" role="tablist">
          {TABS.map((x) => (
            <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => pick(x)}
              className={`rounded-t-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${tab === x ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
              {x === 'owner' ? '👔 ' : x === 'collector' ? '🛵 ' : '💵 '}{t(`home.sc.tab.${x}`)}
            </button>
          ))}
        </div>

        <div className="min-h-[22rem] p-3 sm:p-4">
          {tab === 'owner' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([['collectedToday', m(2650), '+12 %'], ['salesToday', m(1398), '+8 %'], ['portfolio', m(59300), null], ['overdue', '4,2 %', null]] as const).map(([k, v, d]) => (
                  <div key={k} className={card}>
                    <p className={lbl}>{t(`home.sc.${k}`)}</p>
                    <p className={`mt-1 whitespace-nowrap text-[15px] font-extrabold sm:text-lg ${k === 'overdue' ? 'text-amber-600 dark:text-amber-400' : ''}`}>{v}</p>
                    {d && <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">▲ {d}</p>}
                  </div>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr]">
                <div className={card}>
                  <p className={lbl}>{t('home.sc.week')}</p>
                  <div className="mt-3 flex h-28 items-end gap-1.5">
                    {WEEK.map((v, i) => (
                      <div key={i} title={m(v)} className={`flex-1 rounded-t-md ${i === WEEK.length - 1 ? 'bg-blue-600' : 'bg-blue-200 dark:bg-blue-500/30'}`} style={{ height: `${(v / max) * 100}%` }} />
                    ))}
                  </div>
                  <p className={`mt-3 ${lbl}`}>{t('home.sc.branches')}</p>
                  <ul className="mt-1 space-y-1 text-xs">
                    {BRANCHES.map(([n, v]) => (
                      <li key={n} className="flex justify-between"><span>{t('home.sc.branchN', { n })}</span><span className="font-bold">{m(v)}</span></li>
                    ))}
                  </ul>
                </div>
                <div className={card}>
                  <p className={lbl}>{t('home.sc.routes')}</p>
                  <ul className="mt-2 space-y-2.5">
                    {ROUTES.map(([n, done, total, v]) => (
                      <li key={n}>
                        <div className="flex justify-between text-xs"><span className="font-bold">🛵 {t('home.sc.routeN', { n })}</span><span className="font-bold">{m(v)}</span></div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(done / total) * 100}%` }} />
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-500">{t('home.sc.visited', { done, total })}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {tab === 'collector' && (
            <div className="grid gap-3 sm:grid-cols-[1fr_1.3fr]">
              <div className="space-y-2">
                <div className="rounded-xl bg-blue-600 p-3 text-white">
                  <p className="text-[11px] opacity-80">{t('home.sc.routeN', { n: 1 })} · {t('home.mock.collected')}</p>
                  <p className="text-2xl font-extrabold">{m(820)}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/25"><div className="h-full w-[83%] rounded-full bg-white" /></div>
                  <p className="mt-1 text-[11px] opacity-90">{t('home.sc.progress', { done: 38, total: 46 })}</p>
                </div>
                <div className={card}>
                  <p className={lbl}>{t('home.mock.offline')}</p>
                  <p className="mt-1 text-xs text-slate-500">{t('home.sc.offlineHint')}</p>
                </div>
              </div>
              <ul className="space-y-1.5">
                {([[14, 25, 'paid', '8/24'], [15, 18, 'paid', '12/20'], [16, 40, 'partial', '5/12'], [17, 30, 'late', '9/24'], [18, 22, 'pending', '3/10'], [19, 35, 'pending', '15/24']] as const).map(([n, v, st, q]) => (
                  <li key={n} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                    <div className="min-w-0">
                      <p className="text-xs font-bold">{t('home.mock.client', { n })} <span className="font-normal text-slate-500">· {t('home.sc.installment', { q })}</span></p>
                      <p className={`text-[10px] font-semibold ${st === 'paid' ? 'text-emerald-600 dark:text-emerald-400' : st === 'partial' ? 'text-blue-600 dark:text-blue-400' : st === 'late' ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`}>
                        {st === 'paid' ? t('home.mock.paid') : st === 'partial' ? t('home.sc.partial') : st === 'late' ? t('home.sc.late', { days: 3 }) : t('home.mock.pending')}
                      </p>
                    </div>
                    <span className={`text-sm font-extrabold ${st === 'paid' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{m(v)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === 'cash' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={card}>
                <p className={lbl}>{t('home.sc.closeTitle')} · {t('home.sc.branchN', { n: 1 })}</p>
                <ul className="mt-2 space-y-1.5 text-xs">
                  {([['opening', 100], ['cashSales', 612], ['collections', 820], ['expenses', -45]] as const).map(([k, v]) => (
                    <li key={k} className="flex justify-between"><span>{t(`home.sc.${k}`)}</span><span className={`font-bold ${v < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{v < 0 ? '−' : ''}{m(Math.abs(v))}</span></li>
                  ))}
                  <li className="flex justify-between text-slate-500"><span>{t('home.sc.qr')}</span><span className="font-bold">{m(389)}</span></li>
                </ul>
              </div>
              <div className={`${card} space-y-2`}>
                <div className="flex justify-between text-xs"><span>{t('home.sc.expected')}</span><span className="font-extrabold">{m(1487)}</span></div>
                <div className="flex justify-between text-xs"><span>{t('home.sc.counted')}</span><span className="font-extrabold">{m(1487)}</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm dark:border-slate-800"><span className="font-bold">{t('home.sc.diff')}</span><span className="font-extrabold text-emerald-600 dark:text-emerald-400">{m(0)}</span></div>
                <p className="rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{t('home.sc.approved')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
