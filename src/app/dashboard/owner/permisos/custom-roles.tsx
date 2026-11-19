'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { Sheet } from '../../sheet';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import type { DictKey } from '../../../i18n/es';
import { friendlyError, useOwner } from '../owner-context';
import { roleAvailable, keyAvailable } from './availability';

export type CustomRole = { id: string; name: string; base_role: string; also_roles: string[]; permissions: Record<string, boolean>; members: number };

// Roles con los que se puede armar un rol propio (el administrador no se delega)
const BASE_ROLES = ['cashier', 'vendor', 'supervisor', 'collector', 'waiter', 'technician', 'storekeeper', 'accountant'];

/** Roles propios: un nombre + pantalla principal + otras funciones que cubre + permisos finos */
export function CustomRoles({ keys }: { keys: string[] }) {
  const { t } = useT();
  const { orgId, modules } = useOwner();
  const baseRoles = BASE_ROLES.filter((r) => roleAvailable(r, modules));
  const k = (key: string) => t(key as DictKey);
  const [list, setList] = useState<CustomRole[]>([]);
  const [edit, setEdit] = useState<{ id: string | null; name: string; roles: string[]; perms: Record<string, boolean> } | null>(null);
  // Cuántos roles puede combinar un rol propio según el plan (la base de datos también lo exige)
  const [rules, setRules] = useState<{ combo: number; custom: number; big: number }>({ combo: 2, custom: 1, big: 0 });
  useEffect(() => { if (orgId) rpc<{ combo: number; custom: number; big: number }>('plan_role_rules', { p_org: orgId }).then((r) => { if (r) setRules(r); }).catch(() => undefined); }, [orgId]);
  const maxPick = rules.big > 0 ? baseRoles.length : rules.combo;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    try { setList((await rpc<CustomRole[]>('custom_roles_list', { p_org: orgId })) ?? []); }
    catch (e) { setErr(friendlyError((e as Error).message, t)); }
  }, [orgId, t]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!edit) return;
    setBusy(true); setErr('');
    try {
      await rpc('custom_role_save', { p_org: orgId, p_id: edit.id, p_name: edit.name, p_base: edit.roles[0], p_also: edit.roles.slice(1), p_perms: edit.perms });
      setEdit(null); await load();
    } catch (e) { setErr(friendlyError((e as Error).message, t)); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    setBusy(true); setErr('');
    try { await rpc('custom_role_delete', { p_id: id }); setEdit(null); await load(); }
    catch (e) { setErr((e as Error).message.includes('ROLE_IN_USE') ? t('roles.inUse') : friendlyError((e as Error).message, t)); }
    finally { setBusy(false); }
  };
  const setPerm = (key: string, v: 'inherit' | 'yes' | 'no') => setEdit((e) => {
    if (!e) return e;
    const p = { ...e.perms };
    if (v === 'inherit') delete p[key]; else p[key] = v === 'yes';
    return { ...e, perms: p };
  });

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-bold">🧩 {t('roles.title')}</h2>
          <p className={`text-xs ${ui.muted}`}>{t('roles.hint')}</p>
        </div>
        <button type="button" className={ui.btnPrimary} onClick={() => { setErr(''); setEdit({ id: null, name: '', roles: [], perms: {} }); }}>+ {t('roles.new')}</button>
      </div>
      {err && !edit && <p className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">{err}</p>}
      {list.length === 0 ? <p className={`mt-3 text-sm ${ui.muted}`}>{t('roles.empty')}</p> : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {list.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => { setErr(''); setEdit({ id: r.id, name: r.name, roles: [r.base_role, ...(r.also_roles ?? [])], perms: r.permissions ?? {} }); }}
                className="w-full rounded-xl border border-slate-200 p-3 text-start cursor-pointer hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                <p className="font-semibold">{r.name}</p>
                <p className={`text-xs ${ui.muted}`}>{[r.base_role, ...(r.also_roles ?? [])].map((x) => k(`role.${x}`)).join(' + ')}</p>
                <p className={`text-xs ${ui.muted}`}>{t('roles.members', { n: r.members })}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {edit && (
        <Sheet onClose={() => setEdit(null)} label={t('pos.close')}>
          <h2 className="text-lg font-extrabold">{edit.id ? t('roles.edit') : t('roles.new')}</h2>
          <div className="mt-3 space-y-4">
            <div>
              <label className={ui.label}>{t('roles.name')}</label>
              <input className={ui.input} value={edit.name} maxLength={40} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </div>
            <div>
              <p className={ui.label}>{t('roles.pick')} · <span className={ui.muted}>{t('roles.count', { a: edit.roles.length, b: maxPick })}</span></p>
              <p className={`mb-2 text-xs ${ui.muted}`}>{t('roles.pickHint', { n: rules.big > 0 ? baseRoles.length : rules.combo })}</p>
              <div className="flex flex-wrap gap-2">
                {baseRoles.map((r) => {
                  const idx = edit.roles.indexOf(r);
                  const on = idx >= 0;
                  const full = !on && edit.roles.length >= maxPick;
                  return (
                    <span key={r} className="inline-flex items-center">
                      <button type="button" aria-pressed={on} disabled={full}
                        onClick={() => setEdit({ ...edit, roles: on ? edit.roles.filter((x) => x !== r) : [...edit.roles, r] })}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold cursor-pointer disabled:opacity-40 ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>
                        {on && idx === 0 ? '⭐ ' : ''}{k(`role.${r}`)}
                      </button>
                      {on && idx > 0 && (
                        <button type="button" aria-label="⭐" onClick={() => setEdit({ ...edit, roles: [r, ...edit.roles.filter((x) => x !== r)] })} className="ms-1 cursor-pointer text-sm opacity-60 hover:opacity-100">☆</button>
                      )}
                    </span>
                  );
                })}
              </div>
              {edit.roles.length >= maxPick && <p className={`mt-2 text-xs ${ui.muted}`}>{t('roles.limitReached')}</p>}
            </div>
            <div>
              <p className={ui.label}>{t('roles.perms')}</p>
              <p className={`mb-2 text-xs ${ui.muted}`}>{t('roles.permsHint')}</p>
              <ul className="space-y-3">
                {keys.filter((x) => keyAvailable(x, modules)).map((key) => {
                  const own = edit.perms[key];
                  const val = own === undefined ? 'inherit' : own ? 'yes' : 'no';
                  return (
                    <li key={key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="min-w-0 text-sm font-semibold">{k(`perm.${key}`)}</p>
                      <div className="grid shrink-0 grid-cols-3 gap-1 rounded-xl border border-slate-300 p-1 dark:border-slate-700">
                        {([['inherit', t('perm.inherit')], ['yes', t('perm.yes')], ['no', t('perm.no')]] as const).map(([opt, label]) => (
                          <button key={opt} type="button" onClick={() => setPerm(key, opt)}
                            className={`rounded-lg px-3 py-1 text-xs font-semibold cursor-pointer ${val === opt ? 'bg-blue-600 text-white' : ''}`}>{label}</button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            {err && <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">{err}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy || edit.name.trim().length < 2 || edit.roles.length === 0} onClick={save} className={ui.btnPrimary}>{busy ? t('common.wait') : t('roles.save')}</button>
              {edit.id && <button type="button" disabled={busy} onClick={() => remove(edit.id!)} className={ui.btnGhost}>🗑️ {t('roles.delete')}</button>}
            </div>
          </div>
        </Sheet>
      )}
    </Card>
  );
}
