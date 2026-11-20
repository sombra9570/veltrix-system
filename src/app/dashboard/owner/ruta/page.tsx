'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { rpc } from '../../../../lib/supabase';
import { Card, useHeaderSlot } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import type { DictKey } from '../../../i18n/es';
import { money } from '../../format';
import { useOwner, friendlyError } from '../owner-context';
import { MenuTile } from '../../collector/tiles';
import { CreditCard, type Credit } from '../../collector/credit-card';
import { CutForm, type Period } from '../../collector/cut-form';
import { DeliveryMap, type MapPoint } from '../../delivery-map';
import { RATING_DOT } from '../../collector/loan-form';

/* Pantalla de una ruta de cobro (administrador): lista de clientes, mapa, ajustes, información y liquidación */
type Screen = 'home' | 'list' | 'map' | 'settings' | 'info' | 'liq';
type RawCredit = { id: string; created: string; total: number; every_days: number | null; i?: [number, string, number, number, string | null][] };
type Cust = {
  id: string; name: string; phone: string | null; address: string | null; tax_id: string | null; lat: number | null; lng: number | null;
  rating: string; balance: number; overdue: number; credits: RawCredit[];
};
type RouteRow = { id: string; name: string; collector: string | null; currency: string; permissions: Record<string, boolean | number> };
type Fund = {
  id: string; currency: string; balance: number; invested: number; portfolio: number; period: Period;
  liquidations: { id: string; created_at: string; expected: number; counted: number; difference: number; closing: number }[];
  moves: { at: string; type: string; amount: number; note: string | null }[];
};
const PERMS = ['loans.create', 'loans.customers', 'loans.interest', 'routes.liquidate', 'routes.invest', 'collector.expenses', 'collector.portfolio', 'collector.settings',
  'collector.delete_installments', 'collector.delete_credits', 'collector.delete_customers', 'loans.no_photo', 'loans.no_id_photo'];
const NUMS: [string, string, number | null][] = [['commission_pct', 'rt.commPct', 3], ['max_loan', 'rt.maxLoan', null], ['max_cards', 'rt.maxCards', null]];

const toCredit = (k: RawCredit): Credit => ({
  id: k.id, created: k.created, total: k.total, every_days: k.every_days,
  installments: (k.i ?? []).map(([n, due, amount, paid, last_at]) => ({ id: `${k.id}:${n}`, n, due, amount: Number(amount), paid: Number(paid), last_at })),
});

