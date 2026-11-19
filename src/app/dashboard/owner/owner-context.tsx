'use client';
import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useVeltrixAuth, homeForRole } from '../../auth-system';
import { supabase, rpc } from '../../../lib/supabase';
import { AppShell, NavItem } from '../shell';
import { useT } from '../../i18n';
import type { DictKey } from '../../i18n/es';
import { Spinner } from '../../spinner';

export type Overview = {
  org: {
    name: string; plan_code: string; plan_name: string; price_usd: number;
    status: 'active' | 'past_due_grace' | 'suspended';
    trial_ends_at: string | null; next_billing_date: string | null; grace_ends_at: string | null;
    is_pilot?: boolean; founder_discount_pct?: number; founder_until?: string | null; price_now?: number;
  };
  usage: Record<'companies' | 'branches' | 'users' | 'storage_mb', { used: number; max: number | null }>;
  today: { currency: string; amount: number; count: number }[];
  open_shifts: number;
  pending_reversals: number;
  pending_settlements: number;
};

type Ctx = {
  orgId: string;
  overview: Overview | null;
  reload: () => Promise<void>;
  userName: string;
  modules: string[];
};

const OwnerContext = createContext<Ctx | null>(null);
export function useOwner() {
  const c = useContext(OwnerContext);
  if (!c) throw new Error('useOwner fuera del panel del dueño');
  return c;
}

/** Igual que useOwner, pero devuelve null si no está dentro del panel del dueño (p. ej. el supervisor usando la misma pantalla) */
export function useOwnerOptional() { return useContext(OwnerContext); }

const NAV: NavItem[] = [
  { href: '/dashboard/owner', icon: '🏠', label: 'nav.home', group: 'nav.g.today' },
  { href: '/dashboard/owner/mensajes', icon: '💬', label: 'nav.messages', group: 'nav.g.today' },
  { href: '/dashboard/owner/ia', icon: '✨', label: 'nav.ai', group: 'nav.g.today' },
  { href: '/dashboard/owner/vender', icon: '🛒', label: 'nav.pos', group: 'nav.g.sell' },
  { href: '/dashboard/owner/mesas', icon: '🍽️', label: 'nav.tables', module: 'restaurant', group: 'nav.g.sell' },
  { href: '/dashboard/owner/cocina', icon: '🔥', label: 'nav.kitchen', module: 'restaurant', group: 'nav.g.sell' },
  { href: '/dashboard/owner/entregas', icon: '🛵', label: 'dl.nav', module: 'restaurant', group: 'nav.g.sell' },
  { href: '/dashboard/owner/taller', icon: '🔧', label: 'nav.workshop', module: 'workshop', group: 'nav.g.sell' },
  { href: '/dashboard/owner/despacho', icon: '🚚', label: 'nav.dispatch', module: 'retail', group: 'nav.g.sell' },
  { href: '/dashboard/owner/rutas', icon: '🛵', label: 'nav.routes', module: 'field_collection', group: 'nav.g.sell' },
  { href: '/dashboard/owner/prestamos', icon: '💸', label: 'nav.loans', module: 'field_collection', group: 'nav.g.sell' },
  { href: '/dashboard/owner/caja', icon: '💵', label: 'nav.cash', group: 'nav.g.sell' },
  { href: '/dashboard/owner/ventas', icon: '🧾', label: 'nav.sales', group: 'nav.g.sell' },
  { href: '/dashboard/owner/clientes', icon: '🤝', label: 'nav.customers', group: 'nav.g.sell' },
  { href: '/dashboard/owner/productos', icon: '📦', label: 'nav.products', group: 'nav.g.business' },
  { href: '/dashboard/owner/inventario', icon: '🗃️', label: 'nav.inventory', group: 'nav.g.business' },
  { href: '/dashboard/owner/tienda', icon: '🛍️', label: 'nav.store', group: 'nav.g.business' },
  { href: '/dashboard/owner/sucursales', icon: '🏢', label: 'nav.branches', group: 'nav.g.business' },
  { href: '/dashboard/owner/reportes', icon: '📊', label: 'nav.reports', group: 'nav.g.reports' },
  { href: '/dashboard/owner/informes', icon: '📑', label: 'nav.informes', group: 'nav.g.reports' },
  { href: '/dashboard/owner/indicadores', icon: '🌎', label: 'nav.indicators', group: 'nav.g.reports' },
  { href: '/dashboard/owner/equipo', icon: '👥', label: 'nav.team', group: 'nav.g.team' },
  { href: '/dashboard/owner/permisos', icon: '🔐', label: 'nav.permissions', group: 'nav.g.team' },
  { href: '/dashboard/owner/plan', icon: '💳', label: 'nav.plan', group: 'nav.g.account' },
  { href: '/dashboard/owner/invitar', icon: '🎁', label: 'nav.invite', group: 'nav.g.account' },
  { href: '/dashboard/owner/ayuda', icon: '🎧', label: 'nav.help', group: 'nav.g.account' },
];

