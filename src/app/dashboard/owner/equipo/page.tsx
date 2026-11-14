'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOwner, friendlyError } from '../owner-context';
import { Card } from '../../shell';
import { ui, PasswordInput } from '../../../site-header';
import { supabase } from '../../../../lib/supabase';
import { useT } from '../../../i18n';
import type { DictKey } from '../../../i18n/es';

const ROLES = ['supervisor', 'cashier', 'vendor', 'collector', 'waiter', 'kitchen', 'technician', 'storekeeper', 'accountant'] as const;
// Roles que solo tienen sentido si el módulo de su rubro está activo
const ROLE_MODULE: Partial<Record<(typeof ROLES)[number], string>> = { collector: 'field_collection', waiter: 'restaurant', kitchen: 'restaurant', technician: 'workshop', storekeeper: 'inventory' };

type Branch = { id: string; name: string; company_id: string };
type Member = { user_id: string; role: string; branch_id: string | null; is_active: boolean };
type Person = { id: string; full_name: string | null; email: string | null };
type Row = { userId: string; name: string; email: string; roles: string[]; branchIds: string[]; active: boolean };

export default function TeamPage() {
  const { orgId, reload, overview, modules } = useOwner();
  const roles = ROLES.filter((r) => !ROLE_MODULE[r] || modules.length === 0 || modules.includes(ROLE_MODULE[r]!));
  const { t } = useT();
  const roleLabel = (r: string) => t(`role.${r}` as DictKey);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier', branchId: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const [b, m] = await Promise.all([
      supabase.from('branches').select('id, name, company_id').eq('org_id', orgId).is('deleted_at', null).order('created_at'),
      supabase.from('memberships').select('user_id, role, branch_id, is_active').eq('org_id', orgId).is('deleted_at', null).neq('role', 'owner'),
    ]);
    const bs = (b.data ?? []) as Branch[];
    const ms = (m.data ?? []) as Member[];
    const ids = [...new Set(ms.map((x) => x.user_id))];
    const p = ids.length ? await supabase.from('profiles').select('id, full_name, email').in('id', ids) : { data: [] };
    const people = new Map(((p.data ?? []) as Person[]).map((x) => [x.id, x]));

    const byUser = new Map<string, Row>();
    for (const x of ms) {
      const r = byUser.get(x.user_id) ?? {
        userId: x.user_id, name: people.get(x.user_id)?.full_name ?? '', email: people.get(x.user_id)?.email ?? '',
        roles: [], branchIds: [], active: false,
      };
      if (!r.roles.includes(x.role)) r.roles.push(x.role);
      if (x.branch_id && !r.branchIds.includes(x.branch_id)) r.branchIds.push(x.branch_id);
      r.active = r.active || x.is_active;
      byUser.set(x.user_id, r);
    }
    setBranches(bs);
    setRows([...byUser.values()].sort((a, b2) => Number(b2.active) - Number(a.active) || a.name.localeCompare(b2.name)));
    setForm((f) => ({ ...f, branchId: f.branchId || bs[0]?.id || '' }));
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (form.password.length < 8) return setMsg({ ok: false, text: t('val.passMin') });
    const branch = branches.find((b) => b.id === form.branchId);
    if (!branch) return;
    setBusy(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify({
          companyId: branch.company_id, branchId: branch.id, role: form.role,
          name: form.name, email: form.email, password: form.password,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? '');
      setMsg({ ok: true, text: t('team.created') });
      setForm((f) => ({ ...f, name: '', email: '', password: '' }));
      setShowForm(false);
      await Promise.all([load(), reload()]);
    } catch (err) {
      setMsg({ ok: false, text: friendlyError(err instanceof Error ? err.message : '', t) });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (r: Row) => {
    setMsg(null);
    const { error } = await supabase.from('memberships')
      .update({ is_active: !r.active }).eq('org_id', orgId).eq('user_id', r.userId).neq('role', 'owner');
    if (error) setMsg({ ok: false, text: friendlyError(error.message, t) });
    await Promise.all([load(), reload()]);
  };

  const users = overview?.usage.users;
  const full = users && users.max !== null && users.used >= users.max;
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold sm:text-2xl">{t('team.title')}</h1>
          <p className={`text-sm ${ui.muted}`}>{t('team.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {users && (
            <span className={`text-sm font-semibold ${ui.muted}`}>
              {users.max === null ? users.used : t('owner.of', { used: users.used, max: users.max })}
            </span>
          )}
          <button type="button" onClick={() => setShowForm(!showForm)} disabled={!!full} className={ui.btnPrimary}>
            + {t('team.add')}
          </button>
        </div>
      </div>

      {full && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">{t('err.limitUsers')}</p>}

      {msg && (
        <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
          : 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400'}`}>
          {msg.ok ? '✅' : '⚠️'} {msg.text}
        </p>
      )}

      {showForm && (
        <Card>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={ui.label}>{t('team.name')}</label>
              <input required className={ui.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className={ui.label}>{t('common.email')}</label>
              <input required type="email" className={ui.input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className={ui.label}>{t('team.role')}</label>
              <select className={ui.input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {roles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            </div>
            <div>
              <label className={ui.label}>{t('team.branch')}</label>
              <select className={ui.input} value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={ui.label}>{t('common.password')}</label>
              <PasswordInput required autoComplete="new-password" value={form.password}
                onChange={(v) => setForm({ ...form, password: v })} />
              <p className={`mt-1 text-xs ${ui.muted}`}>{t('team.passHint')}</p>
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" onClick={() => setShowForm(false)} className={ui.btnGhost}>{t('pwa.close')}</button>
              <button type="submit" disabled={busy} className={`${ui.btnPrimary} max-sm:w-full`}>{busy ? t('common.wait') : t('team.create')}</button>
            </div>
          </form>
        </Card>
      )}

      <Card className="!p-0 overflow-hidden">
        {loading ? (
          <p className={`p-5 text-sm ${ui.muted}`}>{t('common.wait')}</p>
        ) : rows.length === 0 ? (
          <p className={`p-5 text-sm ${ui.muted}`}>{t('team.empty')}</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.map((r) => (
              <li key={r.userId} className="flex flex-wrap items-center gap-3 p-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-100 font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                  {(r.name || r.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.name || r.email}</p>
                  <p className={`truncate text-xs ${ui.muted}`}>
                    {r.email}
                  </p>
                  <p className={`truncate text-xs ${ui.muted}`}>
                    {r.roles.map(roleLabel).join(', ')} · {r.branchIds.map(branchName).join(', ')}
                  </p>
                </div>
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${r.active
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {r.active ? t('team.active') : t('team.inactive')}
                </span>
                <button type="button" onClick={() => toggle(r)} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>
                  {r.active ? t('team.deactivate') : t('team.activate')}
                </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
