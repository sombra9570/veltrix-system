'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { rpc } from '../../lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import { useVeltrixAuth, homeForRole, UserRole } from '../auth-system';
import { AppShell, NavItem } from './shell';
import { ROLE_NAV } from './role-nav';
import { Spinner, NoAccess } from '../spinner';
export { Spinner, NoAccess };
import { useT } from '../i18n';
import type { DictKey } from '../i18n/es';

type Ctx = { userId: string; userName: string; modules: string[] | null };
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
  // Rubros activos de la empresa: lo que no ocupa no aparece en el menú
  const [modules, setModules] = useState<string[] | null>(null);
  const uid = session?.userId;
  useEffect(() => {
    if (!uid) return;
    rpc<string[]>('my_modules').then((m) => setModules(m ?? [])).catch(() => setModules([]));
  }, [uid]);
  // Panel al que pertenece este usuario; si apunta aquí mismo (o a ingresar con sesión) no se redirige: evita bucles
  const target = session ? homeForRole(session.role) : '/ingresar';
  // Un rol propio también cubre las funciones de otros roles: puede entrar a sus pantallas
  const covers = !!session && (session.role === role || (session.alsoRoles ?? []).includes(role));
  const loop = !!session && !covers && (pathname.startsWith(target) || target === '/ingresar');

  useEffect(() => {
    if (!loaded) return;
    if (!session) router.replace('/ingresar');
    else if (!covers && !loop) router.replace(target);
  }, [loaded, session, role, router, target, loop, covers]);

  if (loop) return <NoAccess onLogout={logout} text={t('owner.notOwner')} button={t('shell.logout')} />;
  if (!loaded || !session || !covers) {
    return <div className="grid min-h-dvh place-items-center bg-slate-50 dark:bg-slate-950"><Spinner /></div>;
  }

  // Menú: el de su rol principal + las pantallas de los roles que cubre (sin repetir ni duplicar mensajes)
  const also = (session.alsoRoles ?? []).filter((r) => r !== session.role);
  const own = (ROLE_NAV as Record<string, NavItem[]>)[session.role] ?? nav;
  const menu = also.length === 0 ? nav : (() => {
    const seen = new Set(own.map((n) => n.label));
    const extra: NavItem[] = [];
    for (const r of also) for (const n of ((ROLE_NAV as Record<string, NavItem[]>)[r] ?? [])) {
      if (n.label === 'nav.messages' || seen.has(n.label)) continue;
      seen.add(n.label); extra.push(n);
    }
    const chat = own.filter((n) => n.label === 'nav.messages');
    return [...own.filter((n) => n.label !== 'nav.messages'), ...extra, ...chat];
  })().filter((n) => !n.module || (modules ?? []).includes(n.module));

  const company = companies.find((c) => c.id === session.companyId);
  return (
    <StaffContext.Provider value={{ userId: session.userId, userName: session.name || session.email, modules }}>
      <AppShell
        nav={menu}
        orgName={company?.name ?? ''}
        userName={session.name || session.email}
        roleLabel={t(`role.${session.role}` as DictKey)}
        onLogout={logout}
      >
        {children}
      </AppShell>
    </StaffContext.Provider>
  );
}

