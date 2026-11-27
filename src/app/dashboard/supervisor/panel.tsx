'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc, supabase } from '../../../lib/supabase';
import { Card, useHeaderSlot } from '../shell';
import { ui } from '../../site-header';
import { useT } from '../../i18n';
import type { DictKey } from '../../i18n/es';
import { money } from '../format';
import { useStaff } from '../staff-context';
import { MenuTile } from '../collector/tiles';
import { CreditCard, freqOf, type Credit, type Freq } from '../collector/credit-card';
import { ShowMore } from '../paged';
import { Credits } from '../collector/credits';
import { NewClient } from '../collector/new-client';
import { CutForm, type Period } from '../collector/cut-form';
import { DeliveryMap, type MapPoint } from '../delivery-map';
import { RATING_DOT } from '../collector/loan-form';

/* Panel del supervisor de cobranza: sus rutas asignadas; cada acción queda grabada y al terminar se envía el reporte al administrador */
type RawCredit = { id: string; created: string; total: number; every_days: number | null; i?: [number, string, number, number, string | null][] };
type Cust = { id: string; name: string; phone: string | null; address: string | null; tax_id: string | null; lat: number | null; lng: number | null; rating: string; sup_rating: string | null; balance: number; overdue: number; credits: Credit[];
  due_today: number; paid_today: boolean; visited_today: boolean; next_due: string | null;
  last_visit: { at: string; result: string; notes: string | null; promise_date: string | null } | null };
type RouteLite = { id: string; name: string; collector: string | null; locked: boolean; currency: string; customers: number; supervising: boolean };
type Detail = {
  id: string; name: string; locked: boolean; collector: string | null; currency: string; balance: number; period: Period; portfolio: number;
  liquidations: { id: string; created_at: string; closing: number; difference: number }[];
  can_liquidate: boolean; supervising: boolean; customers: Cust[]; org_id: string; today: string; can_customers: boolean; can_delete_installments: boolean;
};
const SUP_RATINGS = ['excellent', 'good', 'bad', 'clavo', 'volado', 'suspicious'] as const;
const SR_TONE: Record<string, string> = {
  excellent: 'bg-emerald-600 text-white', good: 'bg-lime-500 text-white', bad: 'bg-orange-500 text-white',
  clavo: 'bg-red-600 text-white', volado: 'bg-slate-700 text-white', suspicious: 'bg-purple-600 text-white',
};
type Screen = 'home' | 'list' | 'pending' | 'newclient' | 'map' | 'info' | 'liq' | 'notes' | 'rate';
const toCredit = (k: RawCredit): Credit => ({
  id: k.id, created: k.created, total: k.total, every_days: k.every_days,
  installments: (k.i ?? []).map(([n, due, amount, paid, last_at]) => ({ id: `${k.id}:${n}`, n, due, amount: Number(amount), paid: Number(paid), last_at })),
});

