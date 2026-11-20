'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../../lib/supabase';
import { Card, useHeaderSlot } from '../shell';
import { ui } from '../../site-header';
import { useT } from '../../i18n';
import type { DictKey } from '../../i18n/es';
import { money } from '../format';
import { useStaff } from '../staff-context';
import { MenuTile } from '../collector/tiles';
import { CreditCard, type Credit } from '../collector/credit-card';
import { CutForm, type Period } from '../collector/cut-form';
import { DeliveryMap, type MapPoint } from '../delivery-map';
import { RATING_DOT } from '../collector/loan-form';

/* Panel del supervisor de cobranza: sus rutas asignadas; cada acción queda grabada y al terminar se envía el reporte al administrador */
type RawCredit = { id: string; created: string; total: number; every_days: number | null; i?: [number, string, number, number, string | null][] };
type Cust = { id: string; name: string; phone: string | null; address: string | null; tax_id: string | null; lat: number | null; lng: number | null; rating: string; balance: number; overdue: number; credits: RawCredit[] };
type RouteLite = { id: string; name: string; collector: string | null; locked: boolean; currency: string; customers: number; supervising: boolean };
type Detail = {
  id: string; name: string; locked: boolean; collector: string | null; currency: string; balance: number; period: Period; portfolio: number;
  liquidations: { id: string; created_at: string; closing: number; difference: number }[];
  can_liquidate: boolean; supervising: boolean; customers: Cust[];
};
type Screen = 'home' | 'list' | 'map' | 'info' | 'liq' | 'notes' | 'rate';
const toCredit = (k: RawCredit): Credit => ({
  id: k.id, created: k.created, total: k.total, every_days: k.every_days,
  installments: (k.i ?? []).map(([n, due, amount, paid, last_at]) => ({ id: `${k.id}:${n}`, n, due, amount: Number(amount), paid: Number(paid), last_at })),
});

function Stars({ onPick, label }: { onPick: (n: number) => void; label: string }) {
  const [v, setV] = useState(0);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold">{label}</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => { setV(n); onPick(n); }} className={`text-2xl cursor-pointer ${n <= v ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`} aria-label={String(n)}>★</button>
      ))}
    </div>
  );
}

