'use client';
import { StaffProvider } from '../staff-context';
import type { NavItem } from '../shell';

const NAV: NavItem[] = [
  { href: '/dashboard/supervisor', icon: '🛵', label: 'sup.navRoutes' },
  { href: '/dashboard/supervisor/prestamos', icon: '💸', label: 'nav.loans' },
  { href: '/dashboard/supervisor/ventas', icon: '🧾', label: 'nav.sales' },
  { href: '/dashboard/supervisor/caja', icon: '💵', label: 'nav.cash' },
  { href: '/dashboard/supervisor/inventario', icon: '📦', label: 'nav.inventory' },
  { href: '/dashboard/supervisor/clientes', icon: '🤝', label: 'nav.customers' },
  { href: '/dashboard/supervisor/reportes', icon: '📈', label: 'nav.reports' },
  { href: '/dashboard/supervisor/mensajes', icon: '💬', label: 'nav.messages' },
];

export function SupervisorLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="supervisor" nav={NAV}>{children}</StaffProvider>;
}
