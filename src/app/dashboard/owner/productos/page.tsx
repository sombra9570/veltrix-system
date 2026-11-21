'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { usePaged, ShowMore } from '../../paged';
import { useT } from '../../../i18n';
import { money, parseAmount } from '../../format';
import { friendlyError, useOwner } from '../owner-context';
import { ModelForm } from './model-form';

type Company = { id: string; legal_name: string; base_currency: string };
type Product = {
  id: string; sku: string; name: string; price: number; currency: string;
  type: 'good' | 'service'; track: boolean; unit: string; active: boolean;
  stock: Record<string, number>; model?: string | null; size?: string | null; color?: string | null;
};
type Admin = { branches: { id: string; name: string }[]; products: Product[] };
type Form = { id: string | null; name: string; price: string; type: 'good' | 'service'; track: boolean; unit: string; sku: string; stock: string };

const empty: Form = { id: null, name: '', price: '', type: 'good', track: true, unit: 'unid', sku: '', stock: '' };
const okBox = 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
const errBox = 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';

export default function ProductsPage() {
  const { t, lang } = useT();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [data, setData] = useState<Admin | null>(null);
  const [branchId, setBranchId] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const { categories, storeEnabled } = useOwner();
  const apparel = categories.includes('clothing');
  const [modelOpen, setModelOpen] = useState(false);
  const [inMenu, setInMenu] = useState(true);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    supabase.from('companies').select('id, legal_name, base_currency').is('deleted_at', null).order('created_at')
      .then(({ data }) => {
        const list = (data ?? []) as Company[];
        setCompanies(list);
        if (list.length) setCompanyId(list[0].id);
      });
  }, []);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      const d = await rpc<Admin>('products_admin', { p_company: companyId });
      setData(d);
      setBranchId((b) => (d.branches.some((x) => x.id === b) ? b : d.branches[0]?.id ?? ''));
    } catch { /* sin conexión */ }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 5000);
  };

  const company = companies.find((c) => c.id === companyId);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = (data?.products ?? []).filter((x) => !x.model); // las prendas con talla y color se ven agrupadas en Inventario
    return q ? all.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) : all;
  }, [data, query]);
  const paged = usePaged(list, 40, list);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !companyId) return;
    const price = parseAmount(form.price);
    if (!form.name.trim() || Number.isNaN(price) || price < 0) return flash(false, t('cash.invalidAmount'));
    setBusy(true);
    try {
      const id = await rpc<string>('save_product', {
        p_id: form.id, p_company: companyId, p_name: form.name, p_price: price,
        p_type: form.type, p_track: form.type === 'good' && form.track,
        p_sku: form.sku || null, p_unit: form.unit, p_active: true,
      });
      const q = Math.floor(Number(form.stock));
      if (id && form.type === 'good' && form.track && q > 0 && branchId) {
        await rpc('inv_receive', { p_branch: branchId, p_supplier: null, p_items: [{ product_id: id, qty: q, cost: 0 }], p_doc_ref: null, p_due_days: null });
      }
      if (!form.id && inMenu && !storeEnabled && id) {
        // Si la carta ya llegó al límite del plan, el producto igual queda creado
        await rpc('set_product_store', { p_product: id, p_in_store: true, p_description: null }).catch(() => undefined);
      }
      flash(true, t('prod.saved'));
      setForm(null);
      await load();
    } catch (err) {
      flash(false, friendlyError((err as Error).message, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold sm:text-2xl">📦 {t('prod.title')}</h1>
          <p className={`text-sm ${ui.muted}`}>{t('prod.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2 max-sm:w-full">
          {apparel && <button type="button" onClick={() => { setModelOpen(true); setForm(null); }} className={`${ui.btnPrimary} max-sm:w-full`}>🏷️ {t('mod.new')}</button>}
          <button type="button" onClick={() => { setForm({ ...empty }); setModelOpen(false); }} className={`${apparel ? ui.btnGhost : ui.btnPrimary} max-sm:w-full`}>+ {t('prod.add')}</button>
        </div>
      </div>

      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? okBox : errBox}`}>{msg.text}</p>}

      {/* Empresa y sucursal (para ver y contar el stock) */}
      {(companies.length > 1 || (data?.branches.length ?? 0) > 1) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {companies.length > 1 && (
            <div>
              <label className={ui.label}>{t('prod.company')}</label>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={ui.input}>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
              </select>
            </div>
          )}
          {(data?.branches.length ?? 0) > 1 && (
            <div>
              <label className={ui.label}>{t('team.branch')}</label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={ui.input}>
                {data!.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {modelOpen && company && (
        <ModelForm companyId={company.id} currency={company.base_currency} onCancel={() => setModelOpen(false)}
          onDone={async (text) => { setModelOpen(false); flash(true, text); await load(); }} />
      )}

      {form && (
        <Card>
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={ui.label}>{t('prod.name')}</label>
              <input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={ui.input} />
            </div>
            <div>
              <label className={ui.label}>{t('prod.price')} ({company?.base_currency})</label>
              <input required inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={ui.input} />
            </div>
            <div>
              <p className={ui.label}>{t('prod.type')}</p>
              <div className="grid grid-cols-2 gap-2">
                {(['good', 'service'] as const).map((ty) => (
                  <button key={ty} type="button" onClick={() => setForm({ ...form, type: ty })}
                    className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition cursor-pointer ${form.type === ty ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
                    {ty === 'good' ? `📦 ${t('prod.good')}` : `🛠️ ${t('prod.service')}`}
                  </button>
                ))}
              </div>
            </div>
            {!form.id && !storeEnabled && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-300 p-3 dark:border-slate-700">
                <input type="checkbox" checked={inMenu} onChange={(e) => setInMenu(e.target.checked)} className="mt-1 h-4 w-4" />
                <span>
                  <span className="block text-sm font-semibold">📋 {t('prod.inMenu')}</span>
                  <span className={`block text-xs ${ui.muted}`}>{t('prod.inMenuHint')}</span>
                </span>
              </label>
            )}
            {form.type === 'good' && (
              <>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-300 p-3 dark:border-slate-700">
                  <input type="checkbox" checked={form.track} onChange={(e) => setForm({ ...form, track: e.target.checked })} className="mt-1 h-4 w-4" />
                  <span>
                    <span className="block text-sm font-semibold">{t('prod.track')}</span>
                    <span className={`block text-xs ${ui.muted}`}>{t('prod.trackHint')}</span>
                  </span>
                </label>
                <div>
                  <label className={ui.label}>{t('prod.unit')}</label>
                  <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={ui.input} />
                </div>
              </>
            )}
            {form.type === 'good' && form.track && !form.id && (
              <div>
                <label className={ui.label}>{t('prod.stockInit')}</label>
                <input inputMode="numeric" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value.replace(/\D/g, '') })} placeholder="0" className={ui.input} />
              </div>
            )}
            <div>
              <label className={ui.label}>{t('prod.sku')}</label>
              <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className={ui.input} />
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 sm:justify-end">
              <button type="button" onClick={() => setForm(null)} className={`${ui.btnGhost} max-sm:flex-1`}>{t('prod.cancel')}</button>
              <button type="submit" disabled={busy} className={`${ui.btnPrimary} max-sm:flex-1`}>{busy ? t('common.wait') : t('prod.save')}</button>
            </div>
          </form>
        </Card>
      )}

      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('prod.search')} className={ui.input} />

      <Card className="!p-0 overflow-hidden">
        {!data ? (
          <p className={`p-5 text-sm ${ui.muted}`}>{t('common.wait')}</p>
        ) : list.length === 0 ? (
          <p className={`p-5 text-sm ${ui.muted}`}>{t('prod.empty')}</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {paged.visible.map((p) => {
              const qty = p.stock?.[branchId] ?? 0;
              return (
                <li key={p.id} className={`flex flex-wrap items-center gap-3 p-4 ${p.active ? '' : 'opacity-60'}`}>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate font-semibold">{p.type === 'service' ? '🛠️' : '📦'} {p.name}</p>
                    <p className={`truncate text-xs ${ui.muted}`}>
                      {p.sku} · {money(Number(p.price), p.currency, lang)}{p.active ? '' : ` · ${t('prod.inactive')}`}
                    </p>
                  </div>

                  {p.track ? (
                    <span className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${Number(qty) <= 0 ? 'border-red-300 text-red-600 dark:border-red-500/40 dark:text-red-400' : 'border-slate-300 dark:border-slate-700'}`}>
                      {Number(qty)} {p.unit}
                    </span>
                  ) : (
                    <span className={`text-xs ${ui.muted}`}>{p.type === 'service' ? t('prod.service') : t('prod.noStockCtl')}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <ShowMore rest={paged.rest} onClick={paged.more} />
    </div>
  );
}