function RouteScreen() {
  const { t, lang } = useT();
  const router = useRouter();
  const rid = useSearchParams().get('r') ?? '';
  const { orgId } = useOwner();
  const [screen, setScreen] = useState<Screen>('home');
  const [route, setRoute] = useState<RouteRow | null | undefined>(undefined);
  const [custs, setCusts] = useState<Cust[]>([]);
  const [fund, setFund] = useState<Fund | null>(null);
  const [sel, setSel] = useState<Cust | null>(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [perms, setPerms] = useState<Record<string, boolean | number>>({});
  const [busy, setBusy] = useState(false);
  const [mv, setMv] = useState<{ type: 'investment' | 'withdrawal'; amount: string; note: string } | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !rid) return;
    try {
      const rs = await rpc<RouteRow[]>('owner_routes', { p_org: orgId });
      const r = (rs ?? []).find((x) => x.id === rid) ?? null;
      setRoute(r);
      if (!r) return;
      setPerms(r.permissions ?? {});
      setCusts((await rpc<Cust[]>('route_customers_admin', { p_route: rid })) ?? []);
      const funds = await rpc<Fund[]>('route_funds_admin', { p_org: orgId });
      setFund((funds ?? []).find((f) => f.id === rid) ?? null);
    } catch (e) { setMsg({ ok: false, text: friendlyError((e as Error).message, t) }); }
  }, [orgId, rid, t]);
  useEffect(() => { setScreen('home'); setSel(null); setMv(null); setRoute(undefined); load(); }, [load]);

  const back = () => {
    if (sel) setSel(null);
    else if (screen !== 'home') setScreen('home');
    else router.push('/dashboard/owner/rutas');
  };
  useHeaderSlot(route ? {
    title: route.name,
    subtitle: sel ? sel.name : screen === 'home' ? (route.collector ?? '') : t(({ list: 'rt.list', map: 'rt.map', settings: 'rt.settings', info: 'nav.routeInfo', liq: 'rt.liq' } as Record<string, string>)[screen] as DictKey),
    onBack: back,
  } : null, [route?.name, route?.collector, screen, sel?.id, lang]);

  const cur = route?.currency ?? 'USD';
  const m = useCallback((n: number) => money(Number(n), cur, lang), [cur, lang]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return custs.filter((c) => !s || c.name.toLowerCase().includes(s) || (c.address ?? '').toLowerCase().includes(s) || (c.phone ?? '').includes(s));
  }, [custs, q]);
  const points: MapPoint[] = custs.filter((c) => c.lat != null && c.lng != null).map((c) => ({
    lat: Number(c.lat), lng: Number(c.lng), label: c.name, icon: Number(c.overdue) > 0 ? '🔴' : '📍',
  }));

  const savePerms = async (next: Record<string, boolean | number>) => {
    setPerms(next); setBusy(true); setMsg(null);
    try { await rpc('route_set_permissions', { p_route: rid, p_perms: next }); setMsg({ ok: true, text: t('rt.saved') }); }
    catch (e) { setMsg({ ok: false, text: friendlyError((e as Error).message, t) }); await load(); }
    finally { setBusy(false); }
  };
  const moveFund = async () => {
    if (!mv) return;
    const n = Number(mv.amount.replace(',', '.'));
    if (!(n > 0)) return;
    setBusy(true); setMsg(null);
    try { await rpc('route_fund_move', { p_route: rid, p_type: mv.type, p_amount: n, p_note: mv.note || null }); setMv(null); await load(); setMsg({ ok: true, text: t('fund.saved') }); }
    catch (e) { const x = (e as Error).message; setMsg({ ok: false, text: x.includes('ROUTE_FUND_LOW') ? t('fund.low') : friendlyError(x, t) }); }
    finally { setBusy(false); }
  };

  if (route === undefined) return <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>;
  if (route === null) return <Card><p className={`text-sm ${ui.muted}`}>{t('rt.notFound')}</p></Card>;

  const box = (ok: boolean) => ok ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
    : 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${box(msg.ok)}`}>{msg.text}</p>}

      {screen === 'home' && (
        <div className="grid max-w-xl grid-cols-2 gap-3">
          <MenuTile icon="users" label={t('rt.list')} tone="blue" onClick={() => setScreen('list')} />
          <MenuTile icon="pin" label={t('rt.map')} tone="blue" onClick={() => setScreen('map')} />
          <MenuTile icon="receipt" label={t('nav.routeInfo')} tone="plain" onClick={() => setScreen('info')} />
          <MenuTile icon="refresh" label={t('rt.liq')} tone="amber" onClick={() => setScreen('liq')} />
          <MenuTile icon="sliders" label={t('rt.settings')} tone="plain" onClick={() => setScreen('settings')} />
        </div>
      )}

      {screen === 'list' && !sel && (
        <Card className="space-y-3">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('cust.search')} className={ui.input} />
          {list.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('rt.noCust')}</p> : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {list.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setSel(c)} className="flex w-full items-center gap-3 py-3 text-start cursor-pointer">
                    <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${RATING_DOT[c.rating] ?? RATING_DOT.new}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{c.name}</span>
                      <span className={`block truncate text-xs ${ui.muted}`}>{c.address ?? c.phone ?? '—'}</span>
                    </span>
                    <span className="shrink-0 text-end text-xs">
                      <b className="block">{t('rt.owes', { amount: m(c.balance) })}</b>
                      {Number(c.overdue) > 0 && <span className="font-semibold text-red-600 dark:text-red-400">{t('rt.late', { amount: m(c.overdue) })}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {screen === 'list' && sel && (
        <div className="space-y-3">
          <Card className="space-y-1 text-sm">
            <p className="text-lg font-extrabold">{sel.name}</p>
            {sel.phone && <p><a href={`tel:${sel.phone}`} className="font-semibold text-blue-600 dark:text-blue-400">📞 {sel.phone}</a></p>}
            {sel.address && <p className={ui.muted}>📍 {sel.address}</p>}
            {sel.tax_id && <p className={ui.muted}>🪪 {sel.tax_id}</p>}
            <p className="pt-1 font-bold">{t('rt.owes', { amount: m(sel.balance) })}{Number(sel.overdue) > 0 && <span className="text-red-600 dark:text-red-400"> · {t('rt.late', { amount: m(sel.overdue) })}</span>}</p>
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
        <Card className="space-y-2">
          {points.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('rt.noMapPts')}</p> : <DeliveryMap points={points} height={460} names />}
        </Card>
      )}

      {screen === 'settings' && (
        <Card className="space-y-3">
          <div>
            <h2 className="font-bold">🔐 {t('rt.permTitle')}</h2>
            <p className={`text-xs ${ui.muted}`}>{t('rt.permHint')}</p>
          </div>
          <ul className="space-y-3">
            {PERMS.map((key) => {
              const v = perms[key] as boolean | undefined;
              const val = v === undefined ? 'inherit' : v ? 'yes' : 'no';
              return (
                <li key={key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{t(`perm.${key}` as DictKey)}</p>
                    <p className={`text-xs ${ui.muted}`}>{t(`perm.${key}.d` as DictKey)}</p>
                  </div>
                  <div className="grid shrink-0 grid-cols-3 gap-1 rounded-xl border border-slate-300 p-1 dark:border-slate-700">
                    {([['inherit', t('perm.inherit')], ['yes', t('perm.yes')], ['no', t('perm.no')]] as const).map(([opt, label]) => (
                      <button key={opt} type="button" disabled={busy}
                        onClick={() => { const n = { ...perms }; if (opt === 'inherit') delete n[key]; else n[key] = opt === 'yes'; savePerms(n); }}
                        className={`rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer ${val === opt ? 'bg-blue-600 text-white' : ''}`}>{label}</button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
            <h3 className="text-sm font-bold">📏 {t('rt.limitsTitle')}</h3>
            {NUMS.map(([key, label, def]) => (
              <label key={key} className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-sm font-semibold">{t(label as DictKey)}</span>
                <input key={`${key}-${String(perms[key] ?? '')}`} inputMode="decimal" disabled={busy}
                  defaultValue={perms[key] === undefined ? (def === null ? '' : String(def)) : String(perms[key])}
                  placeholder={def === null ? t('rt.noLimit') : String(def)}
                  onBlur={(e) => {
                    const raw = e.target.value.trim().replace(',', '.');
                    const n = { ...perms };
                    if (raw === '') delete n[key]; else { const x = Number(raw); if (!Number.isFinite(x) || x < 0) return; n[key] = x; }
                    if (JSON.stringify(n) !== JSON.stringify(perms)) savePerms(n);
                  }}
                  className={`${ui.input} !w-32 text-right`} />
              </label>
            ))}
          </div>
        </Card>
      )}

      {screen === 'info' && (
        <Card className="space-y-3">
          {!fund ? <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p> : (() => {
            const p = fund.period;
            const pct = typeof perms.commission_pct === 'number' ? perms.commission_pct : 3;
            const rows: [string, number, string?][] = [
              ...(Number(fund.invested) > 0 ? [[t('cx.sum.invest'), Number(fund.invested)] as [string, number]] : []),
              [t('cx.sum.prev'), Number(p.opening)],
              [t('cx.sum.collected'), Number(p.collected_cash) + Number(p.collected_digital), 'text-emerald-600 dark:text-emerald-400'],
              [t('cx.sum.lent'), Number(p.lent), 'text-violet-600 dark:text-violet-400'],
              [t('cx.sum.expenses'), Number(p.collector_expenses), 'text-red-600 dark:text-red-400'],
              [t('cx.sum.current'), Number(fund.balance), Number(fund.balance) < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'],
              [t('cx.sum.portfolio'), Number(fund.portfolio)],
              [t('rt.commission', { pct: pct }), (Number(p.collected_cash) + Number(p.collected_digital)) * pct / 100, 'text-blue-600 dark:text-blue-400'],
            ];
            return (
              <>
                <p className={`text-[11px] ${ui.muted}`}>{t('rt.commHint')}</p>
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {rows.map(([label, v, cls]) => (
                    <li key={label} className="flex items-center justify-between gap-3 py-2.5">
                      <span className={`text-sm ${ui.muted}`}>{label}</span>
                      <b className={`text-lg ${cls ?? ''}`}>{m(v)}</b>
                    </li>
                  ))}
                </ul>
                {mv ? (
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <input inputMode="decimal" autoFocus placeholder={t('cash.amount')} value={mv.amount} onChange={(e) => setMv({ ...mv, amount: e.target.value })} className={ui.input} />
                    <input placeholder={t('cust.notes')} value={mv.note} onChange={(e) => setMv({ ...mv, note: e.target.value })} className={ui.input} />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setMv(null)} className={`${ui.btnGhost} !py-2 text-sm`}>✕</button>
                      <button type="button" disabled={busy} onClick={moveFund} className={`${ui.btnPrimary} !py-2 text-sm`}>
                        {mv.type === 'investment' ? `➕ ${t('fund.invest')}` : `➖ ${t('fund.withdraw')}`}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setMv({ type: 'investment', amount: '', note: '' })} className={`${ui.btnGhost} !py-1.5 text-xs`}>➕ {t('fund.invest')}</button>
                    <button type="button" onClick={() => setMv({ type: 'withdrawal', amount: '', note: '' })} className={`${ui.btnGhost} !py-1.5 text-xs`}>➖ {t('fund.withdraw')}</button>
                  </div>
                )}
              </>
            );
          })()}
        </Card>
      )}

      {screen === 'liq' && fund && (
        <div className="space-y-3">
          <CutForm routeId={rid} routeName={route.name} period={fund.period} m={m} onCancel={() => setScreen('home')}
            onDone={async (text) => { await load(); setScreen('home'); setMsg({ ok: true, text }); window.dispatchEvent(new Event('vx-routes-changed')); }}
            onError={(text) => setMsg({ ok: false, text })} />
          <Card className="space-y-2">
            <h2 className="font-bold">✂️ {t('rt.liqHist')}</h2>
            {fund.liquidations.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('rt.liqNone')}</p> : (
              <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
                {fund.liquidations.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                    <span>{new Date(l.created_at).toLocaleDateString(lang)}<span className={`block text-xs ${ui.muted}`}>{t('cx.sum.current')} {m(l.closing)}</span></span>
                    <b className={Number(l.difference) < 0 ? 'text-red-600 dark:text-red-400' : Number(l.difference) > 0 ? 'text-emerald-600' : ''}>{t('liq.diff')} {m(l.difference)}</b>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

export default function RoutePage() {
  return <Suspense fallback={null}><RouteScreen /></Suspense>;
}
