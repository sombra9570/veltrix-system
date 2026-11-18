'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import { money, parseAmount } from '../../format';
import { Sheet } from '../../sheet';
import { friendlyError } from '../owner-context';
import { EvidenceFields, EvidenceLog, OutForm, addEvidence, emptyEvidence, uploadEvidencePhoto, type Evidence } from './evidence';
import { photoErrorKey } from '../../photo-picker';
import { useVeltrixAuth } from '../../../auth-system';
import { TransferForm } from './transfer';
import { AccountsCard, PaySheet, useAccounts } from './payments';

type MBranch = { id: string; name: string; company_id: string; company: string; currency: string; company_wide: boolean };
type Item = { id: string; name: string; sku: string; unit: string; type: string; qty: number; min: number; cost: number; price: number; value: number };
type Supplier = { id: string; name: string; phone: string | null; email: string | null; tax_id: string | null; terms: number };
type Overview = {
  currency: string; purchasing: boolean;
  summary: { products: number; value: number; retail_value: number; low: number; out: number };
  items: Item[]; untracked: { id: string; name: string }[]; suppliers: Supplier[];
};
type Movement = { at: string; product: string; unit: string; type: string; qty: number; cost: number; by: string | null; note: string | null };
type Purchase = { id: string; at: string; supplier: string; total: number; doc: string | null; due: string | null; status: string; items: number; paid: number };
type Tab = 'stock' | 'entry' | 'out' | 'transfer' | 'log' | 'moves' | 'suppliers';
type Line = { product_id: string; qty: string; cost: string };

const errBox = 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';
const okBox = 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
/** Número escrito por el usuario, o null si está vacío o no es válido */
const num = (v: string): number | null => {
  if (!v || !v.trim()) return null;
  const n = parseAmount(v);
  return Number.isNaN(n) ? null : n;
};
const emptyLine = (): Line => ({ product_id: '', qty: '', cost: '' });

