'use client';
import { StaffProvider } from '../staff-context';
import type { NavItem } from '../shell';

const NAV: NavItem[] = [
  { href: '/dashboard/accountant', icon: '📈', label: 'nav.reports' },
  { href: '/dashboard/accountant/ventas', icon: '🧾', label: 'nav.sales' },
  { href: '/dashboard/accountant/inventario', icon: '📦', label: 'nav.inventory' },
  { href: '/dashboard/accountant/clientes', icon: '🤝', label: 'nav.customers' },
  { href: '/dashboard/accountant/mensajes', icon: '💬', label: 'nav.messages' },
];

export function AccountantLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="accountant" nav={NAV}>{children}</StaffProvider>;
}
