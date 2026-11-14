'use client';
import { createContext, useContext, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useVeltrixAuth, homeForRole, UserRole } from '../auth-system';
import { AppShell, NavItem } from './shell';
import { Spinner, NoAccess } from '../spinner';
export { Spinner, NoAccess };
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
  const pathname = usePathname();
  const { t } = useT();
  const { loaded, session, companies, logout } = useVeltrixAuth();
  // Panel al que pertenece este usuario; si apunta aquí mismo (o a ingresar con sesión) no se redirige: evita bucles
  const target = session ? homeForRole(session.role) : '/ingresar';
  const loop = !!session && session.role !== role && (pathname.startsWith(target) || target === '/ingresar');

  useEffect(() => {
    if (!loaded) return;
    if (!session) router.replace('/ingresar');
    else if (session.role !== role && !loop) router.replace(target);
  }, [loaded, session, role, router, target, loop]);

  if (loop) return <NoAccess onLogout={logout} text={t('owner.notOwner')} button={t('shell.logout')} />;
  if (!loaded || !session || session.role !== role) {
    return <div className="grid min-h-dvh place-items-center bg-slate-50 dark:bg-slate-950"><Spinner /></div>;
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

