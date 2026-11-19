'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOwner, friendlyError } from '../owner-context';
import { Card } from '../../shell';
import { ui, PasswordInput } from '../../../site-header';
import { rpc, supabase } from '../../../../lib/supabase';
import { useT } from '../../../i18n';
import { Sheet } from '../../sheet';
import type { DictKey } from '../../../i18n/es';
import { suggestedRoles } from '../../../business-catalog';

const ROLES = ['supervisor', 'cashier', 'vendor', 'collector', 'waiter', 'kitchen', 'technician', 'storekeeper', 'accountant', 'secretary', 'director', 'reception', 'delivery'] as const;
// Roles que solo tienen sentido si el módulo de su rubro está activo
const ROLE_MODULE: Partial<Record<(typeof ROLES)[number], string>> = { collector: 'field_collection', waiter: 'restaurant', kitchen: 'restaurant', technician: 'workshop', storekeeper: 'inventory' };
// Delivery necesita tienda, restaurante o cobranza en ruta (se valida también en el servidor)
const DELIVERY_MODULES = ['retail', 'restaurant', 'field_collection'];

type Branch = { id: string; name: string; company_id: string };
type Member = { id: string; user_id: string; role: string; branch_id: string | null; is_active: boolean; custom_role_id: string | null };
type Person = { id: string; full_name: string | null; email: string | null };
type Row = { userId: string; name: string; email: string; roles: string[]; branchIds: string[]; active: boolean; membershipIds: string[]; customRoleId: string | null };