export default function InventoryPage() {
  const { t, lang } = useT();
  const { session } = useVeltrixAuth();
  const readOnly = session?.role === 'accountant'; // el contador ve existencias y movimientos; no mueve stock
  const [branches, setBranches] = useState<MBranch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [data, setData] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>('stock');
  const [entryEv, setEntryEv] = useState<Evidence>(emptyEvidence());
  const [query, setQuery] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [sel, setSel] = useState<Item | null>(null);
  const [count, setCount] = useState({ qty: '', note: '', min: '' });
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [entry, setEntry] = useState({ supplier: '', doc: '', due: '' });
  const [moves, setMoves] = useState<Movement[] | null>(null);
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [supEdit, setSupEdit] = useState<{ id: string | null; name: string; phone: string; email: string; tax_id: string; terms: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState<Purchase | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const branch = branches.find((b) => b.id === branchId);
  const { accounts, reload: reloadAccounts } = useAccounts(tab === 'suppliers' ? branch?.company_id : undefined);
  const fmt = (n: number) => money(Number(n), data?.currency ?? branch?.currency ?? 'USD', lang);
  const qtyFmt = (n: number) => Number(n).toLocaleString(lang, { maximumFractionDigits: 3 });
  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 6000); };

  useEffect(() => {
    rpc<MBranch[]>(readOnly ? 'reader_branches' : 'manager_branches').then((b) => { setBranches(b ?? []); if (b?.length) setBranchId(b[0].id); }).catch(() => {});
  }, [readOnly]);

  const load = useCallback(async () => {
    if (!branchId) return;
    try { setData(await rpc<Overview>('inv_overview', { p_branch: branchId })); }
    catch (e) { flash(false, friendlyError((e as Error).message, t)); }
  }, [branchId, t]);
  useEffect(() => { setData(null); setMoves(null); setPurchases(null); load(); }, [load]);

  useEffect(() => {
    if (!branchId) return;
    if (tab === 'moves' && moves === null) rpc<Movement[]>('inv_movements', { p_branch: branchId, p_product: null }).then(setMoves).catch(() => setMoves([]));
    if (tab === 'suppliers' && purchases === null) rpc<Purchase[]>('inv_purchases', { p_branch: branchId }).then(setPurchases).catch(() => setPurchases([]));
  }, [tab, branchId, moves, purchases]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.items ?? []).filter((i) =>
      (!onlyLow || Number(i.qty) <= Number(i.min)) && (!q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)));
  }, [data, query, onlyLow]);

  const allProducts = useMemo(() => [
    ...(data?.items ?? []).map((i) => ({ id: i.id, name: i.name, cost: i.cost })),
    ...(data?.untracked ?? []).map((u) => ({ id: u.id, name: u.name, cost: 0 })),
  ].sort((a, b) => a.name.localeCompare(b.name)), [data]);

  const openItem = (i: Item) => { if (readOnly) return; setSel(i); setCount({ qty: String(Number(i.qty)), note: '', min: String(Number(i.min)) }); };

  const saveCount = async () => {
    if (!sel) return;
    const qty = num(count.qty);
    if (qty === null || qty < 0) return;
    setBusy(true);
    try {
      if (qty !== Number(sel.qty)) {
        if (!count.note.trim()) { flash(false, t('inv.noteRequired')); setBusy(false); return; }
        await rpc('inv_adjust', { p_branch: branchId, p_product: sel.id, p_counted: qty, p_note: count.note.trim() });
      }
      const min = num(count.min);
      if (min !== null && min >= 0 && min !== Number(sel.min)) await rpc('inv_set_min', { p_product: sel.id, p_min: min });
      setSel(null); setMoves(null);
      flash(true, t('inv.saved'));
      await load();
    } catch (e) { flash(false, friendlyError((e as Error).message, t)); }
    finally { setBusy(false); }
  };

  const entryTotal = lines.reduce((s, l) => s + (num(l.qty) ?? 0) * (num(l.cost) ?? 0), 0);
  const validLines = lines.filter((l) => l.product_id && (num(l.qty) ?? 0) > 0);

  const saveEntry = async () => {
    if (validLines.length === 0) return;
    setBusy(true);
    try {
      const photoPath = await uploadEvidencePhoto(branchId, 'in', entryEv); // primero la foto: si falla, no se registra nada y se avisa
      await rpc('inv_receive', {
        p_branch: branchId,
        p_supplier: entry.supplier || null,
        p_items: validLines.map((l) => ({ product_id: l.product_id, qty: num(l.qty), cost: num(l.cost) ?? 0 })),
        p_doc_ref: entry.doc.trim() || null,
        p_due_days: entry.supplier && entry.due ? parseInt(entry.due, 10) : null,
      });
      // Constancia de lo recibido (estado + foto opcional); si falla, la entrada igual quedó registrada
      const names = validLines.map((l) => `${num(l.qty)} × ${allProducts.find((x) => x.id === l.product_id)?.name ?? ''}`).join(', ');
      await addEvidence(branchId, 'in', entryEv, photoPath, `${entry.doc.trim() ? entry.doc.trim() + ' · ' : ''}${names}`.slice(0, 300)).catch(() => undefined);
      setEntryEv(emptyEvidence());
      setLines([emptyLine()]); setEntry({ supplier: '', doc: '', due: '' }); setMoves(null); setPurchases(null);
      flash(true, t('inv.entrySaved'));
      setTab('stock');
      await load();
    } catch (e) {
      const m = (e as Error).message;
      flash(false, m.startsWith('PHOTO:') ? t(photoErrorKey(m)) : m.includes('MODULE_PURCHASING') ? t('inv.needPurchasing') : friendlyError(m, t));
    } finally { setBusy(false); }
  };

  const saveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supEdit || !branch) return;
    setBusy(true);
    try {
      await rpc('save_supplier', {
        p_id: supEdit.id, p_company: branch.company_id, p_name: supEdit.name, p_phone: supEdit.phone || null,
        p_email: supEdit.email || null, p_tax_id: supEdit.tax_id || null, p_terms: parseInt(supEdit.terms || '0', 10),
      });
      setSupEdit(null);
      flash(true, t('inv.supplierSaved'));
      await load();
    } catch (err) { flash(false, friendlyError((err as Error).message, t)); }
    finally { setBusy(false); }
  };

  const s = data?.summary;
  const tabs: [Tab, string][] = [['stock', t('inv.tabStock')], ['entry', t('inv.tabEntry')], ['out', t('ev.tabOut')], ['transfer', t('tr.tab')], ['log', t('ev.tabLog')], ['moves', t('inv.tabMoves')], ['suppliers', t('inv.tabSuppliers')]];
  const shownTabs = readOnly ? tabs.filter(([k]) => k === 'stock' || k === 'moves') : tabs;
  const typeLabel = (k: string) => t(`inv.mt.${k}` as 'inv.mt.sale');

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold sm:text-2xl">🗃️ {t('nav.inventory')}</h1>
        <p className={`text-sm ${ui.muted}`}>{t('inv.subtitle')}</p>
      </div>

      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? okBox : errBox}`}>{msg.text}</p>}

      {branches.length > 1 && (
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={ui.input} aria-label={t('pos.branch')}>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.company}</option>)}
        </select>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [t('inv.value'), s && s.value != null ? fmt(s.value) : '🔒', t('inv.productsN', { n: s?.products ?? 0 })],
          [t('inv.retailValue'), s ? fmt(s.retail_value) : '—', ''],
          [t('inv.low'), s ? String(s.low) : '—', ''],
          [t('inv.out'), s ? String(s.out) : '—', ''],
        ].map(([label, value, sub], i) => (
          <Card key={i} className={`!p-3 sm:!p-4 ${i === 2 && Number(s?.low) > 0 ? '!border-amber-300 dark:!border-amber-500/40' : ''} ${i === 3 && Number(s?.out) > 0 ? '!border-red-300 dark:!border-red-500/40' : ''}`}>
            <p className={`text-xs font-semibold ${ui.muted}`}>{label}</p>
            <p className="mt-1 whitespace-nowrap text-sm font-extrabold tracking-tight sm:text-xl">{value}</p>
            {sub && <p className={`text-xs ${ui.muted}`}>{sub}</p>}
          </Card>
        ))}
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:grid sm:grid-cols-7 sm:overflow-visible">
        {shownTabs.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition cursor-pointer sm:text-sm ${tab === k ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* EXISTENCIAS */}
      {tab === 'stock' && (
        <Card className="!p-0 overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-slate-200 p-3 sm:flex-row dark:border-slate-800">
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('inv.search')} className={ui.input} />
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="h-4 w-4" /> {t('inv.onlyLow')}
            </label>
          </div>
          {!data ? <p className={`p-5 text-sm ${ui.muted}`}>{t('common.wait')}</p>
            : items.length === 0 ? <p className={`p-5 text-sm ${ui.muted}`}>{data.items.length === 0 ? t('inv.empty') : t('inv.noMatch')}</p>
            : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {items.map((i) => {
                  const out = Number(i.qty) <= 0;
                  const low = !out && Number(i.qty) <= Number(i.min);
                  return (
                    <li key={i.id}>
                      <button type="button" onClick={() => openItem(i)} className="flex w-full items-center gap-3 p-4 text-start hover:bg-slate-50 cursor-pointer dark:hover:bg-slate-800/50">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{i.name}</p>
                          <p className={`truncate text-xs ${ui.muted}`}>{i.sku}{i.cost != null ? ` · ${t('inv.costEach', { cost: fmt(i.cost) })}` : ''}{Number(i.min) > 0 ? ` · ${t('inv.minN', { n: qtyFmt(i.min) })}` : ''}</p>
                        </div>
                        <div className="shrink-0 text-end">
                          <p className={`text-lg font-extrabold ${out ? 'text-red-600 dark:text-red-400' : low ? 'text-amber-600 dark:text-amber-400' : ''}`}>{qtyFmt(i.qty)} <span className="text-xs font-semibold">{i.unit}</span></p>
                          {i.value != null && <p className={`text-xs ${ui.muted}`}>{fmt(i.value)}</p>}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          {data && data.untracked.length > 0 && (
            <p className={`border-t border-slate-200 p-3 text-xs dark:border-slate-800 ${ui.muted}`}>{t('inv.untrackedHint', { n: data.untracked.length })}</p>
          )}
        </Card>
      )}

      {/* ENTRADA DE MERCADERÍA */}
      {tab === 'entry' && (
        <Card className="space-y-4">
          <div>
            <h2 className="font-bold">{t('inv.entryTitle')}</h2>
            <p className={`text-xs ${ui.muted}`}>{t('inv.entryHint')}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={ui.label}>{t('inv.supplier')}</label>
              <select value={entry.supplier} onChange={(e) => setEntry({ ...entry, supplier: e.target.value })} className={ui.input} disabled={!data?.purchasing}>
                <option value="">{t('inv.noSupplier')}</option>
                {(data?.suppliers ?? []).map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
              </select>
              {data && !data.purchasing && <p className={`mt-1 text-[11px] ${ui.muted}`}>{t('inv.needPurchasing')}</p>}
            </div>
            <div>
              <label className={ui.label}>{t('inv.docRef')}</label>
              <input value={entry.doc} maxLength={120} onChange={(e) => setEntry({ ...entry, doc: e.target.value })} className={ui.input} />
            </div>
            {entry.supplier && (
              <div>
                <label className={ui.label}>{t('inv.dueDays')}</label>
                <input inputMode="numeric" value={entry.due} onChange={(e) => setEntry({ ...entry, due: e.target.value.replace(/\D/g, '') })} placeholder="0" className={ui.input} />
              </div>
            )}
          </div>

          {allProducts.length === 0 ? (
            <p className={`text-sm ${ui.muted}`}>{t('inv.noProducts')}</p>
          ) : (
            <div className="space-y-2">
              <div className={`hidden grid-cols-[1fr_7rem_8rem_2.5rem] gap-2 text-xs font-semibold sm:grid ${ui.muted}`}>
                <span>{t('inv.product')}</span><span>{t('inv.qty')}</span><span>{t('inv.unitCost')}</span><span />
              </div>
              {lines.map((l, k) => (
                <div key={k} className="grid grid-cols-[1fr_1fr_2.5rem] gap-2 rounded-xl border border-slate-200 p-2 sm:grid-cols-[1fr_7rem_8rem_2.5rem] sm:border-0 sm:p-0 dark:border-slate-800">
                  <select value={l.product_id} aria-label={t('inv.product')}
                    onChange={(e) => {
                      const p = allProducts.find((x) => x.id === e.target.value);
                      setLines(lines.map((x, j) => j === k ? { ...x, product_id: e.target.value, cost: x.cost || (p && Number(p.cost) > 0 ? String(Number(p.cost)) : '') } : x));
                    }}
                    className={`${ui.input} col-span-3 sm:col-span-1`}>
                    <option value="">{t('inv.pickProduct')}</option>
                    {allProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input inputMode="decimal" value={l.qty} placeholder={t('inv.qty')} aria-label={t('inv.qty')}
                    onChange={(e) => setLines(lines.map((x, j) => j === k ? { ...x, qty: e.target.value } : x))} className={ui.input} />
                  <input inputMode="decimal" value={l.cost} placeholder={t('inv.unitCost')} aria-label={t('inv.unitCost')}
                    onChange={(e) => setLines(lines.map((x, j) => j === k ? { ...x, cost: e.target.value } : x))} className={ui.input} />
                  <button type="button" onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== k) : [emptyLine()])}
                    aria-label={t('inv.removeLine')} className="grid h-full min-h-10 place-items-center rounded-xl border border-slate-300 cursor-pointer dark:border-slate-700">✕</button>
                </div>
              ))}
              <button type="button" onClick={() => setLines([...lines, emptyLine()])} className={`${ui.btnGhost} w-full !py-2`}>+ {t('inv.addLine')}</button>
            </div>
          )}

          <EvidenceFields value={entryEv} onChange={setEntryEv} />
          <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <p className="text-lg font-extrabold">{t('inv.entryTotal')}: {fmt(entryTotal)}</p>
            <button type="button" disabled={busy || validLines.length === 0} onClick={saveEntry} className={`${ui.btnPrimary} max-sm:w-full`}>
              {busy ? t('common.wait') : t('inv.saveEntry')}
            </button>
          </div>
        </Card>
      )}

      {tab === 'out' && branchId && (
        <OutForm branchId={branchId} items={data?.items ?? []} flash={flash} onDone={() => { setMoves(null); load(); }} />
      )}
      {tab === 'transfer' && branchId && (
        <TransferForm branchId={branchId} items={data?.items ?? []} flash={flash} onDone={() => { setMoves(null); load(); }} />
      )}
      {tab === 'log' && branchId && <EvidenceLog branchId={branchId} />}

      {/* MOVIMIENTOS (KARDEX) */}
      {tab === 'moves' && (
        <Card className="!p-0 overflow-hidden">
          {moves === null ? <p className={`p-5 text-sm ${ui.muted}`}>{t('common.wait')}</p>
            : moves.length === 0 ? <p className={`p-5 text-sm ${ui.muted}`}>{t('inv.noMoves')}</p>
            : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {moves.map((m, k) => (
                  <li key={k} className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{m.product}</p>
                      <p className={`truncate text-xs ${ui.muted}`}>
                        {new Date(m.at).toLocaleString(lang, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {typeLabel(m.type)} · {m.by ?? '—'}{m.note ? ` · ${m.note}` : ''}
                      </p>
                    </div>
                    <p className={`shrink-0 font-extrabold ${Number(m.qty) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {Number(m.qty) > 0 ? '+' : ''}{qtyFmt(m.qty)} {m.unit}
                    </p>
                  </li>
                ))}
              </ul>
            )}
        </Card>
      )}

      {/* PROVEEDORES */}
      {tab === 'suppliers' && (
        <div className="space-y-4">
          {!data?.purchasing && <p className={`rounded-xl border p-3 text-sm ${errBox}`}>{t('inv.needPurchasing')}</p>}
          {data?.purchasing && (
            <>
              <div className="flex justify-end">
                <button type="button" onClick={() => setSupEdit({ id: null, name: '', phone: '', email: '', tax_id: '', terms: '0' })} className={`${ui.btnPrimary} max-sm:w-full`}>+ {t('inv.newSupplier')}</button>
              </div>
              {supEdit && (
                <Card>
                  <form onSubmit={saveSupplier} className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2"><label className={ui.label}>{t('inv.supName')}</label><input required autoFocus maxLength={120} value={supEdit.name} onChange={(e) => setSupEdit({ ...supEdit, name: e.target.value })} className={ui.input} /></div>
                    <div><label className={ui.label}>{t('inv.supPhone')}</label><input inputMode="tel" value={supEdit.phone} onChange={(e) => setSupEdit({ ...supEdit, phone: e.target.value })} className={ui.input} /></div>
                    <div><label className={ui.label}>{t('inv.supEmail')}</label><input type="email" value={supEdit.email} onChange={(e) => setSupEdit({ ...supEdit, email: e.target.value })} className={ui.input} /></div>
                    <div><label className={ui.label}>{t('inv.supTaxId')}</label><input value={supEdit.tax_id} onChange={(e) => setSupEdit({ ...supEdit, tax_id: e.target.value })} className={ui.input} /></div>
                    <div><label className={ui.label}>{t('inv.supTerms')}</label><input inputMode="numeric" value={supEdit.terms} onChange={(e) => setSupEdit({ ...supEdit, terms: e.target.value.replace(/\D/g, '') })} className={ui.input} /></div>
                    <div className="flex gap-2 sm:col-span-2">
                      <button type="button" onClick={() => setSupEdit(null)} className={`${ui.btnGhost} flex-1`}>{t('cash.cancel')}</button>
                      <button type="submit" disabled={busy} className={`${ui.btnPrimary} flex-1`}>{busy ? t('common.wait') : t('prod.save')}</button>
                    </div>
                  </form>
                </Card>
              )}
              <Card className="!p-0 overflow-hidden">
                {(data.suppliers ?? []).length === 0 ? <p className={`p-5 text-sm ${ui.muted}`}>{t('inv.noSuppliers')}</p> : (
                  <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                    {data.suppliers.map((sp) => (
                      <li key={sp.id} className="flex items-center gap-3 p-4">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{sp.name}</p>
                          <p className={`truncate text-xs ${ui.muted}`}>{[sp.phone, sp.email, sp.tax_id].filter(Boolean).join(' · ') || '—'}{Number(sp.terms) > 0 ? ` · ${t('inv.termsN', { n: sp.terms })}` : ''}</p>
                        </div>
                        {sp.phone && <a href={`https://wa.me/${sp.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>WhatsApp</a>}
                        <button type="button" onClick={() => setSupEdit({ id: sp.id, name: sp.name, phone: sp.phone ?? '', email: sp.email ?? '', tax_id: sp.tax_id ?? '', terms: String(sp.terms) })} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>{t('prod.edit')}</button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              {branch && (
                <AccountsCard companyId={branch.company_id} accounts={accounts} reload={reloadAccounts} fmt={fmt} flash={flash}
                  canEdit={session?.role === 'owner'} />
              )}
              <Card className="!p-0 overflow-hidden">
                <h2 className="border-b border-slate-200 p-4 font-bold dark:border-slate-800">{t('inv.purchases')}</h2>
                {purchases === null ? <p className={`p-5 text-sm ${ui.muted}`}>{t('common.wait')}</p>
                  : purchases.length === 0 ? <p className={`p-5 text-sm ${ui.muted}`}>{t('inv.noPurchases')}</p> : (
                  <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                    {purchases.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 p-4">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{p.supplier}{p.doc ? ` · ${p.doc}` : ''}</p>
                          <p className={`truncate text-xs ${ui.muted}`}>
                            {new Date(p.at).toLocaleDateString(lang, { day: '2-digit', month: 'short', year: 'numeric' })} · {t('sales.itemsN', { n: p.items })}
                            {p.due ? ` · ${t('inv.dueOn', { date: new Date(p.due + 'T12:00:00').toLocaleDateString(lang) })}` : ''}
                          </p>
                        </div>
                        <div className="shrink-0 text-end">
                          <p className="font-bold">{fmt(p.total)}</p>
                          {p.status === 'received' && (Number(p.paid) >= Number(p.total)
                            ? <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">✅ {t('pay.paid')}</p>
                            : <button type="button" onClick={() => setPaying(p)} className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer dark:text-blue-400">
                                {t('pay.btn', { amount: fmt(Number(p.total) - Number(p.paid)) })}
                              </button>)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </div>
      )}

      {paying && (
        <PaySheet purchase={paying} accounts={accounts ?? []} currency={data?.currency ?? branch?.currency ?? 'USD'} fmt={fmt} flash={flash}
          onClose={() => setPaying(null)}
          onPaid={() => { setPaying(null); setPurchases(null); reloadAccounts(); }} />
      )}

      {sel && (
        <Sheet onClose={() => setSel(null)} label={t('pos.close')}>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-extrabold">{sel.name}</h2>
              <p className={`text-sm ${ui.muted}`}>{sel.sku} · {t('inv.systemQty', { n: qtyFmt(sel.qty), unit: sel.unit })}</p>
            </div>
            <div>
              <label className={ui.label}>{t('inv.counted')}</label>
              <input inputMode="decimal" autoFocus value={count.qty} onChange={(e) => setCount({ ...count, qty: e.target.value })} className={ui.input} />
            </div>
            {num(count.qty) !== null && num(count.qty) !== Number(sel.qty) && (
              <div>
                <label className={ui.label}>{t('inv.adjustReason')}</label>
                <input value={count.note} maxLength={200} onChange={(e) => setCount({ ...count, note: e.target.value })} placeholder={t('inv.adjustReasonPh')} className={ui.input} />
                <p className={`mt-1 text-xs ${ui.muted}`}>{t('inv.adjustDiff', { n: qtyFmt((num(count.qty) ?? 0) - Number(sel.qty)) })}</p>
              </div>
            )}
            <div>
              <label className={ui.label}>{t('inv.minStock')}</label>
              <input inputMode="decimal" value={count.min} onChange={(e) => setCount({ ...count, min: e.target.value })} className={ui.input} />
              <p className={`mt-1 text-xs ${ui.muted}`}>{t('inv.minHint')}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSel(null)} className={`${ui.btnGhost} flex-1`}>{t('cash.cancel')}</button>
              <button type="button" disabled={busy} onClick={saveCount} className={`${ui.btnPrimary} flex-1`}>{busy ? t('common.wait') : t('prod.save')}</button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
