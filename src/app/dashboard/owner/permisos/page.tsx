'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import type { DictKey } from '../../../i18n/es';
import { friendlyError, useOwner } from '../owner-context';
import { CustomRoles } from './custom-roles';
import { roleAvailable, keyAvailable } from './availability';

type Data = {
  keys: string[];
  roles: Record<string, Record<string, boolean>>;
  users: { membership_id: string; name: string; role: string; branch: string | null; permissions: Record<string, boolean> }[];
};

// Qué permisos tienen sentido para cada rol (los demás no se muestran para no confundir)
// Permisos delegables por rol (el dueño y el supervisor ya lo tienen todo en su sucursal)
const ROLE_KEYS: Record<string, string[]> = {
  cashier: ['cash.see_expected', 'cash.movements', 'customers.view_docs', 'payments.reverse', 'sales.cancel_request'],
  vendor: ['sales.credit', 'customers.edit', 'customers.view_docs', 'payments.reverse', 'sales.cancel_request'],
  collector: ['collector.expenses', 'collector.portfolio', 'collector.settings', 'loans.create', 'loans.customers', 'loans.interest', 'loans.cancel', 'loans.reschedule', 'payments.reverse', 'routes.liquidate', 'routes.invest'],
  storekeeper: ['products.edit', 'products.price', 'products.delete', 'inv.receive', 'inv.adjust', 'inv.out', 'inv.transfer', 'inv.see_cost'],
  accountant: ['reports.export', 'inv.see_cost'],
  technician: ['customers.edit', 'customers.view_docs'],
};

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition cursor-pointer disabled:opacity-50 ${on ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'start-[1.375rem]' : 'start-0.5'}`} />
    </button>
  );
}

export default function PermissionsPage() {
  const { t } = useT();
  const { orgId, modules, cobranza, teamRoles } = useOwner();
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const k = (key: string) => t(key as DictKey);

  const load = useCallback(async () => {
    if (!orgId) return;
    try { setD(await rpc<Data>('permissions_admin', { p_org: orgId })); } catch (e) { setErr(friendlyError((e as Error).message, t)); }
  }, [orgId, t]);
  useEffect(() => { load(); }, [load]);

  const setRole = async (role: string, key: string, value: boolean) => {
    setBusy(true); setErr('');
    try { await rpc('set_role_permission', { p_org: orgId, p_role: role, p_key: key, p_value: value }); await load(); }
    catch (e) { setErr(friendlyError((e as Error).message, t)); }
    finally { setBusy(false); }
  };
  const setUser = async (membership: string, key: string, value: boolean | null) => {
    setBusy(true); setErr('');
    try { await rpc('set_user_permission', { p_membership: membership, p_key: key, p_value: value }); await load(); }
    catch (e) { setErr(friendlyError((e as Error).message, t)); }
    finally { setBusy(false); }
  };

  const [limits, setLimits] = useState<Record<string, Record<string, number>>>({});
  useEffect(() => {
    if (orgId) rpc<{ roles: Record<string, Record<string, number>> }>('limits_admin', { p_org: orgId }).then((r) => setLimits(r?.roles ?? {})).catch(() => undefined);
  }, [orgId]);
  const saveLimit = async (role: string, v: string) => {
    const n = Math.min(99, Math.max(0, parseFloat(v.replace(',', '.')) || 0));
    setBusy(true); setErr('');
    try { await rpc('set_role_limit', { p_org: orgId, p_role: role, p_key: 'discount_pct', p_value: n }); setLimits({ ...limits, [role]: { ...(limits[role] ?? {}), discount_pct: n } }); }
    catch (e) { setErr(friendlyError((e as Error).message, t)); }
    finally { setBusy(false); }
  };

  const users = useMemo(() => (d?.users ?? []).filter((u) => ROLE_KEYS[u.role]), [d]);

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold sm:text-2xl">🔐 {t('nav.permissions')}</h1>
        <p className={`text-sm ${ui.muted}`}>{t('perm.subtitle')}</p>
      </div>
      {err && <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">{err}</p>}

      {!d ? <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p> : (
        <>
          {/* Topes */}
          {!cobranza && <Card>
            <h2 className="font-bold">🏷️ {t('lim.title')}</h2>
            <p className={`mb-3 text-xs ${ui.muted}`}>{t('lim.hint')}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {['cashier', 'vendor', 'waiter'].filter((role) => teamRoles.length === 0 || teamRoles.includes(role)).map((role) => (
                <label key={role} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <span className="text-sm font-semibold">{k(`role.${role}`)}</span>
                  <span className="flex items-center gap-1">
                    <input key={`${role}-${limits[role]?.discount_pct ?? 0}`} inputMode="decimal" defaultValue={String(limits[role]?.discount_pct ?? 0)} disabled={busy}
                      onBlur={(e) => { if (Number(e.target.value) !== (limits[role]?.discount_pct ?? 0)) saveLimit(role, e.target.value); }}
                      className={`${ui.input} !w-20 text-right`} aria-label={`${k(`role.${role}`)} %`} />
                    <span className="font-semibold">%</span>
                  </span>
                </label>
              ))}
            </div>
          </Card>}

          {!cobranza && <CustomRoles keys={d.keys} />}

          {/* Por rol */}
          <div className="grid gap-4 lg:grid-cols-3">
            {Object.entries(ROLE_KEYS).filter(([role]) => roleAvailable(role, modules) && (teamRoles.length === 0 || teamRoles.includes(role) || (d?.users ?? []).some((u) => u.role === role)) && (!cobranza || role === 'cashier' || role === 'collector')).map(([role, allKeys]) => { const keys = allKeys.filter((x) => keyAvailable(x, modules) && !(cobranza && role === 'cashier' && !x.startsWith('cash.'))); return (
              <Card key={role}>
                <h2 className="font-bold">{cobranza && role === 'cashier' ? t('rt.liquidator') : k(`role.${role}`)}</h2>
                <p className={`mb-3 text-xs ${ui.muted}`}>{t('perm.roleHint')}</p>
                <ul className="space-y-3">
                  {keys.map((key) => (
                    <li key={key} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{k(`perm.${key}`)}</p>
                        <p className={`text-xs ${ui.muted}`}>{k(`perm.${key}.d`)}</p>
                      </div>
                      <Toggle on={!!d.roles[role]?.[key]} disabled={busy} label={k(`perm.${key}`)} onChange={(v) => setRole(role, key, v)} />
                    </li>
                  ))}
                </ul>
              </Card>
            ); })}
          </div>

          {/* Por usuario (en cobranza se hace desde los ajustes de cada ruta) */}
          {!cobranza && <Card className="!p-0 overflow-hidden">
            <div className="border-b border-slate-200 p-4 dark:border-slate-800">
              <h2 className="font-bold">{t('perm.byUser')}</h2>
              <p className={`text-xs ${ui.muted}`}>{t('perm.byUserHint')}</p>
            </div>
            {users.length === 0 ? <p className={`p-5 text-sm ${ui.muted}`}>{t('perm.noUsers')}</p> : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {users.map((u) => {
                  const overrides = Object.keys(u.permissions ?? {}).filter((x) => ROLE_KEYS[u.role].includes(x)).length;
                  return (
                    <li key={u.membership_id}>
                      <button type="button" onClick={() => setOpen(open === u.membership_id ? null : u.membership_id)}
                        className="flex w-full items-center gap-3 p-4 text-start hover:bg-slate-50 cursor-pointer dark:hover:bg-slate-800/50">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{u.name}</p>
                          <p className={`truncate text-xs ${ui.muted}`}>{k(`role.${u.role}`)}{u.branch ? ` · ${u.branch}` : ''}</p>
                        </div>
                        {overrides > 0 && <span className="shrink-0 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">{t('perm.customN', { n: overrides })}</span>}
                        <span className={ui.muted}>{open === u.membership_id ? '▴' : '▾'}</span>
                      </button>
                      {open === u.membership_id && (
                        <ul className="space-y-3 px-4 pb-4">
                          {(ROLE_KEYS[u.role] ?? []).filter((x) => keyAvailable(x, modules)).map((key) => {
                            const own = u.permissions?.[key];
                            const inherited = !!d.roles[u.role]?.[key];
                            const val = own === undefined ? 'inherit' : own ? 'yes' : 'no';
                            return (
                              <li key={key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold">{k(`perm.${key}`)}</p>
                                  <p className={`text-xs ${ui.muted}`}>{t('perm.roleSays', { v: inherited ? t('perm.yes') : t('perm.no') })}</p>
                                </div>
                                <div className="grid shrink-0 grid-cols-3 gap-1 rounded-xl border border-slate-300 p-1 dark:border-slate-700">
                                  {([['inherit', t('perm.inherit')], ['yes', t('perm.yes')], ['no', t('perm.no')]] as const).map(([opt, label]) => (
                                    <button key={opt} type="button" disabled={busy}
                                      onClick={() => setUser(u.membership_id, key, opt === 'inherit' ? null : opt === 'yes')}
                                      className={`rounded-lg px-3 py-1 text-xs font-semibold cursor-pointer ${val === opt ? 'bg-blue-600 text-white' : ''}`}>
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>}
        </>
      )}
    </div>
  );
}
