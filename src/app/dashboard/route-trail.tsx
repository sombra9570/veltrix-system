'use client';
import { useState } from 'react';
import { rpc } from '../../lib/supabase';
import { ui } from '../site-header';
import { useT } from '../i18n';
import type { DictKey } from '../i18n/es';
import { money } from './format';

type Point = {
  kind: 'payment' | 'visit'; at: string; customer: string;
  amount?: number; method?: string; result?: string; lat: number | null; lng: number | null;
};
type Trail = { day: string; tz: string; points: Point[] };

/** Recorrido del cobrador en un día: cada cobro y visita con hora y ubicación.
 *  Solo consulta al abrirlo (no gasta lecturas si nadie lo mira). */
export function RouteTrail({ routeId, currency }: { routeId: string; currency: string }) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState('');
  const [data, setData] = useState<Trail | null>(null);
  const [err, setErr] = useState('');

  const load = async (d: string) => {
    setErr('');
    try { setData(await rpc<Trail>('route_trail', { p_route: routeId, p_day: d || null })); }
    catch { setErr(t('trail.error')); }
  };
  const toggle = () => { const n = !open; setOpen(n); if (n && !data) load(day); };

  const pts = data?.points ?? [];
  const geo = pts.filter((p) => p.lat != null && p.lng != null);
  // Google Maps acepta ~25 paradas en la URL: se toman en orden
  const mapUrl = geo.length
    ? `https://www.google.com/maps/dir/${geo.slice(0, 25).map((p) => `${p.lat},${p.lng}`).join('/')}`
    : null;
  const time = (iso: string) => new Date(iso).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', timeZone: data?.tz });

  return (
    <div className="mt-3">
      <button type="button" onClick={toggle} className={`${ui.btnGhost} cursor-pointer`}>📍 {t('trail.title')} {open ? '▴' : '▾'}</button>
      {open && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" className={`${ui.input} w-auto`} value={day || data?.day || ''}
              onChange={(e) => { setDay(e.target.value); load(e.target.value); }} />
            {mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer" className={ui.btnPrimary}>🗺️ {t('trail.openMap')}</a>}
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          {data && pts.length === 0 && <p className={`text-sm ${ui.muted}`}>{t('trail.empty')}</p>}
          {pts.length > 0 && (
            <>
              <p className={`text-xs ${ui.muted}`}>{t('trail.summary', { n: pts.length, g: geo.length })}</p>
              <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
                {pts.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate">
                      <span className={`tabular-nums ${ui.muted}`}>{time(p.at)}</span>{' '}
                      {p.kind === 'payment' ? '💵' : '👣'} <b>{p.customer}</b>{' '}
                      <span className={ui.muted}>
                        {p.kind === 'payment'
                          ? `${money(Number(p.amount), currency, lang)} · ${t(`cash.m.${p.method}` as DictKey)}`
                          : t(`col.v.${p.result}` as DictKey)}
                      </span>
                    </span>
                    {p.lat != null && p.lng != null
                      ? <a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noopener noreferrer" className="shrink-0 text-blue-600 dark:text-blue-400">📍</a>
                      : <span className={`shrink-0 text-xs ${ui.muted}`}>{t('trail.noGps')}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