const DAY = 86_400_000;

/** Traduce los errores de la base (límites del plan, etc.) a un mensaje claro */
export function friendlyError(msg: string, t: (k: DictKey) => string): string {
  if (msg.includes('PERM_DENIED')) return t('err.permDenied');
  if (msg.includes('PLAN_LIMIT_BRANCHES')) return t('err.limitBranches');
  if (msg.includes('PLAN_LIMIT_USERS')) return t('err.limitUsers');
  if (msg.includes('PLAN_LIMIT_COMPANIES')) return t('err.limitCompanies');
  if (msg.includes('PLAN_COMBO_LIMIT') || msg.includes('PLAN_BIG_LIMIT')) return t('err.limitCombo');
  if (msg.includes('PLAN_CUSTOM_LIMIT')) return t('err.limitCustom');
  if (msg.includes('ROLE_NOT_IN_PLAN')) return t('err.roleNotInPlan');
  if (msg.includes('ROLE_NOT_COMBINABLE')) return t('err.roleNotCombinable');
  if (msg.includes('REPORT_LOCKED')) return t('rep.locked');
  if (msg.includes('REPORT_NOT_PENDING')) return t('rep.notPending');
  if (msg.includes('ROLE_NOT_IN_NICHE')) return t('err.roleNiche');
  if (msg.includes('PLAN_TOTAL_ROLES_LIMIT')) return t('err.limitTotalRoles');
  if (msg.includes('PLAN_ROLES_LIMIT')) return t('err.limitRoles');
  if (/TASK_TAKEN|DELIVERY_TAKEN/.test(msg)) return t('err.taken');
  if (/CASH_OVER_LIMIT|CASH_NOT_ALLOWED/.test(msg)) return t('err.cashOver');
  if (/REQUEST_NOT_PENDING|REQUEST_NOT_FOUND|CASH_NOT_PENDING|LOAN_NOT_PENDING|REVERSAL_EXISTS/.test(msg)) return t('err.requestDone');
  if (msg.includes('TOO_MANY_REQUESTS')) return t('err.tooMany');
  if (/[A-Z]+_INVALID/.test(msg)) return t('err.invalidData');
  if (/suspendida/i.test(msg)) return t('err.suspended');
  if (/already (been )?registered|already exists/i.test(msg)) return t('err.emailTaken');
  return t('err.generic');
}

