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
import { CustomerNames, CustomerProfile, ProfileTabs, type ProfTab } from '../../customer-profile';
import { useBackButton } from '../../use-back';

/* Pantalla de una ruta de cobro (administrador): lista de clientes, mapa, ajustes, información y liquidación */
type Screen = 'home' | 'list' | 'map' | 'settings' | 'info' | 'liq';
type RawCredit = { id: string; created: string; total: number; every_days: number | null; i?: [number, string, number, number, string | null][] };
type Cust = {
  id: string; name: string; phone: string | null; address: string | null; tax_id: string | null; lat: number | null; lng: number | null;
  rating: string; balance: number; overdue: number; credits: RawCredit[]; credit_cap?: number | null;
};
type RouteRow = { id: string; name: string; collector: string | null; currency: string; permissions: Record<string, boolean | number> };
type Fund = {
  id: string; currency: string; balance: number; invested: number; portfolio: number; period: Period;
  liquidations: { id: string; created_at: string; expected: number; counted: number; difference: number; closing: number }[];
  moves: { at: string; type: string; amount: number; note: string | null }[];
};
const PERMS = ['loans.create', 'loans.customers', 'loans.interest', 'routes.liquidate', 'routes.invest', 'collector.expenses', 'collector.pay_out', 'collector.portfolio',
  'collector.delete_installments', 'collector.delete_credits', 'collector.delete_customers', 'loans.no_photo', 'loans.no_id_photo', 'customers.photo_gallery', 'customers.change_location'];
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
  const [sheetTab, setSheetTab] = useState<ProfTab>('info');
  const [sheetAcct, setSheetAcct] = useState<string | null>(null);
  useEffect(() => { setSheetTab('info'); setSheetAcct(null); }, [sel?.id]);
  const [q, setQ] = useState('');
  const [capIn, setCapIn] = useState('');
  const [edit, setEdit] = useState<{ name: string; phone: string; address: string; tax_id: string } | null>(null);
  useEffect(() => { setEdit(null); }, [sel?.id]);
  useEffect(() => { setCapIn(sel?.credit_cap != null ? String(sel.credit_cap) : ''); }, [sel]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [perms, setPerms] = useState<Record<string, boolean | number>>({});
  const [busy, setBusy] = useState(false);
  const [mv, setMv] = useState<{ type: 'investment'; amount: string; note: string } | null>(null);

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
  // Tras mover dinero solo cambia el fondo de la ruta: se pide eso, no toda la pantalla
  const loadFund = useCallback(async () => {
    if (!orgId || !rid) return;
    const funds = await rpc<Fund[]>('route_funds_admin', { p_org: orgId });
    setFund((funds ?? []).find((f) => f.id === rid) ?? null);
  }, [orgId, rid]);
  useEffect(() => { setScreen('home'); setSel(null); setMv(null); setRoute(undefined); load(); }, [load]);

  const back = () => {
    if (sel && sheetTab === 'acc' && sheetAcct) setSheetAcct(null);
    else if (sel) setSel(null);
    else if (screen !== 'home') setScreen('home');
    else router.push('/dashboard/owner/rutas');
  };
  useBackButton((sel ? 1 : 0) + (sel && sheetTab === 'acc' && sheetAcct ? 1 : 0) + (screen !== 'home' ? 1 : 0), back);
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
    try { await rpc('route_fund_move', { p_route: rid, p_type: mv.type, p_amount: n, p_note: mv.note || null }); setMv(null); await loadFund(); setMsg({ ok: true, text: t('fund.saved') }); }
    catch (e) { const x = (e as Error).message; setMsg({ ok: false, text: x.includes('ROUTE_FUND_LOW') ? t('fund.low') : friendlyError(x, t) }); }
    finally { setBusy(false); }
  };

  if (route === undefined) return <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>;
  if (route === null) return <Card><p className={`text-sm ${ui.muted}`}>{t('rt.notFound')}</p></Card>;

  const box = (ok: boolean) => ok ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
    : 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';
  const today = new Date().toISOString().slice(0, 10);
  // Días de retraso de la cuota impaga más antigua del cliente
  const lateDays = (c: Cust) => Math.max(0, ...c.credits.flatMap((k) => (k.i ?? []).filter(([, , amount, paid]) => Number(amount) - Number(paid) > 0.004)
    .map(([, due]) => Math.floor((new Date(today + 'T12:00:00').getTime() - new Date(due.slice(0, 10) + 'T12:00:00').getTime()) / 86_400_000))));
  const saveCap = async (c: Cust) => {
    const n = capIn.trim() === '' ? null : Number(capIn.replace(',', '.'));
    if (n !== null && (!Number.isFinite(n) || n <= 0)) { setMsg({ ok: false, text: t('cap.invalid') }); return; }
    try {
      const v = await rpc<number | null>('set_customer_credit_cap', { p_customer: c.id, p_cap: n });
      setSel({ ...c, credit_cap: v }); setCusts((a) => a.map((x) => x.id === c.id ? { ...x, credit_cap: v } : x));
      setMsg({ ok: true, text: t('cap.saved') });
    } catch (e) { setMsg({ ok: false, text: friendlyError((e as Error).message, t) }); }
  };
  const saveEdit = async (c: Cust) => {
    if (!edit || !edit.name.trim()) return;
    try {
      await rpc('owner_update_customer', { p_customer: c.id, p_name: edit.name, p_phone: edit.phone, p_address: edit.address, p_tax_id: edit.tax_id });
      const n = { name: edit.name.trim(), phone: edit.phone.trim() || null, address: edit.address.trim() || null, tax_id: edit.tax_id.trim() || null };
      setSel({ ...c, ...n }); setCusts((a) => a.map((x) => x.id === c.id ? { ...x, ...n } : x)); setEdit(null);
      setMsg({ ok: true, text: t('cust.saved') });
    } catch (e) { setMsg({ ok: false, text: friendlyError((e as Error).message, t) }); }
  };
  const removeCust = async (c: Cust) => {
    if (!window.confirm(t('col.delConfirm'))) return;
    try {
      await rpc('collector_delete_customer', { p_customer: c.id });
      setSel(null); await load(); setMsg({ ok: true, text: t('col.delCustomer') });
    } catch (e) {
      const m = (e as Error).message;
      setMsg({ ok: false, text: m.includes('AFTER_CLOSE') ? t('col.delClosed') : m.includes('CUSTOMER_HAS_DEBT') ? t('col.delDebt') : m.includes('cobros') ? t('col.delPaid') : friendlyError(m, t) });
    }
  };
  const writeOff = async (c: Cust) => {
    if (!window.confirm(t('rt.writeOffConfirm'))) return;
    try {
      await rpc('owner_write_off_customer', { p_customer: c.id });
      setSel(null); await load(); setMsg({ ok: true, text: t('rt.writeOffDone') });
    } catch (e) {
      const m = (e as Error).message;
      setMsg({ ok: false, text: m.includes('WRITEOFF_TOO_EARLY') ? t('rt.writeOffEarly') : friendlyError(m, t) });
    }
  };

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
        <div className="space-y-3">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('cust.search')} className={ui.input} />
          <CustomerNames list={list} onPick={(id) => { const c = list.find((x) => x.id === id); if (c) setSel(c); }} />
        </div>
      )}

      {screen === 'list' && sel && (
        <div className="pb-24">
          <CustomerProfile c={{ ...sel, credits: sel.credits.map(toCredit) }} fmt={m} online tab={sheetTab} acct={sheetAcct} onAcct={setSheetAcct} canChange={false}
            renderCards={(only) => <>{sel.credits.filter((k) => k.id === only).map((k) => (
              <Card key={k.id}>
                <p className={`mb-2 text-xs ${ui.muted}`}>{new Date(k.created).toLocaleDateString(lang)} · {m(k.total)}</p>
                <CreditCard credit={toCredit(k)} today={today} fmt={m} onSave={() => undefined} readOnly />
              </Card>
            ))}</>}
            extra={<>
            {edit && (
                <div className="space-y-2 pt-2">
                  <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder={t('cx.nc.name')} className={ui.input} />
                  <input value={edit.tax_id} onChange={(e) => setEdit({ ...edit, tax_id: e.target.value })} placeholder={t('cx.nc.ci')} className={ui.input} />
                  <input type="tel" inputMode="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} placeholder={t('cx.nc.phone')} className={ui.input} />
                  <input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} placeholder={t('cx.nc.address')} className={ui.input} />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEdit(null)} className={`${ui.btnGhost} flex-1`}>{t('prod.cancel')}</button>
                    <button type="button" onClick={() => saveEdit(sel)} disabled={!edit.name.trim()} className={`${ui.btnPrimary} flex-1`}>{t('prod.save')}</button>
                  </div>
                </div>
              )}
              {!edit && (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button type="button" onClick={() => setEdit({ name: sel.name, phone: sel.phone ?? '', address: sel.address ?? '', tax_id: sel.tax_id ?? '' })} className={`${ui.btnGhost} text-sm`}>✏️ {t('cust.editTitle')}</button>
                  <button type="button" onClick={() => removeCust(sel)}
                    className="rounded-xl border border-red-300 px-3 py-2 text-sm font-bold text-red-600 cursor-pointer dark:border-red-500/40 dark:text-red-400">🗑️ {t('col.delCustomer')}</button>
                </div>
              )}
              <p className="pt-1 font-bold">{t('rt.owes', { amount: m(sel.balance) })}{Number(sel.overdue) > 0 && <span className="text-red-600 dark:text-red-400"> · {t('rt.late', { amount: m(sel.overdue) })}</span>}</p>
          <Card className="space-y-2">
            <label className={ui.label}>{t('cap.label')}</label>
            <div className="flex gap-2">
              <input inputMode="decimal" value={capIn} onChange={(e) => setCapIn(e.target.value)} placeholder={t('cap.none')} className={ui.input} />
              <button type="button" onClick={() => saveCap(sel)} className={`${ui.btnPrimary} shrink-0`}>{t('cap.save')}</button>
            </div>
            <p className={`text-xs ${ui.muted}`}>{t('cap.hint')}</p>
          </Card>
          {lateDays(sel) >= 180 && (
            <button type="button" onClick={() => writeOff(sel)}
              className="w-full rounded-xl border border-red-300 px-3 py-2 text-sm font-bold text-red-600 cursor-pointer dark:border-red-500/40 dark:text-red-400">🗑️ {t('rt.writeOff')}</button>
          )}
            </>} />
          <ProfileTabs tab={sheetTab} canChange={false} onTab={(k) => { setSheetTab(k); setSheetAcct(null); }} />
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
