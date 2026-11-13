'use client';
import { createContext, useContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useVeltrixAuth, homeForRole, UserRole } from '../auth-system';
import { AppShell, NavItem } from './shell';
import { useT } from '../i18n';
import type { DictKey } from '../i18n/es';

type Ctx = { userId: string; userName: string };
const StaffContext = createContext<Ctx | null>(null);
export function useStaff() {
  const c = useContext(StaffContext);
  if (!c) throw new Error('useStaff fuera de un panel de trabajo');
  return c;
}

/**
 * Panel de trabajo de un empleado (cajero, vendedor, cobrador…):
 * misma estructura que el del dueño, pero solo con sus herramientas.
 */
export function StaffProvider({
  role, nav, children,
}: { role: UserRole; nav: NavItem[]; children: React.ReactNode }) {
  const router = useRouter();
  const { t } = useT();
  const { loaded, session, companies, logout } = useVeltrixAuth();

  useEffect(() => {
    if (!loaded) return;
    if (!session) router.replace('/ingresar');
    else if (session.role !== role) router.replace(homeForRole(session.role));
  }, [loaded, session, role, router]);

  if (!loaded || !session || session.role !== role) {
    return <div className="min-h-dvh bg-slate-50 dark:bg-slate-950" />;
  }

  const company = companies.find((c) => c.id === session.companyId);
  return (
    <StaffContext.Provider value={{ userId: session.userId, userName: session.name || session.email }}>
      <AppShell
        nav={nav}
        orgName={company?.name ?? ''}
        userName={session.name || session.email}
        roleLabel={t(`role.${role}` as DictKey)}
        onLogout={logout}
      >
        {children}
      </AppShell>
    </StaffContext.Provider>
  );
}
