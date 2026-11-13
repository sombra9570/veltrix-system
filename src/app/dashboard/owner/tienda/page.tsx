'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase, rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import type { DictKey } from '../../../i18n/es';
import { money } from '../../format';
import { compressImage, extFor, storeImageUrl } from '../../image';

type Company = { id: string; legal_name: string };
type Product = { id: string; name: string; price: number; type: string; in_store: boolean; description: string | null; photo: string | null; active: boolean };
type Store = { id: string; company_id: string; branch_id: string; slug: string; name: string; description: string | null; whatsapp: string | null; logo_path: string | null; is_published: boolean };
type Admin = { store: Store & { org_id?: string }; currency: string; max_products: number | null; branches: { id: string; name: string }[]; products: Product[] };

const BUCKET = 'store-images';
const okBox = 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
const errBox = 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';

function storeError(msg: string, t: (k: DictKey) => string) {
  if (msg.includes('STORE_SLUG_INVALID')) return t('store.slugInvalid');
  if (msg.includes('STORE_SLUG_TAKEN')) return t('store.slugTaken');
  if (msg.includes('STORE_NEEDS_WHATSAPP')) return t('store.needsWhatsapp');
  if (msg.includes('PLAN_LIMIT_STORE')) return t('store.limit');
  if (/row-level|storage/i.test(msg)) return t('cust.uploadFailed');
  return t('err.generic');
}

