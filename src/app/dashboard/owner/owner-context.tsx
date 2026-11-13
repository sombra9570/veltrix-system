'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useVeltrixAuth, homeForRole } from '../../auth-system';
import { supabase, rpc } from '../../../lib/supabase';
import { AppShell, NavItem } from '../shell';
import { useT } from '../../i18n';
import type { DictKey } from '../../i18n/es';

export type Overview = {
  org: {
    name: string; plan_code: string; plan_name: string; price_usd: number;
    status: 'active' | 'past_due_grace' | 'suspended';
    trial_ends_at: string | null; next_billing_date: string | null; grace_ends_at: string | null;
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
};

const OwnerContext = createContext<Ctx | null>(null);
export function useOwner() {
  const c = useContext(OwnerContext);
  if (!c) throw new Error('useOwner fuera del panel del dueño');
  return c;
}

const NAV: NavItem[] = [
  { href: '/dashboard/owner', icon: '🏠', label: 'nav.home' },
  { href: '/dashboard/owner/equipo', icon: '👥', label: 'nav.team' },
  { href: '/dashboard/owner/sucursales', icon: '🏢', label: 'nav.branches' },
  { href: '/dashboard/owner/ventas', icon: '🧾', label: 'nav.sales', soon: true },
  { href: '/dashboard/owner/caja', icon: '💵', label: 'nav.cash', soon: true },
  { href: '/dashboard/owner/clientes', icon: '🤝', label: 'nav.customers', soon: true },
  { href: '/dashboard/owner/inventario', icon: '📦', label: 'nav.inventory', soon: true },
  { href: '/dashboard/owner/reportes', icon: '📊', label: 'nav.reports', soon: true },
];

const DAY = 86_400_000;

/** Traduce los errores de la base (límites del plan, etc.) a un mensaje claro */
export function friendlyError(msg: string, t: (k: DictKey) => string): string {
  if (msg.includes('PLAN_LIMIT_BRANCHES')) return t('err.limitBranches');
  if (msg.includes('PLAN_LIMIT_USERS')) return t('err.limitUsers');
  if (msg.includes('PLAN_LIMIT_COMPANIES')) return t('err.limitCompanies');
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

  if (!loaded || !session) return <div className="min-h-dvh bg-slate-50 dark:bg-slate-950" />;

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
    } else if (trialDays > 0) {
      banner = (
        <div className="bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white">
          {t('owner.trialLeft', { days: trialDays })}
        </div>
      );
    }
  }

  return (
    <OwnerContext.Provider value={{ orgId, overview, reload, userName: session.name }}>
      <AppShell
        nav={NAV}
        orgName={o?.name ?? ''}
        userName={session.name || session.email}
        roleLabel={t('role.owner')}
        onLogout={logout}
        banner={banner}
      >
        {children}
      </AppShell>
    </OwnerContext.Provider>
  );
}
