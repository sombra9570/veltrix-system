'use client';
import { useEffect, useState } from 'react';
import { supabase, rpc } from '../../../lib/supabase';
import { Card } from '../shell';
import { ui } from '../../site-header';
import { useT } from '../../i18n';
import type { DictKey } from '../../i18n/es';

type Notice = { id: string; at: string; kind: string; body: string; unread: boolean };
type Liq = { id: string; created_at: string; expected: number; counted: number; difference: number; closing: number };

/** URL temporal (3 días) de la imagen del QR de pago, para verla y mandarla por WhatsApp */
export async function payQrUrl(path: string, seconds = 3 * 86400): Promise<string | null> {
  const { data } = await supabase.storage.from('sale-files').createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

/**
 * Ajustes del cobrador:
 *  - qué le permitió el administrador (solo lectura: los cambia el administrador),
 *  - avisos y cambios hechos por el administrador en su ruta,
 *  - QR de pago de la sucursal,
 *  - reportes de todas las liquidaciones,
 *  - preferencias del teléfono.
 */
export function SettingsScreen({ routeId, perms, payQr, payQrNote, geoOn, onGeo, fmt, online, onNoticesRead }: {
  routeId: string; perms: [DictKey, boolean][]; payQr: string | null; payQrNote: string | null;
  geoOn: boolean; onGeo: (v: boolean) => void; fmt: (n: number) => string; online: boolean; onNoticesRead: () => void;
}) {
  const { t, lang } = useT();
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [liqs, setLiqs] = useState<Liq[] | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    rpc<Notice[]>('collector_notices', { p_route: routeId })
      .then(async (n) => {
        if (dead) return;
        setNotices(n ?? []);
        if ((n ?? []).some((x) => x.unread)) { await rpc('collector_notices_read', { p_route: routeId }).catch(() => undefined); onNoticesRead(); }
      })
      .catch(() => { if (!dead) setNotices([]); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  useEffect(() => {
    if (!payQr || !online) { setQrUrl(null); return; }
    payQrUrl(payQr, 3600).then(setQrUrl).catch(() => setQrUrl(null));
  }, [payQr, online]);

  const loadLiqs = async () => {
    try { setLiqs(await rpc<Liq[]>('route_liquidations_list', { p_route: routeId, p_limit: 50 })); } catch { setLiqs([]); }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">⚙️ {t('cx.set.title')}</h2>

      <Card className="space-y-2">
        <p className="font-bold">🔑 {t('cx.set.perms')}</p>
        <p className={`text-xs ${ui.muted}`}>{t('cx.set.permsHint')}</p>
        <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
          {perms.map(([k, on]) => (
            <li key={k} className="flex items-center justify-between gap-2 py-1.5">
              <span>{t(k)}</span>
              <span className={`shrink-0 text-xs font-bold ${on ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>{on ? `✓ ${t('cx.set.on')}` : `✕ ${t('cx.set.off')}`}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-2">
        <p className="font-bold">🔔 {t('cx.set.notices')}</p>
        {notices === null ? <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>
          : notices.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('cx.set.noNotices')}</p> : (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {notices.map((n) => (
                <li key={n.id} className="py-1.5">
                  <p className={n.unread ? 'font-bold' : ''}>{n.body}</p>
                  <p className={`text-[11px] ${ui.muted}`}>{new Date(n.at).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </li>
              ))}
            </ul>
          )}
      </Card>

      <Card className="space-y-2">
        <p className="font-bold">📱 {t('cx.set.qr')}</p>
        {!payQr ? <p className={`text-sm ${ui.muted}`}>{t('cx.set.noQr')}</p>
          : qrUrl ? (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt={t('cx.set.qr')} className="mx-auto max-h-64 rounded-xl bg-white p-2" />
              {payQrNote && <p className="mt-1 text-sm font-semibold">{payQrNote}</p>}
              <p className={`mt-1 text-xs ${ui.muted}`}>{t('cx.set.qrHint')}</p>
            </div>
          ) : <p className={`text-sm ${ui.muted}`}>{online ? t('common.wait') : t('cx.set.qrOffline')}</p>}
      </Card>

      <Card className="space-y-2">
        <p className="font-bold">📋 {t('cx.set.reports')}</p>
        {liqs === null ? (
          <button type="button" onClick={loadLiqs} disabled={!online} className={ui.btnGhost}>{t('cx.set.loadReports')}</button>
        ) : liqs.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('cx.set.noReports')}</p> : (
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {liqs.map((l) => (
              <li key={l.id} className="py-1.5">
                <div className="flex justify-between"><span className={ui.muted}>{new Date(l.created_at).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' })}</span><b>{fmt(Number(l.closing))}</b></div>
                <p className={`text-[11px] ${Number(l.difference) < 0 ? 'text-red-600 dark:text-red-400' : ui.muted}`}>
                  {t('liq.lineSummary', { expected: fmt(Number(l.expected)), counted: fmt(Number(l.counted)), diff: fmt(Number(l.difference)) })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-2">
        <p className="font-bold">📲 {t('cx.set.prefs')}</p>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>{t('cx.set.geo')}</span>
          <input type="checkbox" checked={geoOn} onChange={(e) => onGeo(e.target.checked)} className="h-5 w-5" />
        </label>
      </Card>
    </div>
  );
}
