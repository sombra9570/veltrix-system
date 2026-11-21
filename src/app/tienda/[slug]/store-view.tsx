'use client';
import { resolveTheme } from '../../store-theme';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { useT } from '../../i18n';
import { ThemeToggle } from '../../theme';
import { ui } from '../../site-header';
import { storeImageUrl, storeThumbUrl } from '../../dashboard/image';
import { Spinner } from '../../spinner';

type Product = { id: string; name: string; price: number; type: string; description: string | null; photo: string | null; unit: string; available: boolean; model?: string | null; size?: string | null; color?: string | null };
type Store = { slug: string; name: string; description: string | null; whatsapp: string | null; logo: string | null; theme?: string; address?: string | null; map_url?: string | null; currency: string; products: Product[] };
type Line = { p: Product; qty: number };
type DStatus = { status: 'pending' | 'accepted' | 'rejected'; reject_reason: string | null; subtotal: number; fee: number; total: number; eta_min: number | null; zone: string | null; delivery_status: 'pending' | 'dispatched' | 'delivered' | 'failed' | null };

/** Tienda pública: catálogo, carrito y pedido por WhatsApp. No guarda nada en la base. */
export function StoreView({ slug }: { slug: string }) {
  const { t, lang } = useT();
  const [store, setStore] = useState<Store | null | undefined>(undefined);
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<Line[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [sel, setSel] = useState<Record<string, { size?: string; color?: string }>>({});
  const th = resolveTheme(store?.theme);
  const CART_KEY = `vx_store_cart_${slug}`;
  const DREQ_KEY = `vx_store_dreq_${slug}`;
  const [phone, setPhone] = useState('');
  const [pay, setPay] = useState<'qr' | 'cash'>('cash');
  const [address, setAddress] = useState('');
  const [reference, setReference] = useState('');
  const [method, setMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [dBusy, setDBusy] = useState(false);
  const [dErr, setDErr] = useState('');
  const [dReq, setDReq] = useState<string | null>(null);
  const [dStatus, setDStatus] = useState<DStatus | null>(null);

  useEffect(() => {
    supabase.rpc('public_store', { p_slug: slug }).then(({ data }) => setStore((data as Store | null) ?? null));
    try { setCart(JSON.parse(localStorage.getItem(CART_KEY) ?? '[]')); } catch { /* */ }
    try { setDReq(localStorage.getItem(DREQ_KEY)); } catch { /* */ }
  }, [slug, CART_KEY, DREQ_KEY]);

  // Seguimiento del pedido de delivery en curso
  useEffect(() => {
    if (!dReq) return;
    let stop = false;
    const tick = async () => {
      const { data } = await supabase.rpc('public_delivery_status', { p_request: dReq });
      if (stop) return;
      const s = data as DStatus | null;
      if (!s) { try { localStorage.removeItem(DREQ_KEY); } catch { /* */ } setDReq(null); return; }
      setDStatus(s);
    };
    tick();
    const ch = supabase.channel(`req:${dReq}`).on('broadcast', { event: 'ping' }, () => { if (document.visibilityState === 'visible') tick(); }).subscribe();
    const id = setInterval(() => { if (document.visibilityState === 'visible') tick(); }, 90_000);
    return () => { stop = true; clearInterval(id); void supabase.removeChannel(ch); };
  }, [dReq, DREQ_KEY]);
  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* */ } }, [cart, CART_KEY]);

  const fmt = (n: number) => {
    try { return new Intl.NumberFormat(lang, { style: 'currency', currency: store?.currency ?? 'USD' }).format(n); }
    catch { return `${store?.currency ?? ''} ${n.toFixed(2)}`; }
  };

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const seen = new Set<string>();
    // Los productos con tallas y colores salen como una sola tarjeta por modelo
    const all = (store?.products ?? []).filter((p) => { if (!p.model) return true; if (seen.has(p.model)) return false; seen.add(p.model); return true; })
      .map((p) => (p.model ? { ...p, name: p.model, available: (store?.products ?? []).some((x) => x.model === p.model && x.available) } : p));
    return s ? all.filter((p) => p.name.toLowerCase().includes(s) || (p.description ?? '').toLowerCase().includes(s)) : all;
  }, [store, q]);

  const add = (p: Product) => setCart((c) => {
    const ex = c.find((l) => l.p.id === p.id);
    return ex ? c.map((l) => (l.p.id === p.id ? { ...l, qty: l.qty + 1 } : l)) : [...c, { p, qty: 1 }];
  });
  const change = (id: string, d: number) => setCart((c) => c.map((l) => (l.p.id === id ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0));
  const total = cart.reduce((s, l) => s + l.qty * Number(l.p.price), 0);
  const units = cart.reduce((s, l) => s + l.qty, 0);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }), () => setDErr(t('dl.noLocation')), { enableHighAccuracy: true, timeout: 10000 });
  };
  const isPickup = (() => { try { return localStorage.getItem(`${DREQ_KEY}_pk`) === '1'; } catch { return false; } })();
  const dAgain = () => { try { localStorage.removeItem(DREQ_KEY); localStorage.removeItem(`${DREQ_KEY}_pk`); } catch { /* */ } setDReq(null); setDStatus(null); };

  // Registra el pedido (para que el negocio lo vea y descuente stock al aceptarlo) y abre WhatsApp con el detalle
  const sendOrder = async () => {
    if (!store || !cart.length || dBusy) return;
    setDBusy(true); setDErr('');
    const { data, error } = await supabase.rpc('public_store_pickup', {
      p_slug: slug, p_items: cart.map((l) => ({ product_id: l.p.id, qty: l.qty })), p_name: name, p_phone: phone, p_notes: note, p_pay: pay,
      p_kind: method, p_address: address, p_reference: reference, p_lat: method === 'delivery' ? coords?.lat ?? null : null, p_lng: method === 'delivery' ? coords?.lng ?? null : null,
    });
    setDBusy(false);
    if (error) {
      const m = error.message;
      setDErr(/PRODUCT_UNAVAILABLE/.test(m) ? t('tq.errUnavailable') : /TOO_MANY/.test(m) ? t('dl.errMany') : /PHONE|DATA/.test(m) ? t('dl.errData') : t('err.generic'));
      return;
    }
    try { localStorage.setItem(DREQ_KEY, data as string); if (method === 'pickup') localStorage.setItem(`${DREQ_KEY}_pk`, '1'); else localStorage.removeItem(`${DREQ_KEY}_pk`); } catch { /* */ }
    setDStatus(null); setDReq(data as string); setCart([]); setOpen(false);
  };

  const shareStore = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: store?.name, url });
      else await navigator.clipboard.writeText(url);
    } catch { /* cancelado */ }
  };

  if (store === undefined) return <div className="grid min-h-dvh place-items-center bg-slate-50 dark:bg-slate-950"><Spinner /></div>;
  if (store === null) {
    return (
      <main className="grid min-h-dvh place-items-center bg-slate-50 p-6 text-center dark:bg-slate-950">
        <div>
          <p className="text-5xl">🏪</p>
          <h1 className="mt-3 text-xl font-bold">{t('shop2.notFound')}</h1>
          <Link href="/" className={`${ui.btnGhost} mt-5`}>Veltrix</Link>
        </div>
      </main>
    );
  }

  const logo = storeImageUrl(store.logo);

  if (dReq) {
    const ds = dStatus?.delivery_status;
    return (
      <main className="grid min-h-dvh place-items-center bg-slate-50 p-5 text-center dark:bg-slate-950">
        <div className={`w-full max-w-sm space-y-4 rounded-2xl p-6 ${ui.card}`}>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{store.name}</p>
          {!dStatus || dStatus.status === 'pending' ? (
            <><p className="text-5xl">⏳</p><h1 className="text-lg font-extrabold">{t('tq.sent')}</h1><p className={`text-sm ${ui.muted}`}>{t('dl.waiting')}</p></>
          ) : dStatus.status === 'rejected' ? (
            <><p className="text-5xl">🙏</p><h1 className="text-lg font-extrabold">{t('tq.rejected')}</h1>
              {dStatus.reject_reason && <p className={`text-sm ${ui.muted}`}>{dStatus.reject_reason}</p>}
              <button type="button" onClick={dAgain} className={ui.btnPrimary}>{t('tq.again')}</button></>
          ) : isPickup ? (
            <><p className="text-5xl">🏬</p><h1 className="text-lg font-extrabold">{t('pk.accepted')}</h1>
              {(store.address || store.map_url) && <p className="text-sm">📍 {store.address} {store.map_url && <a href={store.map_url} target="_blank" rel="noopener noreferrer" className="font-bold text-blue-600 underline">{t('pk.openMap')}</a>}</p>}
              <p className="text-xl font-extrabold">{t('tq.payTotal')}: {fmt(dStatus.total)}</p>
              <button type="button" onClick={dAgain} className={ui.btnPrimary}>{t('tq.again')}</button></>
          ) : (
            <>
              <p className="text-5xl">{ds === 'delivered' ? '🎉' : ds === 'failed' ? '⚠️' : ds === 'dispatched' ? '🛵' : '👨‍🍳'}</p>
              <h1 className="text-lg font-extrabold">{ds === 'delivered' ? t('dl.cDelivered') : ds === 'failed' ? t('dl.cFailed') : ds === 'dispatched' ? t('dl.cOnWay') : t('dl.cPreparing')}</h1>
              {dStatus.eta_min && ds !== 'delivered' && ds !== 'failed' && <p className={`text-sm ${ui.muted}`}>{t('dl.cEta', { n: dStatus.eta_min })}</p>}
              <p className="text-xl font-extrabold">{t('tq.payTotal')}: {fmt(dStatus.total)}</p>
              <p className={`text-xs ${ui.muted}`}>{t('dl.fee')}: {dStatus.fee > 0 ? fmt(dStatus.fee) : t('dl.free')}</p>
              <p className="text-sm font-semibold">{t('tq.payCashTitle')}</p>
              {(ds === 'delivered' || ds === 'failed') && <button type="button" onClick={dAgain} className={ui.btnPrimary}>{t('tq.again')}</button>}
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="vx-theme min-h-dvh bg-[var(--sbg)] pb-28 dark:bg-[var(--sbgd)]"
      style={{ ['--sa' as string]: th.a, ['--sh' as string]: th.h, ['--sbg' as string]: th.bg, ['--sbgd' as string]: th.bgd }}>
      <style>{`.vx-theme .bg-blue-600{background-color:var(--sa)}.vx-theme .hover\\:bg-blue-500:hover{background-color:var(--sh)}
.vx-theme .border-blue-500,.vx-theme .border-blue-600{border-color:var(--sa)}
.vx-theme .bg-blue-50,.vx-theme [class*="dark:bg-blue-500/10"]{background-color:color-mix(in srgb,var(--sa) 12%,transparent)}
.vx-theme .text-blue-600,.vx-theme [class*="dark:text-blue-400"]{color:var(--sa)}`}</style>
      {/* Encabezado de la tienda */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt="" className="h-11 w-11 rounded-xl object-cover" /> : <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-xl text-white">🏪</span>}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold">{store.name}</h1>
            {store.description && <p className={`truncate text-xs ${ui.muted}`}>{store.description}</p>}
          </div>
          <button type="button" onClick={shareStore} aria-label={t('store.shareBtn')} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-300 cursor-pointer dark:border-slate-700">🔗</button>
          <ThemeToggle />
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-3">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('shop2.search')} className={ui.input} />
        </div>
      </header>

      {/* Catálogo */}
      <section className="mx-auto max-w-6xl px-4 py-5">
        {store.products.length === 0 ? (
          <p className={`py-10 text-center ${ui.muted}`}>{t('shop2.empty')}</p>
        ) : list.length === 0 ? (
          <p className={`py-10 text-center ${ui.muted}`}>{t('pos.noResults')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {list.map((p) => {
              const src = storeThumbUrl(p.photo);
              const full = storeImageUrl(p.photo);
              const vars = p.model ? (store.products ?? []).filter((x) => x.model === p.model) : [];
              const sizes = [...new Set<string>(vars.map((x) => x.size).filter((x): x is string => !!x))];
              const colors = [...new Set<string>(vars.map((x) => x.color).filter((x): x is string => !!x))];
              const cur = sel[p.model ?? ''] ?? {};
              const size = cur.size ?? (sizes.length === 1 ? sizes[0] : undefined);
              const color = cur.color ?? (colors.length === 1 ? colors[0] : undefined);
              const chosen = p.model ? vars.find((x) => (!sizes.length || x.size === size) && (!colors.length || x.color === color)) : p;
              const qty = chosen ? cart.find((l) => l.p.id === chosen.id)?.qty ?? 0 : 0;
              const from = p.model ? Math.min(...vars.map((x) => Number(x.price))) : p.price;
              const chip = (on: boolean, ok: boolean) => `rounded-lg border px-2.5 py-1 text-xs font-bold cursor-pointer disabled:cursor-not-allowed disabled:line-through disabled:opacity-40 ${on ? 'border-blue-500 bg-blue-50 text-blue-600 dark:text-blue-400' : 'border-slate-300 dark:border-slate-700'} ${ok ? '' : 'opacity-40'}`;
              return (
                <article key={p.id} className={`flex flex-col overflow-hidden rounded-2xl ${ui.card}`}>
                  <div className="relative aspect-square overflow-hidden bg-slate-100 dark:bg-slate-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {src ? <img src={src} alt={p.name} loading="lazy" decoding="async" onError={(e) => { if (full && e.currentTarget.src !== full) e.currentTarget.src = full; }} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-4xl">{p.type === 'service' ? '🛠️' : '📦'}</span>}
                    <span className={`absolute inset-x-0 bottom-0 py-1 text-center text-xs font-bold text-white ${p.available ? 'bg-emerald-600/85' : 'bg-black/60'}`}>{p.available ? `✓ ${t('shop2.inStock')}` : t('pos.out')}</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <p className="line-clamp-2 text-sm font-semibold">{p.name}</p>
                    <p className="text-lg font-extrabold">{p.model ? `${t('shop2.from')} ` : ''}{fmt(from)}</p>
                    {sizes.length > 0 && (
                      <div>
                        <p className={`mb-1 text-[11px] font-semibold ${ui.muted}`}>{t('shop2.size')}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {sizes.map((z) => {
                            const ok = vars.some((x) => x.size === z && x.available && (!color || x.color === color));
                            return <button key={z} type="button" disabled={!ok} onClick={() => setSel((m) => ({ ...m, [p.model!]: { ...cur, size: z } }))} className={chip(size === z, ok)}>{z}</button>;
                          })}
                        </div>
                      </div>
                    )}
                    {colors.length > 0 && !(colors.length === 1 && /todos/i.test(colors[0])) && (
                      <div>
                        <p className={`mb-1 text-[11px] font-semibold ${ui.muted}`}>{t('shop2.color')}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {colors.map((c) => {
                            const ok = vars.some((x) => x.color === c && x.available && (!size || x.size === size));
                            return <button key={c} type="button" disabled={!ok} onClick={() => setSel((m) => ({ ...m, [p.model!]: { ...cur, color: c } }))} className={chip(color === c, ok)}>{c}</button>;
                          })}
                        </div>
                      </div>
                    )}
                    <div className="mt-auto">
                      {qty > 0 && chosen ? (
                        <div className="flex items-center justify-between rounded-xl border border-blue-500">
                          <button type="button" onClick={() => change(chosen.id, -1)} className="h-9 w-10 text-lg font-bold cursor-pointer">−</button>
                          <span className="font-bold">{qty}</span>
                          <button type="button" disabled={!chosen.available} onClick={() => add(chosen)} className="h-9 w-10 text-lg font-bold cursor-pointer disabled:opacity-40">+</button>
                        </div>
                      ) : (
                        <button type="button" disabled={!chosen || !chosen.available} onClick={() => chosen && add(chosen)} className={`${ui.btnPrimary} w-full !py-2`}>
                          {p.model && !chosen ? t('shop2.pickVariant') : t('shop2.select')}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <p className={`mt-10 text-center text-xs ${ui.muted}`}>
          {t('shop2.poweredBy')} <Link href="/" className="font-bold text-blue-600 dark:text-blue-400">Veltrix</Link>
        </p>
      </section>

      {/* Barra del carrito */}
      {cart.length > 0 && !open && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <button type="button" onClick={() => setOpen(true)} className={`${ui.btnPrimary} mx-auto w-full max-w-xl justify-between py-3 text-base`}>
            <span>🛒 {t('shop2.cart')} · {units}</span><span>{fmt(total)}</span>
          </button>
        </div>
      )}

      {/* Carrito y pedido */}
      {open && (
        <div className="fixed inset-x-0 top-0 z-40 h-dvh">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[90dvh] max-w-xl space-y-4 overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">🛒 {t('shop2.cart')}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t('pos.close')} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 cursor-pointer dark:border-slate-700">✕</button>
            </div>
            <ul className="space-y-2">
              {cart.map((l) => (
                <li key={l.p.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{l.p.name}</span>
                  <button type="button" onClick={() => change(l.p.id, -1)} className="h-8 w-8 rounded-lg border border-slate-300 font-bold cursor-pointer dark:border-slate-700">−</button>
                  <span className="w-6 text-center font-bold">{l.qty}</span>
                  <button type="button" onClick={() => change(l.p.id, 1)} className="h-8 w-8 rounded-lg border border-slate-300 font-bold cursor-pointer dark:border-slate-700">+</button>
                  <span className="w-20 text-right text-sm font-bold">{fmt(l.qty * Number(l.p.price))}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
              <span className="font-semibold">{t('pos.total')}</span>
              <span className="text-2xl font-extrabold">{fmt(total)}</span>
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t('shop2.yourName')} className={ui.input} />
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} placeholder={t('shop2.noteHint')} className={ui.input} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={20} placeholder={t('dl.phone')} className={ui.input} />
            <div>
              <p className={ui.label}>{t('pk.methodLabel')}</p>
              <div className="grid grid-cols-2 gap-2">
                {(['pickup', 'delivery'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMethod(m)} className={`rounded-xl border-2 py-2.5 text-sm font-bold cursor-pointer ${method === m ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-300 dark:border-slate-700'}`}>
                    {m === 'pickup' ? `🏬 ${t('pk.pickup')}` : `🛵 ${t('pk.delivery')}`}
                  </button>
                ))}
              </div>
            </div>
            {method === 'pickup' ? (
              (store.address || store.map_url) && (
                <p className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">📍 {store.address}{' '}
                  {store.map_url && <a href={store.map_url} target="_blank" rel="noopener noreferrer" className="font-bold text-blue-600 underline dark:text-blue-400">{t('pk.openMap')}</a>}</p>
              )
            ) : (
              <div className="space-y-2">
                <p className={`text-xs ${ui.muted}`}>{t('pk.deliveryHint')}</p>
                <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} placeholder={t('pk.address')} className={ui.input} />
                <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={150} placeholder={t('pk.reference')} className={ui.input} />
                <button type="button" onClick={useMyLocation} className={`${ui.btnGhost} w-full !py-2 text-sm`}>{coords ? `✅ ${t('dl.locationSet')}` : `📍 ${t('dl.useLocation')}`}</button>
              </div>
            )}
            <div>
              <p className={ui.label}>{t('pk.payLabel')}</p>
              <div className="grid grid-cols-2 gap-2">
                {(['cash', 'qr'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setPay(m)} className={`rounded-xl border-2 py-2.5 text-sm font-bold cursor-pointer ${pay === m ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-300 dark:border-slate-700'}`}>
                    {m === 'qr' ? `📲 ${t('tq.payQr')}` : `💵 ${t('tq.payCash')}`}
                  </button>
                ))}
              </div>
            </div>
            {dErr && <p className="rounded-xl border border-red-300 bg-red-50 p-2 text-sm font-semibold text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">{dErr}</p>}
            <button type="button" disabled={dBusy || name.trim().length < 2 || phone.trim().length < 6 || (method === 'delivery' && address.trim().length < 5 && !coords)} onClick={sendOrder}
              className={`${ui.btnPrimary} w-full py-3 text-base`}>
              ✅ {dBusy ? t('common.wait') : t('pk.sendOrder')}
            </button>
            <button type="button" onClick={() => setCart([])} className={`w-full text-xs font-semibold ${ui.muted} hover:underline cursor-pointer`}>{t('pos.clear')}</button>
          </div>
        </div>
      )}
    </main>
  );
}
