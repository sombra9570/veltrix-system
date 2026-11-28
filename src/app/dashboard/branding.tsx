'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { rpc, supabase } from '../../lib/supabase';
import { compressImage, extFor } from './image';
import { useT } from '../i18n';
import { ui } from '../site-header';

type Branding = { name: string; logo: string | null; logo_dark: string | null };
const EVT = 'vx-branding';

/** Los PNG se guardan con -t en el nombre para mostrarlos sin recuadro */
export function isTransparentLogo(path?: string | null) { return !!path && /-t\.\w+$/.test(path); }

export function orgLogoUrl(path: string | null | undefined) {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/org-logos/${path}`;
}

/** Nombre y logos de la empresa; se actualizan solos cuando el administrador los cambia */
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

function LogoImg({ path, name, size, cls }: { path: string; name: string; size: number; cls: string }) {
  const url = orgLogoUrl(path);
  const [bad, setBad] = useState(false);
  if (!url || bad) return null;
  // PNG (marcado -t): tal cual, sin recuadro. Otros formatos: imagen en cuadro.
  return isTransparentLogo(path)
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={url} alt={name} onError={() => setBad(true)} style={{ height: size, maxWidth: size * 2.5 }} className={`shrink-0 object-contain ${cls}`} />
    // eslint-disable-next-line @next/next/no-img-element
    : <img src={url} alt={name} onError={() => setBad(true)} style={{ width: size, height: size }} className={`shrink-0 rounded-lg object-cover ${cls}`} />;
}

/** Muestra el logo de día o de noche según el modo; si hay uno solo, el mismo en ambos */
export function OrgLogo({ day, night, name, size = 32 }: { day?: string | null; night?: string | null; name: string; size?: number }) {
  if (day && night) return (
    <>
      <LogoImg path={day} name={name} size={size} cls="dark:hidden" />
      <LogoImg path={night} name={name} size={size} cls="hidden dark:block" />
    </>
  );
  const one = day || night;
  return one ? <LogoImg path={one} name={name} size={size} cls="" /> : null;
}

/** Una casilla de logo (día o noche) en el editor */
function LogoSlot({ orgId, dark, current, label, busy, setBusy, done, other }: {
  orgId: string; dark: boolean; current: string | null; label: string; busy: boolean;
  setBusy: (v: boolean) => void; done: (ok: boolean, text: string) => void; other: string | null;
}) {
  const { t } = useT();
  const file = useRef<HTMLInputElement>(null);
  const pick = async (f: File | undefined) => {
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
      const path = `${orgId}/logo${dark ? '-n' : ''}-${Date.now()}${tag}.${ext}`;
      const { error } = await supabase.storage.from('org-logos').upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
      if (error) throw new Error(error.message);
      await rpc('set_org_branding', { p_org: orgId, p_name: null, p_logo: path, p_dark: dark });
      if (current && current !== other) await supabase.storage.from('org-logos').remove([current]);
      done(true, t('brand.saved'));
    } catch { done(false, t('brand.failed')); } finally { setBusy(false); if (file.current) file.current.value = ''; }
  };
  const clear = async () => {
    setBusy(true);
    try {
      await rpc('set_org_branding', { p_org: orgId, p_name: null, p_logo: null, p_clear: true, p_dark: dark });
      if (current) await supabase.storage.from('org-logos').remove([current]);
      done(true, t('brand.saved'));
    } catch { done(false, t('brand.failed')); } finally { setBusy(false); }
  };
  return (
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold">{label}</p>
      <div className={`mt-1 grid h-24 place-items-center overflow-hidden rounded-xl border border-dashed border-slate-300 ${dark ? 'bg-slate-900' : 'bg-white'} dark:border-slate-700`}>
        {current ? <LogoImg path={current} name={label} size={80} cls="" /> : <span className={`text-[10px] ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t('brand.noLogo')}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => file.current?.click()}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold cursor-pointer dark:border-slate-700">{t('brand.logo')}</button>
        {current && <button type="button" disabled={busy} onClick={clear}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold cursor-pointer dark:border-slate-700">{t('brand.removeLogo')}</button>}
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
    </div>
  );
}

/** Editor del administrador: nombre y logos (día y noche) de su empresa */
export function BrandingCard({ orgId }: { orgId: string }) {
  const { t } = useT();
  const b = useOrgBranding(orgId);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (b) setName(b.name); }, [b?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (ok: boolean, text: string) => { setMsg({ ok, text }); if (ok) window.dispatchEvent(new Event(EVT)); };
  const saveName = async () => {
    setBusy(true);
    try { await rpc('set_org_branding', { p_org: orgId, p_name: name, p_logo: null }); done(true, t('brand.saved')); }
    catch { done(false, t('brand.failed')); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="text-sm font-bold">{t('brand.title')}</p>
      <div className="mt-3 flex gap-3">
        <LogoSlot orgId={orgId} dark={false} current={b?.logo ?? null} other={b?.logo_dark ?? null} label={t('brand.logoDay')} busy={busy} setBusy={setBusy} done={done} />
        <LogoSlot orgId={orgId} dark current={b?.logo_dark ?? null} other={b?.logo ?? null} label={t('brand.logoNight')} busy={busy} setBusy={setBusy} done={done} />
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