export function OwnerProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { t } = useT();
  const { loaded, session, logout } = useVeltrixAuth();
  const [orgId, setOrgId] = useState<string>('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [denied, setDenied] = useState(false);
  const [modules, setModules] = useState<string[]>([]);

  // Solo se muestran las herramientas de los rubros que tiene activos la empresa
  useEffect(() => {
    if (!session || session.role !== 'owner') return;
    rpc<string[]>('my_modules').then((m) => setModules(m ?? [])).catch(() => setModules([]));
  }, [session]);

  useEffect(() => {
    if (!loaded) return;
    if (!session) { router.replace('/ingresar'); return; }
    if (session.role !== 'owner') {
      // supervisores y demás: a su propio panel (el de supervisor llega en el siguiente paso)
      if (session.role === 'supervisor') setDenied(true);
      else router.replace(homeForRole(session.role));
    }
  }, [loaded, session, router]);

  const reload = useCallback(async () => {
    if (!session || session.role !== 'owner') return;
    let id = orgId;
    if (!id) {
      const { data } = await supabase.from('profiles').select('org_id').eq('id', session.userId).single();
      id = data?.org_id ?? '';
      setOrgId(id);
    }
    if (id) {
      try { setOverview(await rpc<Overview>('owner_overview', { p_org: id })); } catch { /* sin conexión */ }
    }
  }, [session, orgId]);

  useEffect(() => { reload(); }, [reload]);

  if (!loaded || !session) return <div className="grid min-h-dvh place-items-center bg-slate-50 dark:bg-slate-950"><Spinner /></div>;

  if (denied) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-6 text-center dark:bg-slate-950">
        <div>
          <p className="font-bold">{t('owner.notOwner')}</p>
          <button type="button" onClick={logout} className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white cursor-pointer">
            {t('shell.logout')}
          </button>
        </div>
      </div>
    );
  }

  // Aviso según el estado de la suscripción
  let banner: React.ReactNode = null;
  const o = overview?.org;
  if (o) {
    const trialDays = o.trial_ends_at ? Math.ceil((new Date(o.trial_ends_at).getTime() - Date.now()) / DAY) : -1;
    if (o.status === 'suspended') {
      banner = <div className="bg-red-600 px-4 py-2.5 text-center text-sm font-semibold text-white">{t('owner.suspended')}</div>;
    } else if (o.status === 'past_due_grace') {
      banner = (
        <div className="bg-amber-500 px-4 py-2.5 text-center text-sm font-semibold text-white">
          {t('owner.grace', { date: o.grace_ends_at ? new Date(o.grace_ends_at).toLocaleDateString() : '' })}
        </div>
      );
    } else if (trialDays > 0 && o.is_pilot) {
      const after = `US$ ${Number(o.price_now ?? o.price_usd).toFixed(2)}`;
      banner = (
        <div className="bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white">
          {o.founder_until && Number(o.founder_discount_pct) > 0
            ? t('owner.pilotFounder', { days: trialDays, price: after, pct: Number(o.founder_discount_pct),
                date: new Date(o.founder_until + 'T12:00:00').toLocaleDateString() })
            : t('owner.pilotLeft', { days: trialDays, price: after })}
        </div>
      );
    } else if (trialDays > 0) {
      banner = (
        <div className="bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white">
          {t('owner.trialLeft', { days: trialDays })}
        </div>
      );
    }
  }

  // Cualquier aviso de suscripción lleva directo a "Mi plan"
  if (banner) banner = <Link href="/dashboard/owner/plan" className="block hover:opacity-95">{banner}</Link>;

  return (
    <OwnerContext.Provider value={{ orgId, overview, reload, userName: session.name, modules }}>
      <AppShell
        nav={NAV.filter((n) => (!n.module || modules.includes(n.module)) && (!n.href.endsWith('/informes') || ['pro', 'enterprise', 'enterprise_plus'].includes(o?.plan_code ?? '')))}
        orgName={o?.name ?? ''}
        userName={session.name || session.email}
        roleLabel={t('role.owner')}
        onLogout={logout}
        banner={banner}
      >
        {children}
        {o && (
          <Link href="/dashboard/owner/plan"
            className="mt-8 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs text-slate-500 hover:border-blue-300 dark:border-slate-800">
            <span>💳 {t('owner.planStrip', { plan: o.plan_name })}{o.next_billing_date ? ` · ${t('owner.renews', { date: new Date(o.next_billing_date.slice(0, 10) + 'T12:00:00').toLocaleDateString() })}` : ''}</span>
            <span className="font-bold text-blue-600 dark:text-blue-400">{t('owner.changePlan')} →</span>
          </Link>
        )}
      </AppShell>
    </OwnerContext.Provider>
  );
}
