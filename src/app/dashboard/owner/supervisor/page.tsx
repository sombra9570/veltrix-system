'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { rpc } from '../../../../lib/supabase';
import { Card, useHeaderSlot } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import type { DictKey } from '../../../i18n/es';
import { useOwner, friendlyError } from '../owner-context';
import { MenuTile } from '../../collector/tiles';

/* Panel de un supervisor visto desde el administrador: permisos, rutas que supervisa, reportes y obligaciones */
type Screen = 'home' | 'perms' | 'routes' | 'reports' | 'duties';
type Sup = { membership_id: string; user_id: string; name: string; permissions: Record<string, boolean>; routes: string[] };
type Rep = { id: string; route: string; at: string; body: string; author_id: string };
const PERMS = ['loans.customers', 'payments.record_installment', 'collector.delete_installments', 'loans.create', 'collector.delete_credits', 'payments.record_partial',
  'collector.delete_customers', 'loans.interest', 'routes.liquidate', 'collector.expenses', 'collector.delete_expenses', 'routes.invest'];
const DUTIES = ['sv.d.rateCollector', 'sv.d.rateCustomers', 'sv.d.verify', 'sv.d.verifyAmounts', 'sv.d.fixLocation', 'sv.d.fixPhone', 'sv.d.report', 'sv.d.notes'] as const;

function SupervisorScreen() {
  const { t, lang } = useT();
  const router = useRouter();
  const sid = useSearchParams().get('s') ?? '';
  const { orgId } = useOwner();
  const [screen, setScreen] = useState<Screen>('home');
  const [sup, setSup] = useState<Sup | null | undefined>(undefined);
  const [routes, setRoutes] = useState<{ id: string; name: string }[]>([]);
  const [reps, setReps] = useState<Rep[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !sid) return;
    try {
      const all = (await rpc<Sup[]>('owner_supervisors', { p_org: orgId })) ?? [];
      const me = all.find((x) => x.membership_id === sid) ?? null;
      setSup(me);
      setRoutes(((await rpc<{ id: string; name: string }[]>('owner_routes', { p_org: orgId })) ?? []).map((r) => ({ id: r.id, name: r.name })));
      if (me) setReps(((await rpc<Rep[]>('supervisor_reports_admin', { p_org: orgId })) ?? []).filter((r) => r.author_id === me.user_id));
    } catch (e) { setMsg({ ok: false, text: friendlyError((e as Error).message, t) }); }
  }, [orgId, sid, t]);
  useEffect(() => { setScreen('home'); setSup(undefined); load(); }, [load]);

  const back = () => { if (screen !== 'home') setScreen('home'); else router.push('/dashboard/owner/supervisores'); };
  const names: Record<string, string> = { perms: 'sv.permissions', routes: 'sv.routes', reports: 'rep.supTitle', duties: 'sv.duties' };
  useHeaderSlot(sup ? { title: sup.name, subtitle: screen === 'home' ? t('nav.supervisors') : t(names[screen] as DictKey), onBack: back } : null, [sup?.name, screen, lang]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setMsg(null);
    try { await fn(); await load(); window.dispatchEvent(new Event('vx-routes-changed')); }
    catch (e) { setMsg({ ok: false, text: friendlyError((e as Error).message, t) }); }
    finally { setBusy(false); }
  };

  if (sup === undefined) return <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>;
  if (sup === null) return <Card><p className={`text-sm ${ui.muted}`}>{t('rt.notFound')}</p></Card>;

  return (
    <div className="space-y-4">
      {msg && <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">{msg.text}</p>}

      {screen === 'home' && (
        <div className="grid max-w-xl grid-cols-2 gap-3">
          <MenuTile icon="sliders" label={t('sv.permissions')} tone="blue" onClick={() => setScreen('perms')} />
          <MenuTile icon="pin" label={t('sv.routes')} tone="blue" onClick={() => setScreen('routes')} />
          <MenuTile icon="receipt" label={t('rep.supTitle')} tone="plain" onClick={() => setScreen('reports')} />
          <MenuTile icon="clock" label={t('sv.duties')} tone="amber" onClick={() => setScreen('duties')} />
        </div>
      )}

      {screen === 'perms' && (
        <Card className="space-y-3">
          <ul className="space-y-3">
            {PERMS.map((key) => {
              const v = sup.permissions?.[key];
              const val = v === undefined ? 'inherit' : v ? 'yes' : 'no';
              return (
                <li key={key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0 text-sm font-semibold">{t(`perm.${key}` as DictKey)}</p>
                  <div className="grid shrink-0 grid-cols-3 gap-1 rounded-xl border border-slate-300 p-1 dark:border-slate-700">
                    {([['inherit', t('perm.inherit')], ['yes', t('perm.yes')], ['no', t('perm.no')]] as const).map(([opt, label]) => (
                      <button key={opt} type="button" disabled={busy}
                        onClick={() => run(() => rpc('supervisor_set_permission', { p_membership: sid, p_key: key, p_value: opt === 'inherit' ? null : opt === 'yes' }))}
                        className={`rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer ${val === opt ? 'bg-blue-600 text-white' : ''}`}>{label}</button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {screen === 'routes' && (
        <Card className="space-y-3">
          <p className={`text-xs ${ui.muted}`}>{t('sv.routesHint')}</p>
          {routes.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('routes.empty')}</p> : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {routes.map((r) => {
                const on = sup.routes.includes(r.id);
                return (
                  <li key={r.id}>
                    <label className="flex cursor-pointer items-center gap-3 py-3">
                      <input type="checkbox" checked={on} disabled={busy} className="h-5 w-5"
                        onChange={() => run(() => rpc('supervisor_set_routes', { p_membership: sid, p_routes: on ? sup.routes.filter((x) => x !== r.id) : [...sup.routes, r.id] }))} />
                      <span className="font-semibold">🛵 {r.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {screen === 'reports' && (
        <Card className="space-y-3">
          {reps.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('sv.noReports')}</p> : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {reps.map((r) => (
                <li key={r.id} className="space-y-1 py-3">
                  <p className="text-xs"><b>🛵 {r.route}</b> · <span className={ui.muted}>{new Date(r.at).toLocaleString(lang)}</span></p>
                  <p className="whitespace-pre-wrap text-sm">{r.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {screen === 'duties' && (
        <Card className="space-y-3">
          <p className={`text-xs ${ui.muted}`}>{t('sv.dutiesHint')}</p>
          <ul className="space-y-2">
            {DUTIES.map((d) => <li key={d} className="flex items-start gap-2 text-sm font-semibold"><span className="text-emerald-600">✔</span><span>{t(d)}</span></li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}

export default function SupervisorPage() {
  return <Suspense fallback={null}><SupervisorScreen /></Suspense>;
}
