'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { rpc, supabase } from '../../lib/supabase';
import { compressImage, extFor } from './image';
import { useT } from '../i18n';
import { ui } from '../site-header';

type Branding = { name: string; logo: string | null };
const EVT = 'vx-branding';

/** Los PNG se guardan con -t en el nombre para mostrarlos sin recuadro */
export function isTransparentLogo(path?: string | null) { return !!path && /-t\.\w+$/.test(path); }

export function orgLogoUrl(path: string | null | undefined) {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/org-logos/${path}`;
}

/** Nombre y logo de la empresa; se actualiza solo cuando el administrador los cambia */
export function useOrgBranding(orgId?: string | null) {
  const [b, setB] = useState<Branding | null>(null);
  const load = useCallback(() => {
    if (!orgId) return;
    rpc<Branding | null>('org_branding', { p_org: orgId }).then((r) => { if (r) setB(r); }).catch(() => {});
  }, [orgId]);
  useEffect(() => {
    load();
    window.addEventListener(EVT, load);
    return () => window.removeEventListener(EVT, load);
  }, [load]);
  return b;
}

export function OrgLogo({ path, name, size = 32 }: { path?: string | null; name: string; size?: number }) {
  const url = orgLogoUrl(path);
  const [bad, setBad] = useState(false);
  if (!url || bad) return null;
  // PNG (marcado -t): se muestra tal cual, sin recuadro. Otros formatos: imagen en cuadro.
  if (isTransparentLogo(path)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} onError={() => setBad(true)} style={{ height: size, maxWidth: size * 2.5 }} className="shrink-0 object-contain" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={name} onError={() => setBad(true)} style={{ width: size, height: size }} className="shrink-0 rounded-lg object-cover" />;
}

/** Editor del administrador: nombre y logo de su empresa */
export function BrandingCard({ orgId }: { orgId: string }) {
  const { t } = useT();
  const b = useOrgBranding(orgId);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (b) setName(b.name); }, [b?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (ok: boolean, text: string) => { setMsg({ ok, text }); if (ok) window.dispatchEvent(new Event(EVT)); };
  const saveName = async () => {
    setBusy(true);
    try { await rpc('set_org_branding', { p_org: orgId, p_name: name, p_logo: null }); done(true, t('brand.saved')); }
    catch { done(false, t('brand.failed')); } finally { setBusy(false); }
  };
  const pickLogo = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      let blob: Blob; let ext: string; let tag = '';
      if (f.type === 'image/png') {
        // PNG: se conserva la transparencia (PNG o, si pesa mucho, WebP con transparencia)
        const bmp = await createImageBitmap(f);
        const sc = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(bmp.width * sc)); cv.height = Math.max(1, Math.round(bmp.height * sc));
        cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
        const png = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/png'));
        const webp = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/webp', 0.9));
        if (png && png.size <= 800_000) { blob = png; ext = 'png'; }
        else if (webp && webp.type === 'image/webp') { blob = webp; ext = 'webp'; }
        else throw new Error('big');
        tag = '-t';
      } else { blob = await compressImage(f, 512, 0.85); ext = extFor(blob); }
      const path = `${orgId}/logo-${Date.now()}${tag}.${ext}`;
      const { error } = await supabase.storage.from('org-logos').upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
      if (error) throw new Error(error.message);
      await rpc('set_org_branding', { p_org: orgId, p_name: null, p_logo: path });
      if (b?.logo) await supabase.storage.from('org-logos').remove([b.logo]);
      done(true, t('brand.saved'));
    } catch { done(false, t('brand.failed')); } finally { setBusy(false); if (file.current) file.current.value = ''; }
  };
  const clearLogo = async () => {
    setBusy(true);
    try {
      await rpc('set_org_branding', { p_org: orgId, p_name: null, p_logo: null, p_clear: true });
      if (b?.logo) await supabase.storage.from('org-logos').remove([b.logo]);
      done(true, t('brand.saved'));
    } catch { done(false, t('brand.failed')); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="text-sm font-bold">{t('brand.title')}</p>
      <div className="mt-3 flex items-center gap-3">
        <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
          {b?.logo ? <OrgLogo path={b.logo} name={b.name} size={80} /> : <span className={`text-[10px] ${ui.muted}`}>{t('brand.noLogo')}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => file.current?.click()}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold cursor-pointer dark:border-slate-700">{t('brand.logo')}</button>
          {b?.logo && <button type="button" disabled={busy} onClick={clearLogo}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold cursor-pointer dark:border-slate-700">{t('brand.removeLogo')}</button>}
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
        </div>
      </div>
      <label className="mt-3 block text-xs font-semibold">{t('brand.name')}
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      </label>
      <button type="button" disabled={busy || !name.trim() || name.trim() === b?.name} onClick={saveName}
        className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 cursor-pointer">{t('brand.save')}</button>
      {msg && <p className={`mt-2 text-xs ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</p>}
    </div>
  );
}
