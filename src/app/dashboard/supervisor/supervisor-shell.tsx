'use client';
import { StaffProvider } from '../staff-context';
import type { NavItem } from '../shell';

const NAV: NavItem[] = [
  { href: '/dashboard/supervisor', icon: '🛵', label: 'sup.navRoutes' },
  { href: '/dashboard/supervisor/prestamos', icon: '💸', label: 'nav.loans' },
  { href: '/dashboard/supervisor/mensajes', icon: '💬', label: 'nav.messages' },
];

export function SupervisorLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="supervisor" nav={NAV}>{children}</StaffProvider>;
}
