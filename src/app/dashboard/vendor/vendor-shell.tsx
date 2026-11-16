'use client';
import { StaffProvider } from '../staff-context';
import type { NavItem } from '../shell';

const NAV: NavItem[] = [
  { href: '/dashboard/vendor', icon: '🛒', label: 'nav.pos' },
  { href: '/dashboard/vendor/ventas', icon: '🧾', label: 'nav.mySales' },
  { href: '/dashboard/vendor/clientes', icon: '🤝', label: 'nav.customers' },
  { href: '/dashboard/vendor/mensajes', icon: '💬', label: 'nav.messages' },
];

export function VendorLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="vendor" nav={NAV}>{children}</StaffProvider>;
}
