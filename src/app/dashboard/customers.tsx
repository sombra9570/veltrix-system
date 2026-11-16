'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase, rpc } from '../../lib/supabase';
import { Card } from './shell';
import { ui } from '../site-header';
import { usePaged, ShowMore } from './paged';
import { useT } from '../i18n';
import type { DictKey } from '../i18n/es';
import { money, parseAmount } from './format';
import { compressImage, extFor } from './image';
import { PhotoPicker } from './photo-picker';

type Branch = { id: string; name: string; company: string; currency: string };
type Row = {
  id: string; name: string; tax_id: string | null; phone: string | null;
  credit_limit: number; credit_status: 'approved' | 'blocked' | 'pending_approval';
  balance: number; overdue: number; has_doc: boolean;
};
type Detail = {
  customer: {
    id: string; org_id: string; branch_id: string; name: string; tax_id: string | null; phone: string | null;
    address: string | null; notes: string | null; credit_limit: number; credit_status: Row['credit_status'];
    doc_photo_path: string | null; photo_path: string | null; doc_consent_at: string | null;
    balance: number; overdue: number; currency: string; can_edit_credit: boolean;
  };
  credits: {
    order_id: string; at: string; total: number; approval: string;
    installments: { number: number; due: string; amount: number; paid: number }[];
  }[];
  payments: { at: string; amount: number; method: string }[];
};
type Approvals = {
  orders: { order_id: string; customer: string; branch: string; total: number; currency: string; vendor: string; limit: number; balance: number; installments: number }[];
  customers: { customer_id: string; customer: string; branch: string; limit: number; currency: string }[];
};
type Form = {
  id: string | null; name: string; tax_id: string; phone: string; address: string; limit: string; notes: string;
  doc: File | null; photo: File | null; consent: boolean;
};

const blank: Form = { id: null, name: '', tax_id: '', phone: '', address: '', limit: '0', notes: '', doc: null, photo: null, consent: false };
const BUCKET = 'customer-files';
const okBox = 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
const errBox = 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';
const pill = 'rounded-full px-2.5 py-0.5 text-[11px] font-bold';

function custError(msg: string, t: (k: DictKey) => string) {
  if (msg.includes('PHOTO_UNREADABLE')) return t('photo.unreadable');
  if (msg.includes('PHOTO_TOO_BIG')) return t('photo.tooBig');
  if (/consentimiento/i.test(msg)) return t('cust.needConsent');
  if (/row-level security|storage/i.test(msg)) return t('cust.uploadFailed');
  if (/suspendida/i.test(msg)) return t('err.suspended');
  return t('err.generic');
}