export default function SupPanel() {
  const { t, lang } = useT();
  const { userName } = useStaff();
  const [routes, setRoutes] = useState<RouteLite[] | null>(null);
  const [rid, setRid] = useState<string | null>(null);
  const [d, setD] = useState<Detail | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [sel, setSel] = useState<Cust | null>(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [phone, setPhone] = useState('');

  const loadList = useCallback(async () => {
    try { setRoutes((await rpc<RouteLite[]>('sup_my_routes')) ?? []); } catch { setRoutes([]); }
  }, []);
  const loadRoute = useCallback(async (id: string) => {
    try { setD(await rpc<Detail>('sup_route_detail', { p_route: id })); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (rid) loadRoute(rid); else setD(null); }, [rid, loadRoute]);

  const back = () => {
    if (sel) setSel(null);
    else if (screen !== 'home') setScreen('home');
    else if (rid) { setRid(null); loadList(); }
  };
  const titles: Record<string, string> = { list: 'rt.list', map: 'rt.map', info: 'nav.routeInfo', liq: 'rt.liq', notes: 'sp.notes', rate: 'sp.rateCollector' };
  useHeaderSlot({
    title: userName,
    subtitle: rid && d ? `${d.name}${screen !== 'home' ? ' · ' + (sel ? sel.name : t(titles[screen] as DictKey)) : ''}` : (routes ?? []).map((r) => r.name).join(' · '),
    onBack: rid ? back : undefined,
  }, [userName, rid, d?.name, screen, sel?.id, routes?.length, lang]);

  const run = async (fn: () => Promise<unknown>, okText?: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (okText) setMsg({ ok: true, text: okText }); if (rid) await loadRoute(rid); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  };
  const log = (action: string, detail: Record<string, unknown> = {}) => rpc('sup_log', { p_route: rid, p_action: action, p_detail: detail });

  const box = (ok: boolean) => ok ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
    : 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';
  const flash = msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${box(msg.ok)}`}>{msg.text}</p>;

  // ---- Lista de rutas asignadas ----
  if (!rid) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-extrabold sm:text-2xl">🛵 {t('sp.title')}</h1>
        {flash}
        {routes === null ? <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p> : routes.length === 0 ? <Card><p className={`text-sm ${ui.muted}`}>{t('sp.none')}</p></Card> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {routes.map((r) => (
              <button key={r.id} type="button" onClick={() => { setScreen('home'); setSel(null); setMsg(null); setRid(r.id); }} className="text-start cursor-pointer">
                <Card className="space-y-1 transition hover:shadow-md">
                  <p className="font-bold">🛵 {r.name}</p>
                  <p className={`text-xs ${ui.muted}`}>{t('sp.collector', { name: r.collector ?? '—' })} · {t('sp.nCust', { n: r.customers })}</p>
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                    {r.supervising && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{t('sp.supervising')}</span>}
                    {r.locked && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700 dark:bg-red-500/15 dark:text-red-300">🔒 {t('sp.locked')}</span>}
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!d) return <p className={`text-sm ${ui.muted}`}>{msg?.text ?? t('common.wait')}</p>;
  const m = (n: number) => money(Number(n), d.currency, lang);
  const today = new Date().toISOString().slice(0, 10);
  const list = d.customers.filter((c) => { const s = q.trim().toLowerCase(); return !s || c.name.toLowerCase().includes(s) || (c.address ?? '').toLowerCase().includes(s); });
  const points: MapPoint[] = d.customers.filter((c) => c.lat != null && c.lng != null).map((c) => ({ lat: Number(c.lat), lng: Number(c.lng), label: c.name, icon: Number(c.overdue) > 0 ? '🔴' : '📍' }));

  const finish = async () => {
    if (!window.confirm(t('sp.finishConfirm'))) return;
    setBusy(true); setMsg(null);
    try { await rpc('sup_finish', { p_route: rid }); setRid(null); await loadList(); setMsg({ ok: true, text: t('sp.finished') }); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message.includes('SUPERVISION_NOT_STARTED') ? t('err.generic') : (e as Error).message }); }
    finally { setBusy(false); }
  };
  const setLoc = (c: Cust) => {
    if (!('geolocation' in navigator)) { setMsg({ ok: false, text: t('sp.noGps') }); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => run(() => rpc('sup_update_customer', { p_route: rid, p_customer: c.id, p_phone: null, p_lat: p.coords.latitude, p_lng: p.coords.longitude }), t('sp.done')),
      () => setMsg({ ok: false, text: t('sp.noGps') }), { enableHighAccuracy: true, timeout: 20000 });
  };

  return (
    <div className="space-y-4">
      {flash}
      {d.locked && screen === 'home' && <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">🔒 {t('sp.lockedInfo')}</p>}

      {screen === 'home' && (
        <>
          <div className="grid max-w-xl grid-cols-2 gap-3">
            <MenuTile icon="users" label={t('rt.list')} tone="blue" onClick={() => setScreen('list')} />
            <MenuTile icon="pin" label={t('rt.map')} tone="blue" onClick={() => setScreen('map')} />
            <MenuTile icon="receipt" label={t('nav.routeInfo')} tone="plain" onClick={() => setScreen('info')} />
            {d.can_liquidate && <MenuTile icon="refresh" label={t('rt.liq')} tone="amber" onClick={() => setScreen('liq')} />}
            <MenuTile icon="sliders" label={d.locked ? t('sp.unlock') : t('sp.lock')} tone="plain" disabled={busy}
              onClick={() => run(() => rpc('sup_set_lock', { p_route: rid, p_lock: !d.locked }))} />
            <MenuTile icon="clock" label={t('sp.notes')} tone="plain" onClick={() => setScreen('notes')} />
            <MenuTile icon="wallet" label={t('sp.rateCollector')} tone="plain" onClick={() => setScreen('rate')} />
          </div>
          <button type="button" disabled={busy} onClick={finish} className={`${ui.btnPrimary} w-full max-w-xl py-3`}>✅ {t('sp.finish')}</button>
        </>
      )}

      {screen === 'list' && !sel && (
        <Card className="space-y-3">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('cust.search')} className={ui.input} />
          {list.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('rt.noCust')}</p> : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {list.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => { setSel(c); setPhone(c.phone ?? ''); }} className="flex w-full items-center gap-3 py-3 text-start cursor-pointer">
                    <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${RATING_DOT[c.rating] ?? RATING_DOT.new}`} />
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{c.name}</span><span className={`block truncate text-xs ${ui.muted}`}>{c.address ?? c.phone ?? '—'}</span></span>
                    <span className="shrink-0 text-end text-xs"><b className="block">{t('rt.owes', { amount: m(c.balance) })}</b>
                      {Number(c.overdue) > 0 && <span className="font-semibold text-red-600 dark:text-red-400">{t('rt.late', { amount: m(c.overdue) })}</span>}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {screen === 'list' && sel && (
        <div className="space-y-3">
          <Card className="space-y-3 text-sm">
            <p className="text-lg font-extrabold">{sel.name}</p>
            {sel.address && <p className={ui.muted}>📍 {sel.address}</p>}
            {sel.tax_id && <p className={ui.muted}>🪪 {sel.tax_id}</p>}
            <p className="font-bold">{t('rt.owes', { amount: m(sel.balance) })}{Number(sel.overdue) > 0 && <span className="text-red-600 dark:text-red-400"> · {t('rt.late', { amount: m(sel.overdue) })}</span>}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={() => run(() => log('verify_customer', { customer: sel.name }), t('sp.done'))} className={`${ui.btnGhost} !py-2 text-xs`}>✔ {t('sp.verifyCust')}</button>
              <button type="button" disabled={busy} onClick={() => run(() => log('verify_credit', { customer: sel.name }), t('sp.done'))} className={`${ui.btnGhost} !py-2 text-xs`}>✔ {t('sp.verifyCredit')}</button>
            </div>
            <Stars label={t('sp.rate')} onPick={(n) => run(() => log('rate_customer', { customer: sel.name, score: n }), t('sp.done'))} />
            <div className="flex gap-2">
              <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('sp.phone')} className={ui.input} />
              <button type="button" disabled={busy || !phone.trim() || phone.trim() === (sel.phone ?? '')}
                onClick={() => run(async () => { await rpc('sup_update_customer', { p_route: rid, p_customer: sel.id, p_phone: phone, p_lat: null, p_lng: null }); setSel({ ...sel, phone: phone.trim() }); }, t('sp.done'))}
                className={`${ui.btnPrimary} shrink-0 !px-3 text-xs`}>{t('sp.savePhone')}</button>
            </div>
            <button type="button" disabled={busy} onClick={() => setLoc(sel)} className={`${ui.btnGhost} w-full !py-2 text-xs`}>📍 {t('sp.setLoc')}</button>
          </Card>
          {sel.credits.length === 0 ? <Card><p className={`text-sm ${ui.muted}`}>{t('card.noCards')}</p></Card> : sel.credits.map((k) => (
            <Card key={k.id}>
              <p className={`mb-2 text-xs ${ui.muted}`}>{new Date(k.created).toLocaleDateString(lang)} · {m(k.total)}</p>
              <CreditCard credit={toCredit(k)} today={today} fmt={m} onSave={() => undefined} readOnly />
            </Card>
          ))}
        </div>
      )}

      {screen === 'map' && (
        <Card>{points.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('rt.noMapPts')}</p> : <DeliveryMap points={points} height={460} names />}</Card>
      )}

      {screen === 'info' && (
        <Card>
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {([
              [t('cx.sum.prev'), Number(d.period.opening), ''],
              [t('cx.sum.collected'), Number(d.period.collected_cash) + Number(d.period.collected_digital), 'text-emerald-600 dark:text-emerald-400'],
              [t('cx.sum.lent'), Number(d.period.lent), 'text-violet-600 dark:text-violet-400'],
              [t('cx.sum.expenses'), Number(d.period.collector_expenses), 'text-red-600 dark:text-red-400'],
              [t('cx.sum.current'), Number(d.balance), ''],
              [t('cx.sum.portfolio'), Number(d.portfolio), ''],
            ] as [string, number, string][]).map(([label, v, cls]) => (
              <li key={label} className="flex items-center justify-between gap-3 py-2.5"><span className={`text-sm ${ui.muted}`}>{label}</span><b className={`text-lg ${cls}`}>{m(v)}</b></li>
            ))}
          </ul>
        </Card>
      )}

      {screen === 'liq' && d.can_liquidate && (
        <CutForm routeId={d.id} routeName={d.name} period={d.period} m={m} onCancel={() => setScreen('home')}
          onDone={async (text) => { try { await log('liquidate', { text }); } catch { /* el corte ya se hizo */ } setScreen('home'); await loadRoute(d.id); setMsg({ ok: true, text }); }}
          onError={(text) => setMsg({ ok: false, text })} />
      )}

      {screen === 'notes' && (
        <Card className="space-y-3">
          <p className={`text-xs ${ui.muted}`}>{t('sp.notesHint')}</p>
          <textarea rows={5} value={note} onChange={(e) => setNote(e.target.value)} className={ui.input} />
          <button type="button" disabled={busy || !note.trim()} onClick={() => run(async () => { await log('note', { text: note.trim() }); setNote(''); }, t('sp.noteSaved'))} className={`${ui.btnPrimary} w-full`}>💾 {t('prod.save')}</button>
        </Card>
      )}

      {screen === 'rate' && (
        <Card className="space-y-3">
          <p className="font-bold">🛵 {d.collector ?? '—'}</p>
          <Stars label={t('sp.rateCollector')} onPick={(n) => run(() => log('rate_collector', { score: n }), t('sp.done'))} />
        </Card>
      )}
    </div>
  );
}