export default function StoreAdminPage() {
  const { t, lang } = useT();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [orgId, setOrgId] = useState('');
  const [data, setData] = useState<Admin | null>(null);
  const [form, setForm] = useState<Store | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    supabase.from('companies').select('id, legal_name, org_id').is('deleted_at', null).order('created_at')
      .then(({ data: c }) => {
        setCompanies((c ?? []) as Company[]);
        if (c?.length) { setCompanyId(c[0].id); setOrgId(c[0].org_id); }
      });
  }, []);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      const d = await rpc<Admin>('store_admin', { p_company: companyId });
      setData(d);
      setForm(d.store);
    } catch { /* sin conexión */ }
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };
  const fmt = (n: number) => money(Number(n), data?.currency ?? 'USD', lang);
  const link = form ? `${origin}/tienda/${form.slug}` : '';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      await rpc('save_store', {
        p_company: companyId, p_slug: form.slug, p_name: form.name, p_description: form.description,
        p_whatsapp: form.whatsapp, p_branch: form.branch_id, p_published: form.is_published,
      });
      flash(true, t('store.saved'));
      await load();
    } catch (err) { flash(false, storeError((err as Error).message, t)); } finally { setBusy(false); }
  };

  const upload = async (file: File, name: string, maxSide: number) => {
    const blob = await compressImage(file, maxSide, 0.8);
    const path = `${orgId}/${companyId}/${name}-${Date.now()}.${extFor(blob)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
    if (error) throw new Error(error.message);
    return path;
  };
  const removeOld = async (path: string | null) => { if (path) await supabase.storage.from(BUCKET).remove([path]); };

  const setLogo = async (file: File | undefined) => {
    if (!file || !data) return;
    setBusy(true);
    try {
      const path = await upload(file, 'logo', 512);
      await rpc('set_store_logo', { p_company: companyId, p_path: path });
      await removeOld(data.store.logo_path);
      await load();
    } catch (err) { flash(false, storeError((err as Error).message, t)); } finally { setBusy(false); }
  };
  const setPhoto = async (p: Product, file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const path = await upload(file, `p-${p.id}`, 1200);
      await rpc('set_product_photo', { p_product: p.id, p_path: path });
      await removeOld(p.photo);
      await load();
    } catch (err) { flash(false, storeError((err as Error).message, t)); } finally { setBusy(false); }
  };
  const toggle = async (p: Product, description?: string) => {
    try {
      await rpc('set_product_store', { p_product: p.id, p_in_store: description !== undefined ? p.in_store : !p.in_store, p_description: description ?? p.description });
      await load();
    } catch (err) { flash(false, storeError((err as Error).message, t)); }
  };

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: form?.name, url: link });
      else { await navigator.clipboard.writeText(link); flash(true, t('store.copied')); }
    } catch { /* cancelado */ }
  };

  if (!data || !form) return <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>;
  const published = data.products.filter((p) => p.in_store).length;
  const logo = storeImageUrl(data.store.logo_path);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold sm:text-2xl">🛍️ {t('store.title')}</h1>
          <p className={`text-sm ${ui.muted}`}>{t('store.subtitle')}</p>
        </div>
        {companies.length > 1 && (
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${ui.input} !w-auto max-sm:!w-full`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
          </select>
        )}
      </div>

      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? okBox : errBox}`}>{msg.text}</p>}

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Datos de la tienda */}
        <Card className="lg:col-span-3">
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-4 sm:col-span-2">
              <label className="relative grid h-20 w-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : <span className="text-2xl">🏪</span>}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setLogo(e.target.files?.[0])} />
              </label>
              <p className={`text-xs ${ui.muted}`}>{t('store.logoHint')}</p>
            </div>
            <div>
              <label className={ui.label}>{t('store.name')}</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={ui.input} />
            </div>
            <div>
              <label className={ui.label}>{t('store.whatsapp')}</label>
              <input type="tel" inputMode="tel" value={form.whatsapp ?? ''} placeholder="+591 70000000" onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} className={ui.input} />
            </div>
            <div className="sm:col-span-2">
              <label className={ui.label}>{t('store.link')}</label>
              <div className="flex items-center overflow-hidden rounded-xl border border-slate-300 dark:border-slate-700">
                <span className={`hidden shrink-0 bg-slate-50 px-3 py-2.5 text-sm sm:block dark:bg-slate-800 ${ui.muted}`}>{origin.replace(/^https?:\/\//, '')}/tienda/</span>
                <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  className="w-full bg-transparent px-3 py-2.5 text-sm outline-none" />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={ui.label}>{t('store.description')}</label>
              <textarea rows={2} maxLength={300} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className={ui.input} />
            </div>
            {data.branches.length > 1 && (
              <div>
                <label className={ui.label}>{t('store.stockFrom')}</label>
                <select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })} className={ui.input}>
                  {data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-300 p-3 sm:col-span-2 dark:border-slate-700">
              <input type="checkbox" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} className="h-5 w-5" />
              <span>
                <span className="block text-sm font-bold">{t('store.publish')}</span>
                <span className={`block text-xs ${ui.muted}`}>{t('store.publishHint')}</span>
              </span>
            </label>
            <button type="submit" disabled={busy} className={`${ui.btnPrimary} sm:col-span-2`}>{busy ? t('common.wait') : t('prod.save')}</button>
          </form>
        </Card>

        {/* Compartir */}
        <Card className="space-y-3 lg:col-span-2">
          <h2 className="font-bold">📣 {t('store.share')}</h2>
          {data.store.is_published ? (
            <>
              <p className="break-all rounded-lg bg-slate-50 p-2 font-mono text-xs dark:bg-slate-800">{link}</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={share} className={ui.btnPrimary}>🔗 {t('store.shareBtn')}</button>
                <a href={link} target="_blank" rel="noopener noreferrer" className={ui.btnGhost}>👁️ {t('store.view')}</a>
                <a href={`https://wa.me/?text=${encodeURIComponent(`${form.name} 👉 ${link}`)}`} target="_blank" rel="noopener noreferrer" className={ui.btnGhost}>💬 WhatsApp</a>
                <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer" className={ui.btnGhost}>📘 Facebook</a>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(link)}`}
                alt="QR" width={240} height={240} className="mx-auto rounded-xl bg-white" />
              <p className={`text-center text-xs ${ui.muted}`}>{t('store.qrHint')}</p>
            </>
          ) : (
            <p className={`text-sm ${ui.muted}`}>{t('store.notPublished')}</p>
          )}
        </Card>
      </div>

      {/* Productos de la tienda */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">{t('store.products')}</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${data.max_products !== null && published >= data.max_products ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'}`}>
            {t('store.published', { n: published, max: data.max_products ?? '∞' })}
          </span>
        </div>
        <p className={`text-xs ${ui.muted}`}>{t('store.photoHint')}</p>
        {data.products.length === 0 && <p className={`text-sm ${ui.muted}`}>{t('prod.empty')}</p>}
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {data.products.map((p) => {
            const img = storeImageUrl(p.photo);
            return (
              <li key={p.id} className={`flex flex-wrap items-center gap-3 py-3 ${p.active ? '' : 'opacity-50'}`}>
                <label className="relative grid h-16 w-16 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {img ? <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span className="text-xl">📷</span>}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(p, e.target.files?.[0])} />
                </label>
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className={`text-xs ${ui.muted}`}>{fmt(p.price)}</p>
                  {p.in_store && (
                    <input defaultValue={p.description ?? ''} placeholder={t('store.productDesc')} maxLength={300}
                      onBlur={(e) => { if (e.target.value !== (p.description ?? '')) toggle(p, e.target.value); }}
                      className={`${ui.input} mt-1 !py-1.5 text-xs`} />
                  )}
                </div>
                <button type="button" onClick={() => toggle(p)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition cursor-pointer ${p.in_store ? 'bg-emerald-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
                  {p.in_store ? `✓ ${t('store.inStore')}` : t('store.addToStore')}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