/** Clientes y crédito: lo usan el vendedor, el supervisor y el dueño. */
export function CustomersScreen() {
  const { t, lang } = useT();
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [branchId, setBranchId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [approvals, setApprovals] = useState<Approvals | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    rpc<Branch[]>('seller_branches')
      .then((b) => { setBranches(b ?? []); if (b?.length) setBranchId(b[0].id); })
      .catch(() => setBranches([]));
  }, []);

  const branch = branches?.find((b) => b.id === branchId);
  const fmt = (n: number, cur?: string) => money(Number(n), cur ?? branch?.currency ?? 'USD', lang);

  const load = useCallback(async () => {
    if (!branchId) return;
    try {
      const [list, ap] = await Promise.all([
        rpc<Row[]>('customers_list', { p_branch: branchId, p_search: query || null }),
        rpc<Approvals>('credit_approvals'),
      ]);
      setRows(list ?? []);
      setApprovals(ap);
    } catch { /* sin conexión */ }
  }, [branchId, query]);

  useEffect(() => {
    const id = setTimeout(load, 250);   // espera a que termine de escribir
    return () => clearTimeout(id);
  }, [load]);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 6000);
  };

  const open = async (id: string) => {
    setDocUrl(null);
    try { setDetail(await rpc<Detail>('customer_detail', { p_customer: id })); } catch { flash(false, t('err.generic')); }
  };

  const showDoc = async () => {
    if (!detail?.customer.doc_photo_path) return;
    // enlace temporal de 60 segundos: la foto nunca queda pública
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(detail.customer.doc_photo_path, 60);
    setDocUrl(data?.signedUrl ?? null);
  };

  const upload = async (orgId: string, customerId: string, file: File, kind: 'doc' | 'photo') => {
    const blob = await compressImage(file);
    const path = `${orgId}/${customerId}/${kind}-${Date.now()}.${extFor(blob)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) throw new Error(error.message);
    return path;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !branchId) return;
    const limit = parseAmount(form.limit || '0');
    if (!form.name.trim() || Number.isNaN(limit) || limit < 0) return flash(false, t('cash.invalidAmount'));
    if (form.doc && !form.consent) return flash(false, t('cust.needConsent'));
    setBusy(true);
    try {
      const id = await rpc<string>('save_customer', {
        p_id: form.id, p_branch: branchId, p_name: form.name, p_tax_id: form.tax_id, p_phone: form.phone,
        p_address: form.address, p_credit_limit: limit, p_notes: form.notes,
      });
      if (form.doc || form.photo) {
        const d = await rpc<Detail>('customer_detail', { p_customer: id });
        const docPath = form.doc ? await upload(d.customer.org_id, id, form.doc, 'doc') : null;
        const photoPath = form.photo ? await upload(d.customer.org_id, id, form.photo, 'photo') : null;
        await rpc('set_customer_files', { p_customer: id, p_doc_path: docPath, p_photo_path: photoPath, p_consent: form.consent });
      }
      flash(true, t('cust.saved'));
      setForm(null);
      await load();
      await open(id);
    } catch (err) {
      flash(false, custError((err as Error).message, t));
    } finally {
      setBusy(false);
    }
  };

  const decideOrder = async (orderId: string, ok: boolean) => {
    try {
      await rpc('decide_credit', { p_order: orderId, p_approve: ok, p_reason: ok ? null : t('cust.rejected') });
      await load();
    } catch { flash(false, t('err.generic')); }
  };
  const decideCustomer = async (id: string, ok: boolean) => {
    try {
      await rpc('decide_customer_credit', { p_customer: id, p_approve: ok });
      await load();
    } catch { flash(false, t('err.generic')); }
  };

  const paged = usePaged(rows, 30, rows);
  if (branches === null) return <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>;
  if (branches.length === 0) return <Card><p className={`text-sm ${ui.muted}`}>{t('pos.noBranches')}</p></Card>;

  const statusPill = (r: { credit_status: Row['credit_status']; overdue: number }) =>
    r.overdue > 0 ? <span className={`${pill} bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300`}>{t('cust.overdue')}</span>
      : r.credit_status === 'pending_approval' ? <span className={`${pill} bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300`}>{t('cust.pendingApproval')}</span>
        : r.credit_status === 'blocked' ? <span className={`${pill} bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300`}>{t('cust.blocked')}</span>
          : null;

  const pendingCount = (approvals?.orders.length ?? 0) + (approvals?.customers.length ?? 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold sm:text-2xl">🤝 {t('cust.title')}</h1>
          <p className={`text-sm ${ui.muted}`}>{t('cust.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2 max-sm:w-full">
          {branches.length > 1 && (
            <select aria-label={t('pos.branch')} value={branchId} onChange={(e) => { setBranchId(e.target.value); setDetail(null); }} className={`${ui.input} !w-auto max-sm:!w-full`}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.company} · {b.name}</option>)}
            </select>
          )}
          <button type="button" onClick={() => { setForm({ ...blank }); setDetail(null); }} className={`${ui.btnPrimary} max-sm:w-full`}>+ {t('cust.add')}</button>
        </div>
      </div>

      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? okBox : errBox}`}>{msg.text}</p>}

      {/* Aprobaciones pendientes (solo dueño / supervisor las recibe) */}
      {pendingCount > 0 && (
        <Card className="space-y-3 border-amber-300 dark:border-amber-500/30">
          <h2 className="font-bold">⏳ {t('cust.approvalsTitle')} ({pendingCount})</h2>
          {approvals!.orders.map((o) => (
            <div key={o.order_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <div className="min-w-0 flex-1 basis-56">
                <p className="font-semibold">{o.customer} · {fmt(o.total, o.currency)}</p>
                <p className={`text-xs ${ui.muted}`}>
                  {t('cust.creditSaleBy', { name: o.vendor, n: o.installments })} · {t('cust.limitBalance', { limit: fmt(o.limit, o.currency), balance: fmt(o.balance, o.currency) })}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => decideOrder(o.order_id, false)} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>{t('cust.reject')}</button>
                <button type="button" onClick={() => decideOrder(o.order_id, true)} className={`${ui.btnPrimary} !px-3 !py-1.5 text-xs`}>{t('cust.approve')}</button>
              </div>
            </div>
          ))}
          {approvals!.customers.map((c) => (
            <div key={c.customer_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <div className="min-w-0 flex-1 basis-56">
                <p className="font-semibold">{c.customer}</p>
                <p className={`text-xs ${ui.muted}`}>{t('cust.limitRequest', { limit: fmt(c.limit, c.currency) })} · {c.branch}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => decideCustomer(c.customer_id, false)} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>{t('cust.reject')}</button>
                <button type="button" onClick={() => decideCustomer(c.customer_id, true)} className={`${ui.btnPrimary} !px-3 !py-1.5 text-xs`}>{t('cust.approve')}</button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {form && (
        <Card>
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <h2 className="font-bold sm:col-span-2">{form.id ? t('cust.editTitle') : t('cust.add')}</h2>
            <div className="sm:col-span-2">
              <label className={ui.label}>{t('cust.name')}</label>
              <input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={ui.input} />
            </div>
            <div>
              <label className={ui.label}>{t('cust.doc')}</label>
              <input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} className={ui.input} />
            </div>
            <div>
              <label className={ui.label}>{t('cust.phone')}</label>
              <input type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={ui.input} />
            </div>
            <div className="sm:col-span-2">
              <label className={ui.label}>{t('cust.address')}</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={ui.input} />
            </div>
            <div>
              <label className={ui.label}>{t('cust.limit')} ({branch?.currency})</label>
              <input inputMode="decimal" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} className={ui.input} />
              <p className={`mt-1 text-xs ${ui.muted}`}>{t('cust.limitHint')}</p>
            </div>
            <div>
              <label className={ui.label}>{t('cust.notes')}</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={ui.input} />
            </div>

            {/* Fotos: se comprimen en el teléfono y van a un almacenamiento privado */}
            <div className="space-y-2 rounded-xl border border-slate-300 p-3 dark:border-slate-700">
              <p className="text-sm font-semibold">🪪 {t('cust.docPhoto')}</p>
              <PhotoPicker value={form.doc} onChange={(f) => setForm({ ...form, doc: f })} />
              <label className="flex cursor-pointer items-start gap-2 text-xs">
                <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="mt-0.5 h-4 w-4" />
                <span>{t('cust.consent')}</span>
              </label>
              <p className={`text-[11px] ${ui.muted}`}>🔒 {t('cust.privateHint')}</p>
            </div>
            <div className="space-y-2 rounded-xl border border-slate-300 p-3 dark:border-slate-700">
              <p className="text-sm font-semibold">🙂 {t('cust.photo')}</p>
              <PhotoPicker value={form.photo} onChange={(f) => setForm({ ...form, photo: f })} facing="user" />
            </div>

            <div className="flex gap-2 sm:col-span-2 sm:justify-end">
              <button type="button" onClick={() => setForm(null)} className={`${ui.btnGhost} max-sm:flex-1`}>{t('prod.cancel')}</button>
              <button type="submit" disabled={busy} className={`${ui.btnPrimary} max-sm:flex-1`}>{busy ? t('common.wait') : t('prod.save')}</button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Lista */}
        <div className={`space-y-3 lg:col-span-2 ${detail ? 'max-lg:hidden' : ''}`}>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('cust.search')} className={ui.input} />
          <Card className="!p-0 overflow-hidden">
            {rows.length === 0 ? (
              <p className={`p-5 text-sm ${ui.muted}`}>{t('cust.empty')}</p>
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {paged.visible.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => open(r.id)}
                      className={`flex w-full items-center gap-3 p-4 text-left transition cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 ${detail?.customer.id === r.id ? 'bg-blue-50 dark:bg-blue-500/10' : ''}`}>
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-100 font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                        {r.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{r.name}</p>
                        <p className={`truncate text-xs ${ui.muted}`}>{[r.tax_id, r.phone].filter(Boolean).join(' · ') || '—'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{fmt(r.balance)}</p>
                        {statusPill(r)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <ShowMore rest={paged.rest} onClick={paged.more} />
        </div>

        {/* Ficha */}
        {detail && (
          <div className="space-y-4 lg:col-span-3">
            <Card className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold">{detail.customer.name}</h2>
                  <p className={`text-sm ${ui.muted}`}>{[detail.customer.tax_id, detail.customer.phone, detail.customer.address].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}
                    onClick={() => setForm({ ...blank, id: detail.customer.id, name: detail.customer.name, tax_id: detail.customer.tax_id ?? '', phone: detail.customer.phone ?? '', address: detail.customer.address ?? '', limit: String(detail.customer.credit_limit), notes: detail.customer.notes ?? '' })}>
                    {t('prod.edit')}
                  </button>
                  <button type="button" onClick={() => setDetail(null)} aria-label={t('pos.close')} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 cursor-pointer dark:border-slate-700">✕</button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                  <p className={`text-[11px] font-semibold uppercase ${ui.muted}`}>{t('cust.balance')}</p>
                  <p className="font-extrabold">{fmt(detail.customer.balance, detail.customer.currency)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                  <p className={`text-[11px] font-semibold uppercase ${ui.muted}`}>{t('cust.overdue')}</p>
                  <p className={`font-extrabold ${detail.customer.overdue > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{fmt(detail.customer.overdue, detail.customer.currency)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                  <p className={`text-[11px] font-semibold uppercase ${ui.muted}`}>{t('cust.limit')}</p>
                  <p className="font-extrabold">{fmt(detail.customer.credit_limit, detail.customer.currency)}</p>
                </div>
              </div>
              {statusPill(detail.customer)}

              {detail.customer.doc_photo_path ? (
                docUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={docUrl} alt={t('cust.docPhoto')} className="max-h-80 w-full rounded-xl object-contain" />
                ) : (
                  <button type="button" onClick={showDoc} className={`${ui.btnGhost} w-full`}>🪪 {t('cust.viewDoc')}</button>
                )
              ) : (
                <p className={`text-xs ${ui.muted}`}>🪪 {t('cust.noDoc')}</p>
              )}
            </Card>

            <Card className="space-y-3">
              <h3 className="font-bold">{t('cust.credits')}</h3>
              {detail.credits.length === 0 ? (
                <p className={`text-sm ${ui.muted}`}>{t('cust.noCredits')}</p>
              ) : detail.credits.map((c) => (
                <div key={c.order_id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{fmt(c.total, detail.customer.currency)} · {new Date(c.at).toLocaleDateString(lang)}</p>
                    {c.approval === 'pending_supervisor' && <span className={`${pill} bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300`}>{t('cust.pendingApproval')}</span>}
                    {c.approval === 'rejected' && <span className={`${pill} bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300`}>{t('cust.rejected')}</span>}
                  </div>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[22rem] text-sm">
                      <thead className={`text-left text-xs ${ui.muted}`}>
                        <tr><th className="py-1">#</th><th>{t('cust.due')}</th><th className="text-right">{t('cash.amount')}</th><th className="text-right">{t('cust.paid')}</th></tr>
                      </thead>
                      <tbody>
                        {c.installments.map((i) => {
                          const done = Number(i.paid) >= Number(i.amount);
                          const late = !done && new Date(i.due) < new Date(new Date().toDateString());
                          return (
                            <tr key={i.number} className="border-t border-slate-100 dark:border-slate-800">
                              <td className="py-1.5">{i.number}</td>
                              <td className={late ? 'font-semibold text-red-600 dark:text-red-400' : ''}>{new Date(i.due + 'T12:00:00').toLocaleDateString(lang)}</td>
                              <td className="text-right">{fmt(i.amount, detail.customer.currency)}</td>
                              <td className="text-right">{done ? '✅' : fmt(i.paid, detail.customer.currency)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </Card>

            {detail.payments.length > 0 && (
              <Card className="space-y-2">
                <h3 className="font-bold">{t('cust.payments')}</h3>
                <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                  {detail.payments.map((p, k) => (
                    <li key={k} className="flex justify-between py-1.5">
                      <span className={ui.muted}>{new Date(p.at).toLocaleDateString(lang)} · {t(`cash.m.${p.method}` as DictKey)}</span>
                      <span className={`font-semibold ${p.amount < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{fmt(p.amount, detail.customer.currency)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