export default function TeamPage() {
  const { orgId, reload, overview, modules } = useOwner();
  const [niches, setNiches] = useState<string[]>([]);
  const limitedPlan = ['basic', 'starter', 'pro'].includes(overview?.org.plan_code ?? '');
  // En planes chicos solo se ofrecen los cargos propios del nicho del negocio
  const nicheRoles: string[] | null = limitedPlan && niches.length ? suggestedRoles(niches) : null;
  const roles = ROLES.filter((r) => (!(['secretary', 'director'] as string[]).includes(r) || ['pro', 'enterprise', 'enterprise_plus'].includes(overview?.org.plan_code ?? '')) && (!ROLE_MODULE[r] || modules.length === 0 || modules.includes(ROLE_MODULE[r]!)) && (r !== 'delivery' || modules.length === 0 || modules.some((m) => DELIVERY_MODULES.includes(m))) && (!nicheRoles || nicheRoles.includes(r) || r === 'secretary' || r === 'director' || r === 'reception'));
  const { t } = useT();
  const roleLabel = (r: string) => t(`role.${r}` as DictKey);
  const coverage = (c: { base_role: string; also_roles: string[] }) => [c.base_role, ...(c.also_roles ?? [])].map(roleLabel).join(' + ');

  const [branches, setBranches] = useState<Branch[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier', branchId: '' });
  const [ownerRoles, setOwnerRoles] = useState<string[]>([]);
  const [customRoles, setCustomRoles] = useState<{ id: string; name: string; base_role: string; also_roles: string[] }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const [b, m] = await Promise.all([
      supabase.from('branches').select('id, name, company_id').eq('org_id', orgId).is('deleted_at', null).order('created_at'),
      supabase.from('memberships').select('id, user_id, role, branch_id, is_active, custom_role_id').eq('org_id', orgId).is('deleted_at', null).neq('role', 'owner'),
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
        roles: [], branchIds: [], active: false, membershipIds: [], customRoleId: null,
      };
      if (!r.roles.includes(x.role)) r.roles.push(x.role);
      if (x.branch_id && !r.branchIds.includes(x.branch_id)) r.branchIds.push(x.branch_id);
      r.active = r.active || x.is_active;
      r.membershipIds.push(x.id);
      r.customRoleId = r.customRoleId ?? x.custom_role_id;
      byUser.set(x.user_id, r);
    }
    try {
      const { data: ob } = await supabase.from('organizations').select('onboarding').eq('id', orgId).limit(1);
      setNiches(((ob ?? [])[0]?.onboarding as { categories?: string[] } | null)?.categories ?? []);
    } catch { setNiches([]); }
    try {
      const { data: me } = await supabase.from('memberships').select('extra_roles').eq('org_id', orgId).eq('role', 'owner').is('deleted_at', null).limit(1);
      setOwnerRoles(((me ?? [])[0]?.extra_roles as string[] | undefined) ?? []);
    } catch { setOwnerRoles([]); }
    try { setCustomRoles((await rpc<{ id: string; name: string; base_role: string; also_roles: string[] }[]>('custom_roles_list', { p_org: orgId })) ?? []); } catch { setCustomRoles([]); }
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
          companyId: branch.company_id, branchId: branch.id,
          ...(form.role.startsWith('custom:') ? { customRoleId: form.role.slice(7) } : { role: form.role }),
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

  // Editar cargo, rol propio y sucursal de un trabajador
  const [ed, setEd] = useState<{ row: Row; role: string; custom: string; branchId: string } | null>(null);
  const [edBusy, setEdBusy] = useState(false);
  const [edMsg, setEdMsg] = useState<string | null>(null);
  const openEdit = (r: Row) => { setEd({ row: r, role: r.roles[0] ?? 'cashier', custom: r.customRoleId ?? '', branchId: r.branchIds[0] ?? '' }); setEdMsg(null); };
  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ed) return;
    setEdBusy(true); setEdMsg(null);
    try {
      const single = ed.row.membershipIds.length === 1;
      for (const m of ed.row.membershipIds) {
        await rpc('set_member_role', { p_membership: m, p_role: ed.custom ? null : ed.role, p_custom: ed.custom || null, p_branch: single && ed.branchId ? ed.branchId : null });
      }
      setEd(null); setMsg({ ok: true, text: t('team.editSaved') });
      await Promise.all([load(), reload()]);
    } catch (err) { setEdMsg(friendlyError(err instanceof Error ? err.message : '', t)); }
    setEdBusy(false);
  };
  const [pw, setPw] = useState<{ row: Row; value: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const savePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw) return;
    setPwMsg(null);
    if (pw.value.length < 8) return setPwMsg(t('val.passMin'));
    setPwBusy(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch('/api/workers/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify({ orgId, userId: pw.row.userId, password: pw.value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? '');
      setPw(null);
      setMsg({ ok: true, text: t('team.pwDone') });
    } catch (err) {
      const m = err instanceof Error ? err.message : '';
      setPwMsg(/más de una empresa/.test(m) ? t('team.pwShared') : /administrador/.test(m) ? t('team.pwOwner') : t('team.pwFail'));
    } finally { setPwBusy(false); }
  };

  const toggle = async (r: Row) => {
    setMsg(null);
    const { error } = await supabase.from('memberships')
      .update({ is_active: !r.active }).eq('org_id', orgId).eq('user_id', r.userId).neq('role', 'owner');
    if (error) setMsg({ ok: false, text: friendlyError(error.message, t) });
    await Promise.all([load(), reload()]);
  };

  const toggleOwnerRole = async (r: string) => {
    const next = ownerRoles.includes(r) ? ownerRoles.filter((x) => x !== r) : [...ownerRoles, r];
    try {
      await rpc('set_owner_roles', { p_org: orgId, p_roles: next });
      setOwnerRoles(next); setMsg({ ok: true, text: t('team.ownerRolesSaved') });
    } catch (e) { setMsg({ ok: false, text: friendlyError(e instanceof Error ? e.message : '', t) }); }
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

      <Card>
        <h2 className="text-base font-extrabold">👤 {t('team.ownerRolesTitle')}</h2>
        <p className={`mb-3 text-sm ${ui.muted}`}>{t('team.ownerRolesHint')}</p>
        <div className="flex flex-wrap gap-2">
          {roles.filter((r) => r !== 'secretary' && r !== 'director').map((r) => (
            <button key={r} type="button" onClick={() => toggleOwnerRole(r)}
              className={`rounded-full border px-3 py-1.5 text-sm font-bold ${ownerRoles.includes(r) ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
              {roleLabel(r)}
            </button>
          ))}
        </div>
      </Card>

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
                {customRoles.length > 0 && (
                  <optgroup label={`🧩 ${t('roles.title')}`}>
                    {customRoles.map((c) => <option key={c.id} value={`custom:${c.id}`}>{c.name} — {coverage(c)}</option>)}
                  </optgroup>
                )}
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
                    {(() => { const c = r.customRoleId ? customRoles.find((x) => x.id === r.customRoleId) : undefined; return c ? `🧩 ${c.name} (${coverage(c)})` : r.roles.map(roleLabel).join(', '); })()} · {r.branchIds.map(branchName).join(', ')}
                  </p>
                </div>
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${r.active
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {r.active ? t('team.active') : t('team.inactive')}
                </span>
                <button type="button" onClick={() => openEdit(r)} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>✏️ {t('team.edit')}</button>
                <button type="button" onClick={() => { setPw({ row: r, value: '' }); setPwMsg(null); }} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>🔑 {t('team.pwChange')}</button>
                <button type="button" onClick={() => toggle(r)} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>
                  {r.active ? t('team.deactivate') : t('team.activate')}
                </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {ed && (
        <Sheet onClose={() => setEd(null)} label={t('pos.close')}>
          <form onSubmit={saveEdit} className="space-y-4">
            <div>
              <h2 className="text-lg font-extrabold">✏️ {t('team.edit')}</h2>
              <p className={`text-sm ${ui.muted}`}>{ed.row.name || ed.row.email}</p>
            </div>
            {!ed.custom && (
              <div>
                <label className={ui.label}>{t('team.role')}</label>
                <select className={ui.input} value={ed.role} onChange={(e) => setEd({ ...ed, role: e.target.value })}>
                  {[...new Set([...roles, ...ed.row.roles])].map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                </select>
              </div>
            )}
            {customRoles.length > 0 && (
              <div>
                <label className={ui.label}>🧩 {t('roles.assign')}</label>
                <select className={ui.input} value={ed.custom} onChange={(e) => setEd({ ...ed, custom: e.target.value })}>
                  <option value="">{t('roles.none')}</option>
                  {customRoles.map((c) => <option key={c.id} value={c.id}>🧩 {c.name} — {coverage(c)}</option>)}
                </select>
                {ed.custom && (() => { const c = customRoles.find((x) => x.id === ed.custom); return c ? <p className={`mt-1 text-xs ${ui.muted}`}>{coverage(c)}</p> : null; })()}
              </div>
            )}
            {ed.row.membershipIds.length === 1 && branches.length > 1 && (
              <div>
                <label className={ui.label}>{t('team.branch')}</label>
                <select className={ui.input} value={ed.branchId} onChange={(e) => setEd({ ...ed, branchId: e.target.value })}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            {edMsg && <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">{edMsg}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setEd(null)} className={`${ui.btnGhost} flex-1`}>{t('cash.cancel')}</button>
              <button type="submit" disabled={edBusy} className={`${ui.btnPrimary} flex-1`}>{edBusy ? t('common.wait') : t('prod.save')}</button>
            </div>
          </form>
        </Sheet>
      )}

      {pw && (
        <Sheet onClose={() => setPw(null)} label={t('pos.close')}>
          <form onSubmit={savePw} className="space-y-4">
            <div>
              <h2 className="text-lg font-extrabold">🔑 {t('team.pwTitle')}</h2>
              <p className={`text-sm ${ui.muted}`}>{pw.row.name || pw.row.email}</p>
            </div>
            <div>
              <label className={ui.label}>{t('team.pwNew')}</label>
              <PasswordInput value={pw.value} onChange={(v) => setPw({ ...pw, value: v })} autoComplete="new-password" />
              <p className={`mt-1 text-xs ${ui.muted}`}>{t('team.pwHint')}</p>
            </div>
            {pwMsg && <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">{pwMsg}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setPw(null)} className={`${ui.btnGhost} flex-1`}>{t('cash.cancel')}</button>
              <button type="submit" disabled={pwBusy} className={`${ui.btnPrimary} flex-1`}>{pwBusy ? t('common.wait') : t('team.pwSave')}</button>
            </div>
          </form>
        </Sheet>
      )}
    </div>
  );
}
