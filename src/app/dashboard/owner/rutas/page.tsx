'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import { money } from '../../format';
import { friendlyError } from '../owner-context';

type Branch = { id: string; name: string; company: string; currency: string };
type Route = { id: string; name: string; collector_id: string | null; collector: string | null; active: boolean; customers: number };
type Admin = {
  routes: Route[];
  collectors: { id: string; name: string }[];
  customers: { id: string; name: string; address: string | null; route_id: string | null; balance: number }[];
};

const okBox = 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
const errBox = 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';

export default function RoutesPage() {
  const { t, lang } = useT();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [data, setData] = useState<Admin | null>(null);
  const [form, setForm] = useState<{ id: string | null; name: string; collector: string } | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'none' | string>('all');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    rpc<Branch[]>('seller_branches').then((b) => { setBranches(b ?? []); if (b?.length) setBranchId(b[0].id); }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!branchId) return;
    try { setData(await rpc<Admin>('routes_admin', { p_branch: branchId })); } catch { /* sin conexión */ }
  }, [branchId]);
  useEffect(() => { load(); }, [load]);

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };
  const currency = branches.find((b) => b.id === branchId)?.currency ?? 'USD';

  const saveRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form?.name.trim()) return;
    try {
      await rpc('save_route', { p_id: form.id, p_branch: branchId, p_name: form.name, p_collector: form.collector || null, p_active: true });
      flash(true, t('routes.saved'));
      setForm(null);
      await load();
      window.dispatchEvent(new Event('vx-routes-changed'));
    } catch (err) { flash(false, friendlyError((err as Error).message, t)); }
  };

  const assign = async (customerId: string, routeId: string) => {
    try {
      await rpc('set_customer_route', { p_customer: customerId, p_route: routeId || null });
      await load();
    } catch (err) { flash(false, friendlyError((err as Error).message, t)); }
  };

  const customers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.customers ?? []).filter((c) =>
      (!q || c.name.toLowerCase().includes(q) || (c.address ?? '').toLowerCase().includes(q)) &&
      (filter === 'all' || (filter === 'none' ? !c.route_id : c.route_id === filter)));
  }, [data, query, filter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold sm:text-2xl">🛵 {t('routes.title')}</h1>
          <p className={`text-sm ${ui.muted}`}>{t('routes.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2 max-sm:w-full">
          {branches.length > 1 && (
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={`${ui.input} !w-auto max-sm:!w-full`}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.company} · {b.name}</option>)}
            </select>
          )}
          <button type="button" onClick={() => setForm({ id: null, name: '', collector: '' })} className={`${ui.btnPrimary} max-sm:w-full`}>+ {t('routes.add')}</button>
        </div>
      </div>

      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? okBox : errBox}`}>{msg.text}</p>}

      <Link href="/dashboard/owner/prestamos" className="block rounded-xl border border-slate-200 p-3 text-sm font-bold text-blue-600 hover:bg-slate-50 dark:border-slate-800 dark:text-blue-400 dark:hover:bg-slate-800/50">💸 {t('rt.rules')} →</Link>

      {data && data.collectors.length === 0 && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          {t('routes.noCollectors')}
        </p>
      )}

      {form && (
        <Card>
          <form onSubmit={saveRoute} className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={ui.label}>{t('routes.name')}</label>
              <input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={ui.input} />
            </div>
            <div>
              <label className={ui.label}>{t('routes.collector')}</label>
              <select value={form.collector} onChange={(e) => setForm({ ...form, collector: e.target.value })} className={ui.input}>
                <option value="">{t('routes.noCollector')}</option>
                {data?.collectors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button type="button" onClick={() => setForm(null)} className={`${ui.btnGhost} flex-1`}>{t('prod.cancel')}</button>
              <button type="submit" className={`${ui.btnPrimary} flex-1`}>{t('prod.save')}</button>
            </div>
          </form>
        </Card>
      )}

      {/* Rutas */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(data?.routes ?? []).map((r) => (
          <Card key={r.id} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <Link href={`/dashboard/owner/ruta?r=${r.id}`} className="block truncate font-bold hover:underline">{r.name}</Link>
              <p className={`truncate text-xs ${ui.muted}`}>🛵 {r.collector ?? t('routes.noCollector')} · {t('routes.customers', { n: r.customers })}</p>
            </div>
            <button type="button" onClick={() => setForm({ id: r.id, name: r.name, collector: r.collector_id ?? '' })} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>{t('prod.edit')}</button>
          </Card>
        ))}
        {data && data.routes.length === 0 && <Card><p className={`text-sm ${ui.muted}`}>{t('routes.empty')}</p></Card>}
      </div>

      {/* Asignar clientes a rutas */}
      {data && data.routes.length > 0 && (
        <Card className="space-y-3">
          <h2 className="font-bold">{t('routes.assignTitle')}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('cust.search')} className={ui.input} />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className={ui.input}>
              <option value="all">{t('routes.filterAll')}</option>
              <option value="none">{t('routes.filterNone')}</option>
              {data.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {customers.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-semibold">{c.name}</p>
                  <p className={`truncate text-xs ${ui.muted}`}>{c.address ?? '—'} · {money(Number(c.balance), currency, lang)}</p>
                </div>
                <select value={c.route_id ?? ''} onChange={(e) => assign(c.id, e.target.value)} className={`${ui.input} !w-auto !py-1.5 max-sm:!w-full`}>
                  <option value="">{t('routes.noRoute')}</option>
                  {data.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </li>
            ))}
            {customers.length === 0 && <li className={`py-3 text-sm ${ui.muted}`}>{t('cust.empty')}</li>}
          </ul>
        </Card>
      )}
    </div>
  );
}
