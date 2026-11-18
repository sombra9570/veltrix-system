'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { useT } from '../../i18n';
import { ui } from '../../site-header';
import { storeImageUrl } from '../../dashboard/image';
import { Spinner } from '../../spinner';

type Product = { id: string; name: string; price: number; type: string; description: string | null; photo: string | null; unit: string; available: boolean };
type Menu = { table: string; name: string; logo: string | null; currency: string; products: Product[] };
type Line = { p: Product; qty: number };
type Status = { status: 'pending' | 'accepted' | 'rejected'; pay_method: 'qr' | 'cash' | null; reject_reason: string | null; total: number; has_qr: boolean; qr_note: string | null };

/** Menú de la mesa: el cliente escanea el QR, arma su pedido y lo envía a caja. No necesita cuenta. */
export function TableMenu({ token }: { token: string }) {
  const { t, lang } = useT();
  const [menu, setMenu] = useState<Menu | null | undefined>(undefined);
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<Line[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [pay, setPay] = useState<'qr' | 'cash'>('cash');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reqId, setReqId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const REQ_KEY = `vx_mesa_req_${token}`;

  useEffect(() => {
    supabase.rpc('public_table_menu', { p_token: token }).then(({ data }) => setMenu((data as Menu | null) ?? null));
    try { setReqId(localStorage.getItem(REQ_KEY)); } catch { /* */ }
  }, [token, REQ_KEY]);

  const fmt = useCallback((n: number) => {
    try { return new Intl.NumberFormat(lang, { style: 'currency', currency: menu?.currency ?? 'USD' }).format(n); }
    catch { return `${menu?.currency ?? ''} ${n.toFixed(2)}`; }
  }, [lang, menu?.currency]);

  // Mientras hay un pedido en curso, consulta cada pocos segundos cómo va
  useEffect(() => {
    if (!reqId) return;
    let stop = false;
    const tick = async () => {
      const { data } = await supabase.rpc('public_table_status', { p_token: token, p_request: reqId });
      if (stop) return;
      const s = data as Status | null;
      if (!s) { try { localStorage.removeItem(REQ_KEY); } catch { /* */ } setReqId(null); return; }
      setStatus(s);
    };
    tick();
    const id = setInterval(() => { if (document.visibilityState === 'visible') tick(); }, 5000);
    return () => { stop = true; clearInterval(id); };
  }, [reqId, token, REQ_KEY]);

  // Si caja pidió pagar por QR, trae la imagen del QR del negocio
  useEffect(() => {
    if (status?.status !== 'accepted' || status.pay_method !== 'qr' || !status.has_qr || !reqId || qrUrl) return;
    fetch(`/api/mesa/qr?token=${encodeURIComponent(token)}&request=${encodeURIComponent(reqId)}`)
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.url) setQrUrl(j.url); }).catch(() => { /* */ });
  }, [status, reqId, token, qrUrl]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = menu?.products ?? [];
    return s ? all.filter((p) => p.name.toLowerCase().includes(s) || (p.description ?? '').toLowerCase().includes(s)) : all;
  }, [menu, q]);

  const add = (p: Product) => setCart((c) => {
    const ex = c.find((l) => l.p.id === p.id);
    return ex ? c.map((l) => (l.p.id === p.id ? { ...l, qty: Math.min(20, l.qty + 1) } : l)) : [...c, { p, qty: 1 }];
  });
  const change = (id: string, d: number) => setCart((c) => c.map((l) => (l.p.id === id ? { ...l, qty: Math.min(20, l.qty + d) } : l)).filter((l) => l.qty > 0));
  const total = cart.reduce((s, l) => s + l.qty * Number(l.p.price), 0);
  const units = cart.reduce((s, l) => s + l.qty, 0);

  const send = async () => {
    if (!cart.length || busy) return;
    setBusy(true); setErr('');
    const { data, error } = await supabase.rpc('public_table_order', {
      p_token: token, p_items: cart.map((l) => ({ product_id: l.p.id, qty: l.qty })), p_notes: note, p_name: name, p_pay: pay,
    });
    setBusy(false);
    if (error) {
      setErr(/PRODUCT_UNAVAILABLE/.test(error.message) ? t('tq.errUnavailable') : /TOO_MANY/.test(error.message) ? t('tq.errMany') : t('err.generic'));
      return;
    }
    const id = data as string;
    try { localStorage.setItem(REQ_KEY, id); } catch { /* */ }
    setStatus(null); setQrUrl(null); setReqId(id); setCart([]); setOpen(false); setNote('');
  };
  const again = () => { try { localStorage.removeItem(REQ_KEY); } catch { /* */ } setReqId(null); setStatus(null); setQrUrl(null); };

  if (menu === undefined) return <div className="grid min-h-dvh place-items-center bg-slate-50 dark:bg-slate-950"><Spinner /></div>;
  if (menu === null) {
    return (
      <main className="grid min-h-dvh place-items-center bg-slate-50 p-6 text-center dark:bg-slate-950">
        <div><p className="text-5xl">🍽️</p><h1 className="mt-3 text-xl font-bold">{t('tq.invalid')}</h1><Link href="/" className={`${ui.btnGhost} mt-5`}>Veltrix</Link></div>
      </main>
    );
  }

  const logo = storeImageUrl(menu.logo);

  // Pedido enviado: espera, aceptado (con cómo pagar) o rechazado
  if (reqId) {
    return (
      <main className="grid min-h-dvh place-items-center bg-slate-50 p-5 text-center dark:bg-slate-950">
        <div className={`w-full max-w-sm space-y-4 rounded-2xl p-6 ${ui.card}`}>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{menu.name} · {t('tq.table')} {menu.table}</p>
          {!status || status.status === 'pending' ? (
            <>
              <p className="text-5xl">⏳</p>
              <h1 className="text-lg font-extrabold">{t('tq.sent')}</h1>
              <p className={`text-sm ${ui.muted}`}>{t('tq.waiting')}</p>
            </>
          ) : status.status === 'accepted' ? (
            <>
              <p className="text-5xl">✅</p>
              <h1 className="text-lg font-extrabold">{t('tq.accepted')}</h1>
              <p className="text-2xl font-extrabold">{t('tq.payTotal')}: {fmt(status.total)}</p>
              {status.pay_method === 'qr' ? (
                status.has_qr ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">{t('tq.payQrTitle')}</p>
                    {qrUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={qrUrl} alt="QR" className="mx-auto w-56 rounded-xl border border-slate-200" /> : <Spinner />}
                    {status.qr_note && <p className={`text-xs ${ui.muted}`}>{status.qr_note}</p>}
                  </div>
                ) : <p className="text-sm font-semibold">{t('tq.noQr')}</p>
              ) : <p className="text-sm font-semibold">{t('tq.payCashTitle')}</p>}
              <button type="button" onClick={again} className={ui.btnPrimary}>{t('tq.again')}</button>
            </>
          ) : (
            <>
              <p className="text-5xl">🙏</p>
              <h1 className="text-lg font-extrabold">{t('tq.rejected')}</h1>
              {status.reject_reason && <p className={`text-sm ${ui.muted}`}>{status.reject_reason}</p>}
              <button type="button" onClick={again} className={ui.btnPrimary}>{t('tq.again')}</button>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-slate-50 pb-28 dark:bg-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt="" className="h-11 w-11 rounded-xl object-cover" /> : <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-xl text-white">🍽️</span>}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold">{menu.name}</h1>
            <p className={`text-xs ${ui.muted}`}>🪑 {t('tq.table')} {menu.table}</p>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-3">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('shop2.search')} className={ui.input} />
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-5">
        {menu.products.length === 0 ? <p className={`py-10 text-center ${ui.muted}`}>{t('shop2.empty')}</p> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {list.map((p) => {
              const src = storeImageUrl(p.photo);
              const qty = cart.find((l) => l.p.id === p.id)?.qty ?? 0;
              return (
                <article key={p.id} className={`flex flex-col overflow-hidden rounded-2xl ${ui.card}`}>
                  <div className="relative aspect-square bg-slate-100 dark:bg-slate-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {src ? <img src={src} alt={p.name} loading="lazy" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-4xl">🍴</span>}
                    {!p.available && <span className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-xs font-bold text-white">{t('pos.out')}</span>}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <p className="line-clamp-2 text-sm font-semibold">{p.name}</p>
                    {p.description && <p className={`line-clamp-2 text-xs ${ui.muted}`}>{p.description}</p>}
                    <p className="mt-auto text-lg font-extrabold">{fmt(p.price)}</p>
                    {qty > 0 ? (
                      <div className="flex items-center justify-between rounded-xl border border-blue-500">
                        <button type="button" onClick={() => change(p.id, -1)} className="h-9 w-10 text-lg font-bold cursor-pointer">−</button>
                        <span className="font-bold">{qty}</span>
                        <button type="button" onClick={() => change(p.id, 1)} className="h-9 w-10 text-lg font-bold cursor-pointer">+</button>
                      </div>
                    ) : (
                      <button type="button" disabled={!p.available} onClick={() => add(p)} className={`${ui.btnPrimary} !py-2`}>{t('shop2.add')}</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <p className={`mt-10 text-center text-xs ${ui.muted}`}>{t('shop2.poweredBy')} <Link href="/" className="font-bold text-blue-600 dark:text-blue-400">Veltrix</Link></p>
      </section>

      {cart.length > 0 && !open && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <button type="button" onClick={() => setOpen(true)} className={`${ui.btnPrimary} mx-auto flex w-full max-w-lg justify-between`}>
            <span>🛒 {t('shop2.cart')} · {units}</span><span>{fmt(total)}</span>
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/50 sm:items-center sm:justify-center" onClick={() => setOpen(false)}>
          <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-3xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-extrabold">🛒 {t('shop2.cart')}</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-2xl cursor-pointer" aria-label="×">×</button>
            </div>
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {cart.map((l) => (
                <li key={l.p.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-semibold">{l.p.name}</span>
                  <span className="flex items-center rounded-lg border border-slate-300 dark:border-slate-700">
                    <button type="button" onClick={() => change(l.p.id, -1)} className="h-8 w-8 font-bold cursor-pointer">−</button>
                    <span className="w-6 text-center font-bold">{l.qty}</span>
                    <button type="button" onClick={() => change(l.p.id, 1)} className="h-8 w-8 font-bold cursor-pointer">+</button>
                  </span>
                  <span className="w-20 text-right font-bold">{fmt(l.qty * Number(l.p.price))}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between text-lg font-extrabold"><span>{t('pos.total')}</span><span>{fmt(total)}</span></div>
            <div className="mt-4 space-y-3">
              <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t('tq.yourName')} className={ui.input} />
              <textarea value={note} maxLength={300} rows={2} onChange={(e) => setNote(e.target.value)} placeholder={t('tq.note')} className={ui.input} />
              <div>
                <p className="mb-1 text-sm font-semibold">{t('tq.payPref')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['cash', 'qr'] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setPay(m)}
                      className={`rounded-xl border-2 py-2 text-sm font-bold cursor-pointer ${pay === m ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-300 dark:border-slate-700'}`}>
                      {m === 'qr' ? `📲 ${t('tq.payQr')}` : `💵 ${t('tq.payCash')}`}
                    </button>
                  ))}
                </div>
              </div>
              {err && <p className="rounded-xl border border-red-300 bg-red-50 p-2 text-sm font-semibold text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">{err}</p>}
              <button type="button" disabled={busy} onClick={send} className={`${ui.btnPrimary} w-full`}>{busy ? t('common.wait') : t('tq.send')}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
