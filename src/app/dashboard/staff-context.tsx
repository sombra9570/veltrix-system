'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { rpc } from '../../lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import { useVeltrixAuth, homeForRole, UserRole } from '../auth-system';
import { AppShell, NavItem, navHas } from './shell';
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
  const [storeOk, setStoreOk] = useState(false);
  // Veltrix IA aparece en el menú solo si el usuario tiene el permiso (aunque le falte activar su acceso individual)
  const [aiOk, setAiOk] = useState(false);
  const uid = session?.userId;
  const cid = session?.companyId;
  useEffect(() => {
    if (!uid) return;
    rpc<string[]>('my_modules').then((m) => setModules(m ?? [])).catch(() => setModules([]));
  }, [uid]);
  // La tienda virtual solo aparece si el rubro la usa y el administrador le dio algún permiso de tienda a este usuario
  useEffect(() => {
    if (!uid || !cid) return;
    rpc<boolean>('my_store_access', { p_company: cid }).then((b) => setStoreOk(!!b)).catch(() => setStoreOk(false));
  }, [uid, cid]);
  useEffect(() => {
    if (!uid) return;
    rpc<{ allowed: boolean; reason?: string }>('ai_quota_status')
      .then((r) => setAiOk(!!r?.allowed || r?.reason === 'AI_ADDON_REQUIRED')).catch(() => setAiOk(false));
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
  const also = (session.alsoRoles ?? []).filter((r) => r !== session.role && !(session.role === 'manager' && r === 'supervisor'));
  const own = (ROLE_NAV as Record<string, NavItem[]>)[session.role] ?? nav;
  const menuRaw = also.length === 0 ? nav : (() => {
    const seen = new Set(own.map((n) => n.label));
    const extra: NavItem[] = [];
    for (const r of also) for (const n of ((ROLE_NAV as Record<string, NavItem[]>)[r] ?? [])) {
      if (n.label === 'nav.messages' || seen.has(n.label)) continue;
      seen.add(n.label); extra.push({ ...n, group: `role.${r}` as DictKey });
    }
    const chat = own.filter((n) => n.label === 'nav.messages');
    const mine = own.filter((n) => n.label !== 'nav.messages');
    // Con funciones de varios roles, el menú se separa por rol; con uno solo no hace falta
    if (extra.length === 0) return [...mine, ...chat];
    return [...mine.map((n) => ({ ...n, group: `role.${session.role}` as DictKey })), ...extra, ...chat];
  })();
  const menu = menuRaw.filter((n) => navHas(modules, n.module)).filter((n) => !n.href.endsWith('/tienda') || storeOk).filter((n) => !n.ai || aiOk)
    // Cada rol ve solo lo de su rubro. Supervisor de cobranza en calle: únicamente sus rutas, reportes, mensajes y ajustes
    // (lista cerrada, no de exclusión: así nada de otros rubros se cuela, ni siquiera mientras carga el rubro).
    .filter((n) => {
      if (session.role !== 'supervisor' && session.role !== 'manager') return true;
      if (modules === null) return false;
      const cobranza = modules.includes('field_collection') && !modules.some((m) => ['retail', 'restaurant', 'workshop'].includes(m));
      return !cobranza || ['/dashboard/supervisor', '/dashboard/supervisor/reportes', '/dashboard/supervisor/ia', '/dashboard/supervisor/mensajes', '/dashboard/supervisor/ajustes'].includes(n.href);

    })
    .map((n) => ((session.role === 'supervisor' || session.role === 'manager') && n.label === 'sup.navRoutes' && modules && !modules.some((m) => ['retail', 'restaurant', 'workshop'].includes(m)) ? { ...n, label: 'sup.navRoutesOnly' as DictKey } : n));

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

