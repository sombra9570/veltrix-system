'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import type { DictKey } from '../../../i18n/es';
import { parseAmount } from '../../format';
import { Sheet } from '../../sheet';
import { friendlyError } from '../owner-context';

export type Account = { id: string; name: string; type: 'cash' | 'bank' | 'wallet'; currency: string; active: boolean; paid: number };
const TYPES = ['cash', 'bank', 'wallet'] as const;
const icon = { cash: '💵', bank: '🏦', wallet: '📱' } as const;

/** Cuentas de pago de la empresa (caja general, banco, billetera). Crear/editar: solo el administrador. */
export function useAccounts(companyId: string | undefined) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const reload = useCallback(async () => {
    if (!companyId) return;
    try { setAccounts(await rpc<Account[]>('fin_accounts', { p_company: companyId })); } catch { setAccounts([]); }
  }, [companyId]);
  useEffect(() => { setAccounts(null); reload(); }, [reload]);
  return { accounts, reload };
}

export function AccountsCard({ companyId, accounts, reload, fmt, flash, canEdit }: {
  companyId: string; accounts: Account[] | null; reload: () => Promise<void>; fmt: (n: number) => string;
  flash: (ok: boolean, text: string) => void; canEdit: boolean;
}) {
  const { t } = useT();
  const [edit, setEdit] = useState<{ id: string | null; name: string; type: Account['type']; active: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    try {
      await rpc('fin_save_account', { p_id: edit.id, p_company: companyId, p_name: edit.name, p_type: edit.type, p_active: edit.active });
      setEdit(null); flash(true, t('acc.saved')); await reload();
    } catch (err) { flash(false, friendlyError((err as Error).message, t)); }
    finally { setBusy(false); }
  };

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="min-w-0">
          <h2 className="font-bold">{t('acc.title')}</h2>
          <p className={`text-xs ${ui.muted}`}>{t('acc.hint')}</p>
        </div>
        {canEdit && <button type="button" onClick={() => setEdit({ id: null, name: '', type: 'cash', active: true })} className={`${ui.btnGhost} shrink-0 !px-3 !py-1.5 text-xs`}>+ {t('acc.new')}</button>}
      </div>
      {edit && (
        <form onSubmit={save} className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 dark:border-slate-800">
          <div><label className={ui.label}>{t('acc.name')}</label><input required autoFocus maxLength={80} value={edit.name} placeholder={t('acc.namePh')} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={ui.input} /></div>
          <div>
            <label className={ui.label}>{t('acc.type')}</label>
            <select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as Account['type'] })} className={ui.input}>
              {TYPES.map((k) => <option key={k} value={k}>{icon[k]} {t(`acc.t.${k}` as DictKey)}</option>)}
            </select>
          </div>
          {edit.id && (
            <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} className="h-4 w-4" /> {t('acc.active')}
            </label>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" onClick={() => setEdit(null)} className={`${ui.btnGhost} flex-1`}>{t('cash.cancel')}</button>
            <button type="submit" disabled={busy} className={`${ui.btnPrimary} flex-1`}>{busy ? t('common.wait') : t('prod.save')}</button>
          </div>
        </form>
      )}
      {accounts === null ? <p className={`p-5 text-sm ${ui.muted}`}>{t('common.wait')}</p>
        : accounts.length === 0 ? <p className={`p-5 text-sm ${ui.muted}`}>{t('acc.empty')}</p> : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {accounts.map((a) => (
              <li key={a.id} className={`flex items-center gap-3 p-4 ${a.active ? '' : 'opacity-50'}`}>
                <span className="text-xl">{icon[a.type]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{a.name}</p>
                  <p className={`truncate text-xs ${ui.muted}`}>{t(`acc.t.${a.type}` as DictKey)} · {a.currency}{Number(a.paid) > 0 ? ` · ${t('acc.paidOut', { amount: fmt(a.paid) })}` : ''}{a.active ? '' : ` · ${t('acc.inactive')}`}</p>
                </div>
                {canEdit && <button type="button" onClick={() => setEdit({ id: a.id, name: a.name, type: a.type, active: a.active })} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>{t('prod.edit')}</button>}
              </li>
            ))}
          </ul>
        )}
    </Card>
  );
}

/** Pagar (total o parcial) una compra recibida desde una cuenta de la misma moneda */
export function PaySheet({ purchase, accounts, currency, fmt, onClose, onPaid, flash }: {
  purchase: { id: string; supplier: string; doc: string | null; total: number; paid: number };
  accounts: Account[]; currency: string; fmt: (n: number) => string;
  onClose: () => void; onPaid: () => void; flash: (ok: boolean, text: string) => void;
}) {
  const { t } = useT();
  const usable = accounts.filter((a) => a.active && a.currency === currency);
  const due = Math.max(0, Number(purchase.total) - Number(purchase.paid));
  const [acc, setAcc] = useState(usable[0]?.id ?? '');
  const [amount, setAmount] = useState(String(due));
  const [busy, setBusy] = useState(false);
  const n = parseAmount(amount);
  const bad = Number.isNaN(n) || n <= 0 || n > due + 1e-9;

  const pay = async () => {
    if (!acc || bad) return;
    setBusy(true);
    try {
      await rpc('pay_supplier', { p_purchase: purchase.id, p_account: acc, p_amount: n });
      flash(true, t('pay.done')); onPaid();
    } catch (e) {
      const m = (e as Error).message;
      flash(false, /excede/i.test(m) ? t('pay.tooMuch') : /otra moneda/i.test(m) ? t('pay.currency') : /Sin permiso/i.test(m) ? t('err.permDenied') : friendlyError(m, t));
    } finally { setBusy(false); }
  };

  return (
    <Sheet onClose={onClose} label={t('pos.close')}>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-extrabold">{t('pay.title')}</h2>
          <p className={`text-sm ${ui.muted}`}>{purchase.supplier}{purchase.doc ? ` · ${purchase.doc}` : ''}</p>
          <p className="mt-1 text-sm">{t('pay.due', { amount: fmt(due) })}</p>
        </div>
        {usable.length === 0 ? <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">{t('pay.noAccounts')}</p> : (
          <>
            <div>
              <label className={ui.label}>{t('pay.from')}</label>
              <select value={acc} onChange={(e) => setAcc(e.target.value)} className={ui.input}>
                {usable.map((a) => <option key={a.id} value={a.id}>{icon[a.type]} {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className={ui.label}>{t('pay.amount')}</label>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${ui.input} ${amount && bad ? '!border-red-500' : ''}`} />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className={`${ui.btnGhost} flex-1`}>{t('cash.cancel')}</button>
              <button type="button" disabled={busy || !acc || bad} onClick={pay} className={`${ui.btnPrimary} flex-1`}>{busy ? t('common.wait') : t('pay.confirm')}</button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
