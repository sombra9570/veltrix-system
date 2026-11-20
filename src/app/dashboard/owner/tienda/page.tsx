'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase, rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import type { DictKey } from '../../../i18n/es';
import { money } from '../../format';
import { PhotoSlot } from '../../photo-picker';
import { StoreProductForm } from './product-form';
import { compressImage, extFor, storeImageUrl, makeThumb, thumbPath } from '../../image';

type Company = { id: string; legal_name: string };
type Product = { id: string; name: string; price: number; type: string; in_store: boolean; description: string | null; photo: string | null; active: boolean; variants?: number };
type Store = { id: string; company_id: string; branch_id: string; slug: string; name: string; description: string | null; whatsapp: string | null; logo_path: string | null; own_qr_path?: string | null; is_published: boolean };
type Admin = {
  perms?: { create: boolean; photo: boolean; publish: boolean; edit: boolean }; store: Store & { org_id?: string }; currency: string; max_products: number | null; branches: { id: string; name: string }[]; products: Product[] };

const BUCKET = 'store-images';
const okBox = 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
const errBox = 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';

function storeError(msg: string, t: (k: DictKey) => string) {
  if (msg.includes('PHOTO_UNREADABLE')) return t('photo.unreadable');
  if (msg.includes('PHOTO_TOO_BIG')) return t('photo.tooBig');
  if (msg.includes('STORE_SLUG_INVALID')) return t('store.slugInvalid');
  if (msg.includes('STORE_SLUG_TAKEN')) return t('store.slugTaken');
  if (msg.includes('STORE_NEEDS_WHATSAPP')) return t('store.needsWhatsapp');
  if (msg.includes('PERM_DENIED')) return t('err.permDenied');
  if (msg.includes('MODEL_EXISTS')) return t('sp.exists');
  if (msg.includes('STORE_PHOTO_REQUIRED')) return t('store.photoRequired');
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
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState(false);

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
      setEditing(false);
    } catch (err) { flash(false, storeError((err as Error).message, t)); } finally { setBusy(false); }
  };

  const upload = async (file: File, name: string, maxSide: number) => {
    const blob = await compressImage(file, maxSide, 0.8);
    const path = `${orgId}/${companyId}/${name}-${Date.now()}.${extFor(blob)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
    if (error) throw new Error(error.message);
    return path;
  };
  const removeOld = async (path: string | null) => { if (path) await supabase.storage.from(BUCKET).remove([path, thumbPath(path)]); };

  // QR propio del negocio (carta existente): se guarda nítido y sin recorte
  const setOwnQr = async (file: File | undefined) => {
    if (!file || !data) return;
    setBusy(true);
    try {
      const path = await upload(file, 'qr', 1000);
      await rpc('set_store_qr', { p_company: companyId, p_path: path });
      await removeOld(data.store.own_qr_path ?? null);
      flash(true, t('store.saved'));
      await load();
    } catch (err) { flash(false, storeError((err as Error).message, t)); } finally { setBusy(false); }
  };
  const useVeltrixQr = async () => {
    if (!data?.store.own_qr_path) return;
    setBusy(true);
    try {
      await rpc('set_store_qr', { p_company: companyId, p_path: null });
      await removeOld(data.store.own_qr_path);
      await load();
    } catch (err) { flash(false, storeError((err as Error).message, t)); } finally { setBusy(false); }
  };
  const addAll = async () => {
    setBusy(true);
    try {
      const n = await rpc<number>('store_add_all', { p_company: companyId });
      flash(true, t('store.addedAll', { n }));
      await load();
    } catch (err) { flash(false, storeError((err as Error).message, t)); } finally { setBusy(false); }
  };
  // Hoja imprimible: logo, nombre, QR grande y llamado a escanear (para mesas, mostrador o vitrina)
  const printCard = (qrSrc: string) => {
    const w = window.open('', '_blank', 'noopener,width=600,height=800');
    if (!w || !form) return;
    const logo = data?.store.logo_path ? storeImageUrl(data.store.logo_path) : '';
    const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(form.name)}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh}
.c{text-align:center;padding:32px;border:2px solid #e2e8f0;border-radius:24px;width:340px}
img.l{max-height:80px;max-width:200px;object-fit:contain}h1{margin:12px 0 4px;font-size:26px}
p{margin:4px 0;color:#475569}img.q{width:260px;height:260px;margin:16px auto;display:block}
small{color:#94a3b8}@media print{.c{border:none}}</style></head><body><div class="c">
${logo ? `<img class="l" src="${logo}" alt="">` : ''}<h1>${esc(form.name)}</h1><p>${esc(t('store.scanToSee'))}</p>
<img class="q" src="${qrSrc}" alt="QR"><small>${esc(link)}</small></div>
<script>window.onload=()=>setTimeout(()=>window.print(),400)</script></body></html>`);
    w.document.close();
  };

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
      // Miniatura para las listas: si falla, la foto igual queda (la lista usa la grande)
      try {
        const tb = await makeThumb(file);
        await supabase.storage.from(BUCKET).upload(thumbPath(path), tb, { contentType: tb.type, cacheControl: '31536000', upsert: false });
      } catch { /* sin miniatura */ }
      await rpc('set_product_photo', { p_product: p.id, p_path: path });
      await removeOld(p.photo);
      await load();
    } catch (err) { flash(false, storeError((err as Error).message, t)); } finally { setBusy(false); }
  };
  // Fotos antiguas sin miniatura: se crean una sola vez desde este equipo, de a una y sin apuro
  useEffect(() => {
    const items = (data?.products ?? []).filter((p) => p.photo);
    if (!items.length) return;
    let stop = false;
    (async () => {
      for (const p of items) {
        if (stop) return;
        const key = `vx:thumb:${p.photo}`;
        try { if (localStorage.getItem(key)) continue; } catch { /* */ }
        try {
          const res = await fetch(storeImageUrl(p.photo)!);
          if (!res.ok) continue;
          const tb = await makeThumb(await res.blob());
          // si ya existía, el servidor la rechaza y no pasa nada
          await supabase.storage.from(BUCKET).upload(thumbPath(p.photo!), tb, { contentType: tb.type, cacheControl: '31536000', upsert: false });
        } catch { /* se intenta otro día */ }
        try { localStorage.setItem(key, '1'); } catch { /* */ }
        await new Promise((r) => setTimeout(r, 400));
      }
    })();
    return () => { stop = true; };
  }, [data?.products]);
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
  const pm = data.perms ?? { create: true, photo: true, publish: true, edit: true };
  const pe = pm.edit;
  const showForm = pe && (editing || !data.store.whatsapp);
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

      {/* Tienda ya configurada: solo logo, nombre y editar */}
      {!showForm && (
        <Card className="flex items-center gap-3 !p-3">
          <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 text-2xl dark:bg-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : '🏪'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{data.store.name}</p>
            {data.store.description && <p className={`line-clamp-1 text-xs ${ui.muted}`}>{data.store.description}</p>}
          </div>
          {pe && <button type="button" onClick={() => setEditing(true)} className={`${ui.btnGhost} shrink-0`}>✏️ {t('store.editBtn')}</button>}
        </Card>
      )}
      {showForm && (
        <Card>
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <fieldset disabled={!pe} className="contents">
            <div className="flex items-center gap-4 sm:col-span-2">
              <PhotoSlot current={logo} onFile={(f) => setLogo(f)} busy={busy} size="h-20 w-20" icon="🏪" />
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
              <label className={ui.label}>🔒 {t('store.link')}</label>
              <p className="break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs dark:border-slate-800 dark:bg-slate-800/50">{link}</p>
              <p className={`mt-1 text-xs ${ui.muted}`}>{t('store.linkLocked')}</p>
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
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
              {data.store.whatsapp && <button type="button" onClick={() => { setForm(data.store); setEditing(false); }} className={ui.btnGhost}>{t('card.cancel')}</button>}
              <button type="submit" disabled={busy} className={`${ui.btnPrimary} ${data.store.whatsapp ? '' : 'sm:col-span-2'}`}>{busy ? t('common.wait') : t('prod.save')}</button>
            </div>
          </fieldset>
          </form>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
      {/* Productos de la tienda */}
        <Card className="space-y-3 lg:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">{t('store.products')}</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${data.max_products !== null && published >= data.max_products ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'}`}>
            {t('store.published', { n: published, max: data.max_products ?? '∞' })}
          </span>
        </div>
        <p className={`text-xs ${ui.muted}`}>{t('store.photoHint')}</p>
        {pm.create && !newOpen && (
          <button type="button" onClick={() => setNewOpen(true)} className={`${ui.btnPrimary} w-full`}>➕ {t('sp.new')}</button>
        )}
        {pm.create && newOpen && (
          <StoreProductForm orgId={orgId} companyId={companyId} currency={data.currency} canPublish={pm.publish}
            onCancel={() => setNewOpen(false)}
            onError={(m) => flash(false, storeError(m, t))}
            onDone={(n) => { setNewOpen(false); flash(true, t('sp.created', { n })); load(); }} />
        )}
        {pm.publish && data.products.some((p) => !p.in_store && p.active && p.photo) && (
          <button type="button" disabled={busy} onClick={addAll} className={`${ui.btnGhost} w-full cursor-pointer`}>➕ {t('store.addAll')}</button>
        )}
        {data.products.length === 0 && <p className={`text-sm ${ui.muted}`}>{t('prod.empty')}</p>}
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {data.products.map((p) => {
            const img = storeImageUrl(p.photo);
            return (
              <li key={p.id} className={`flex flex-wrap items-center gap-3 py-3 ${p.active ? '' : 'opacity-50'}`}>
                {pm.photo ? <PhotoSlot current={img} onFile={(f) => setPhoto(p, f)} busy={busy} /> : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">{img ? <img src={img} alt="" className="h-full w-full object-cover" /> : '📷'}</span>
                )}
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className={`text-xs ${ui.muted}`}>{fmt(p.price)}{(p.variants ?? 1) > 1 && <> · {t('store.variants', { n: p.variants ?? 1 })}</>}</p>
                  {!p.photo && <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">📷 {t('store.needsPhoto')}</p>}
                  {p.in_store && pm.publish && (
                    <input defaultValue={p.description ?? ''} placeholder={t('store.productDesc')} maxLength={300}
                      onBlur={(e) => { if (e.target.value !== (p.description ?? '')) toggle(p, e.target.value); }}
                      className={`${ui.input} mt-1 !py-1.5 text-xs`} />
                  )}
                </div>
                <button type="button" disabled={!pm.publish || (!p.in_store && !p.photo)} onClick={() => toggle(p)}
                  className={`shrink-0 rounded-full disabled:cursor-not-allowed disabled:opacity-40 px-3 py-1.5 text-xs font-bold transition cursor-pointer ${p.in_store ? 'bg-emerald-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
                  {p.in_store ? `✓ ${t('store.inStore')}` : t('store.addToStore')}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
        {/* Compartir */}
        <Card className="space-y-3 lg:order-last lg:col-span-2">
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
              {(() => {
                const own = data.store.own_qr_path ? storeImageUrl(data.store.own_qr_path) : null;
                const gen = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=12&format=png&data=${encodeURIComponent(link)}`;
                const qr = own ?? gen;
                return (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr} alt="QR" width={240} height={240} className="mx-auto h-60 w-60 rounded-xl bg-white object-contain p-1" />
                    <p className={`text-center text-xs ${ui.muted}`}>{own ? t('store.qrOwn') : t('store.qrHint')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <a href={qr} download={`qr-${form.slug}.png`} target="_blank" rel="noopener noreferrer" className={ui.btnGhost}>⬇️ {t('store.qrDownload')}</a>
                      <button type="button" onClick={() => printCard(qr)} className={`${ui.btnGhost} cursor-pointer`}>🖨️ {t('store.qrPrint')}</button>
                      <label className={`${ui.btnGhost} relative cursor-pointer text-center`}>📤 {t('store.qrUpload')}
                        <input type="file" accept="image/*" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; setOwnQr(f); }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                      </label>
                      {own && <button type="button" disabled={busy} onClick={useVeltrixQr} className={`${ui.btnGhost} cursor-pointer`}>↺ {t('store.qrUseVeltrix')}</button>}
                    </div>
                  </>
                );
              })()}
            </>
          ) : (
            <p className={`text-sm ${ui.muted}`}>{t('store.notPublished')}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