function RateRow({ cur, busy, onPick }: { cur: string | null; busy: boolean; onPick: (r: string) => void }) {
  const { t } = useT();
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold">⭐ {t('sr.title')}</p>
      <div className="flex flex-wrap gap-1.5">
        {SUP_RATINGS.map((r) => (
          <button key={r} type="button" disabled={busy} onClick={() => onPick(r)}
            className={`rounded-full px-3 py-1 text-xs font-bold cursor-pointer disabled:opacity-50 ${cur === r ? SR_TONE[r] : 'border border-slate-300 dark:border-slate-700'}`}>
            {t(`sr.${r}` as DictKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

const RATE_KEYS = ['overall', 'punctuality', 'temperament', 'efficiency', 'responsibility', 'communication', 'condition', 'vehicle_care'] as const;
const RATE_LABEL: Record<(typeof RATE_KEYS)[number], DictKey> = {
  overall: 'cr.overall', punctuality: 'cr.punctuality', temperament: 'cr.temperament', efficiency: 'cr.efficiency',
  responsibility: 'cr.responsibility', communication: 'cr.communication', condition: 'cr.condition', vehicle_care: 'cr.vehicle',
};

/** Calificación mensual del cobrador por criterios (1 a 5 estrellas): la hace el supervisor en ruta y solo la ve el administrador */
function RateCollector({ route, collector }: { route: string; collector: string | null }) {
  const { t } = useT();
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [rated, setRated] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { rpc<boolean>('sup_collector_rated', { p_route: route }).then((v) => setRated(!!v)).catch(() => setRated(false)); }, [route]);
  const complete = RATE_KEYS.every((k) => scores[k] >= 1);
  const save = async () => {
    if (!complete) return setMsg({ ok: false, text: t('cr.needAll') });
    setBusy(true); setMsg(null);
    try {
      await rpc('sup_rate_collector', { p_route: route, p_scores: scores, p_notes: notes.trim() || null });
      setRated(true); setMsg({ ok: true, text: t('cr.done') });
    } catch (e) {
      const m = (e as Error).message ?? '';
      setMsg({ ok: false, text: m.includes('RATING_ALREADY_THIS_MONTH') ? t('cr.already') : m.includes('RATING_NEEDS_SUPERVISION') ? t('cr.needSupervision') : m });
    } finally { setBusy(false); }
  };
  return (
    <Card className="space-y-3">
      <p className="font-bold">🛵 {collector ?? '—'}</p>
      {rated ? <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{msg?.ok ? msg.text : t('cr.already')}</p> : (
        <>
          <ul className="space-y-2">
            {RATE_KEYS.map((k) => (
              <li key={k} className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-sm font-semibold">{t(RATE_LABEL[k])}</span>
                <span className="flex shrink-0">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setScores((x) => ({ ...x, [k]: n }))} aria-label={`${n}`}
                      className={`text-2xl cursor-pointer ${n <= (scores[k] ?? 0) ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`}>★</button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <div>
            <label className={ui.label}>{t('cr.notes')}</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={ui.input} />
          </div>
          {msg && !msg.ok && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{msg.text}</p>}
          <button type="button" disabled={busy} onClick={save} className={`${ui.btnPrimary} w-full`}>💾 {t('cr.save')}</button>
        </>
      )}
    </Card>
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
  const [freq, setFreq] = useState<Freq | 'all'>('all');
  const [limit, setLimit] = useState(25);
  useEffect(() => { setLimit(25); }, [freq, q, rid]);

  const loadList = useCallback(async () => {
    try { setRoutes((await rpc<RouteLite[]>('sup_my_routes')) ?? []); } catch { setRoutes([]); }
  }, []);
  const loadRoute = useCallback(async (id: string) => {
    try {
      const raw = await rpc<Omit<Detail, 'customers'> & { customers: (Omit<Cust, 'credits'> & { credits: RawCredit[] })[] }>('sup_route_detail', { p_route: id });
      setD({ ...raw, customers: raw.customers.map((c) => ({ ...c, credits: (c.credits ?? []).map(toCredit) })) });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (rid) loadRoute(rid); else setD(null); }, [rid, loadRoute]);

  const back = () => {
    if (sel) setSel(null);
    else if (screen !== 'home') setScreen('home');
    else if (rid) { setRid(null); loadList(); }
  };
  const titles: Record<string, string> = { list: 'rt.list', pending: 'cx.pending', newclient: 'cx.newClient', map: 'rt.map', info: 'nav.routeInfo', liq: 'rt.liq', notes: 'sp.notes', rate: 'sp.rateCollector' };
  useHeaderSlot({
    title: userName,
    subtitle: rid && d ? `${d.name}${screen !== 'home' ? ' · ' + (sel ? sel.name : t(titles[screen] as DictKey)) : ''}` : (routes ?? []).map((r) => r.name).join(' · '),
    onBack: rid ? back : undefined,
  }, [userName, rid, d?.name, screen, sel?.id, routes?.length, lang]);

  // Por defecto NO vuelve a leer la ruta: cada acción actualiza solo su dato en pantalla (reload=true solo si hace falta)
  const run = async (fn: () => Promise<unknown>, okText?: string, reload = false) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (okText) setMsg({ ok: true, text: okText }); if (reload && rid) await loadRoute(rid); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  };
  const log = (action: string, detail: Record<string, unknown> = {}) => rpc('sup_log', { p_route: rid, p_action: action, p_detail: detail });
  const patchCust = (id: string, fields: Partial<Cust>) => {
    setD((x) => (x ? { ...x, customers: x.customers.map((c) => (c.id === id ? { ...c, ...fields } : c)) } : x));
    setSel((x) => (x && x.id === id ? { ...x, ...fields } : x));
  };
  const rate = (c: Cust, r: string) => run(async () => { await rpc('sup_rate_customer', { p_route: rid, p_customer: c.id, p_rating: r }); patchCust(c.id, { sup_rating: r }); }, t('sp.done'));
  const reverse = async (order: string, ns: number[]) => {
    try {
      await rpc('collector_delete_installments', { p_order: order, p_numbers: ns });
      const cid = d?.customers.find((c) => c.credits.some((k) => k.id === order))?.id;
      const [row, tot] = await Promise.all([
        cid ? rpc<(Omit<Cust, 'credits'> & { credits: RawCredit[] }) | null>('collector_customer_row', { p_route: rid, p_customer: cid }) : Promise.resolve(null),
        rpc<{ fund_balance: number; period: Period; portfolio: number }>('collector_route_totals', { p_route: rid }),
      ]);
      setD((x) => (x ? { ...x, balance: tot.fund_balance, period: tot.period, portfolio: tot.portfolio,
        customers: x.customers.map((c) => (row && c.id === row.id ? { ...c, ...row, credits: (row.credits ?? []).map(toCredit) } : c)) } : x));
      setMsg({ ok: true, text: t('card.delInstDone', { n: ns.join(', ') }) }); }
    catch (e) { const m = (e as Error).message; setMsg({ ok: false, text: m.includes('AFTER_CLOSE') ? t('col.delClosed') : m.includes('LOAN_NO_PERMISSION') ? t('loan.e.perm') : t('err.generic') }); }
  };

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
  const today = d.today ?? new Date().toISOString().slice(0, 10);
  const sq = q.trim().toLowerCase();
  const byFreq = freq === 'all' ? d.customers : d.customers.filter((c) => c.credits.some((k) => freqOf(k) === freq));
  const listAll = byFreq.filter((c) => !sq || c.name.toLowerCase().includes(sq) || (c.address ?? '').toLowerCase().includes(sq) || (c.tax_id ?? '').toLowerCase().includes(sq));
  const list = listAll.slice(0, limit);
  const pending = d.customers.filter((c) => !c.paid_today && Number(c.overdue) + Number(c.due_today) > 0.004).sort((x, y) => Number(y.overdue) - Number(x.overdue));
  const dot = (c: Cust) => c.paid_today ? '✅' : Number(c.overdue) > 0 ? '🔴' : Number(c.due_today) > 0 ? '🟡' : '⚪';
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
      (p) => run(async () => { await rpc('sup_update_customer', { p_route: rid, p_customer: c.id, p_phone: null, p_lat: p.coords.latitude, p_lng: p.coords.longitude }); patchCust(c.id, { lat: p.coords.latitude, lng: p.coords.longitude }); }, t('sp.done')),
      () => setMsg({ ok: false, text: t('sp.noGps') }), { enableHighAccuracy: true, timeout: 20000 });
  };

  return (
    <div className="space-y-4">
      {flash}
      {d.locked && screen === 'home' && <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">🔒 {t('sp.lockedInfo')}</p>}

      {screen === 'home' && (
        <>
          <div className="grid max-w-xl grid-cols-2 gap-3">
            <MenuTile icon="users" label={`${t('rt.list')} (${d.customers.length})`} tone="blue" onClick={() => setScreen('list')} />
            <MenuTile icon="clock" label={`${t('cx.pending')} (${d.customers.filter((c) => !c.paid_today && Number(c.overdue) + Number(c.due_today) > 0.004).length})`} tone="amber" onClick={() => setScreen('pending')} />
            {d.can_customers && <MenuTile icon="userPlus" label={t('cx.newClient')} tone="blue" onClick={() => setScreen('newclient')} />}
            <MenuTile icon="pin" label={t('rt.map')} tone="blue" onClick={() => setScreen('map')} />
            <MenuTile icon="receipt" label={t('nav.routeInfo')} tone="plain" onClick={() => setScreen('info')} />
            {d.can_liquidate && <MenuTile icon="refresh" label={t('rt.liq')} tone="amber" onClick={() => setScreen('liq')} />}
            <MenuTile icon="sliders" label={d.locked ? t('sp.unlock') : t('sp.lock')} tone="plain" disabled={busy}
              onClick={() => run(async () => {
                await rpc('sup_set_lock', { p_route: rid, p_lock: !d.locked });
                setD((x) => (x ? { ...x, locked: !x.locked } : x));
                // Aviso en vivo al cobrador: su teléfono se actualiza al instante
                const ch = supabase.channel(`route-lock:${rid}`);
                ch.subscribe((st) => { if (st === 'SUBSCRIBED') void ch.send({ type: 'broadcast', event: 'lock', payload: {} }).finally(() => { void supabase.removeChannel(ch); }); });
              })} />
            <MenuTile icon="clock" label={t('sp.notes')} tone="plain" onClick={() => setScreen('notes')} />
            <MenuTile icon="wallet" label={t('sp.rateCollector')} tone="plain" onClick={() => setScreen('rate')} />
          </div>
          <button type="button" disabled={busy} onClick={finish} className={`${ui.btnPrimary} w-full max-w-xl py-3`}>✅ {t('sp.finish')}</button>
        </>
      )}

      {screen === 'list' && !sel && (
        <div className="space-y-3">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('cust.search')} className={ui.input} />
          <div className="flex flex-wrap gap-1">
            {(['all', 'daily', 'weekly', 'biweekly', 'monthly'] as const).map((f) => {
              const n = f === 'all' ? d.customers.length : d.customers.filter((c) => c.credits.some((k) => freqOf(k) === f)).length;
              if (f !== 'all' && n === 0) return null;
              return (
                <button key={f} type="button" onClick={() => setFreq(f)}
                  className={`rounded-full px-3 py-1 text-xs font-bold cursor-pointer ${freq === f ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'border border-slate-300 dark:border-slate-700'}`}>
                  {f === 'all' ? t('card.all') : t(`card.f.${f}` as DictKey)} · {n}
                </button>
              );
            })}
          </div>
          {list.length === 0 && <Card><p className={`text-sm ${ui.muted}`}>{t('rt.noCust')}</p></Card>}
          {list.map((c) => (
            <Card key={c.id} className={`space-y-3 ${c.visited_today ? 'opacity-80' : ''}`}>
              <div className="flex items-start gap-3">
                <span className="text-xl">{dot(c)}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-start gap-1.5 break-words font-bold leading-tight"><span className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${RATING_DOT[c.rating] ?? RATING_DOT.new}`} /><span className="min-w-0">{c.name}</span></p>
                  <p className={`truncate text-xs ${ui.muted}`}>{c.address ?? '—'}</p>
                </div>
                <button type="button" onClick={() => { setSel(c); setPhone(c.phone ?? ''); }} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>👤 {t('card.profile')}</button>
              </div>
              <Credits locked onReverse={d.can_delete_installments ? reverse : undefined} c={c} filter={freq} today={today} fmt={m} onSave={() => undefined} />
              <RateRow cur={c.sup_rating} busy={busy} onPick={(r) => rate(c, r)} />
            </Card>
          ))}
          <ShowMore rest={listAll.length - list.length} onClick={() => setLimit((x) => x + 25)} />
        </div>
      )}

      {screen === 'pending' && !sel && (
        <div className="space-y-2">
          <h2 className="font-bold">⏳ {t('cx.pend.title', { n: pending.length })}</h2>
          {pending.length === 0 && <Card><p className={`text-sm ${ui.muted}`}>{t('cx.pend.none')}</p></Card>}
          <ul className="space-y-2">
            {pending.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => { setSel(c); setPhone(c.phone ?? ''); }} className={`flex w-full items-center gap-3 rounded-2xl p-4 text-left transition cursor-pointer ${ui.card}`}>
                  <span className="text-xl">{dot(c)}</span>
                  <div className="min-w-0 flex-1"><p className="break-words font-bold leading-tight">{c.name}</p><p className={`truncate text-xs ${ui.muted}`}>{c.address ?? '—'}</p></div>
                  <p className="shrink-0 whitespace-nowrap text-sm font-extrabold">{m(Number(c.overdue) + Number(c.due_today))}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {screen === 'newclient' && d.can_customers && (
        <NewClient routeId={d.id} orgId={d.org_id} online canLoan={false} onSaved={async (id) => {
          try { await log('other', { text: 'Creó un cliente nuevo' }); } catch { /* ya se creó */ }
          try {
            const row = await rpc<(Omit<Cust, 'credits'> & { credits: RawCredit[] }) | null>('collector_customer_row', { p_route: d.id, p_customer: id });
            if (row) setD((x) => (x ? { ...x, customers: [...x.customers, { ...row, credits: (row.credits ?? []).map(toCredit) }].sort((p, q) => p.name.localeCompare(q.name)) } : x));
          } catch { /* se completa al volver a abrir */ }
        }} onLoan={() => undefined} />
      )}

      {(screen === 'list' || screen === 'pending') && sel && (
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
            <RateRow cur={sel.sup_rating} busy={busy} onPick={(r) => rate(sel, r)} />
            <div className="flex gap-2">
              <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('sp.phone')} className={ui.input} />
              <button type="button" disabled={busy || !phone.trim() || phone.trim() === (sel.phone ?? '')}
                onClick={() => run(async () => { await rpc('sup_update_customer', { p_route: rid, p_customer: sel.id, p_phone: phone, p_lat: null, p_lng: null }); patchCust(sel.id, { phone: phone.trim() }); }, t('sp.done'))}
                className={`${ui.btnPrimary} shrink-0 !px-3 text-xs`}>{t('sp.savePhone')}</button>
            </div>
            <button type="button" disabled={busy} onClick={() => setLoc(sel)} className={`${ui.btnGhost} w-full !py-2 text-xs`}>📍 {t('sp.setLoc')}</button>
          </Card>
          {sel.credits.length === 0 ? <Card><p className={`text-sm ${ui.muted}`}>{t('card.noCards')}</p></Card> : sel.credits.map((k) => (
            <Card key={k.id}>
              <p className={`mb-2 text-xs ${ui.muted}`}>{new Date(k.created).toLocaleDateString(lang)} · {m(k.total)}</p>
              <CreditCard credit={k} today={today} fmt={m} onSave={() => undefined} readOnly onReverse={d.can_delete_installments ? (ns) => reverse(k.id, ns) : undefined} />
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

      {screen === 'rate' && rid && <RateCollector route={rid} collector={d.collector} />}
    </div>
  );
}
