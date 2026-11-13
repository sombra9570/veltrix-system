'use client';
import { StaffProvider } from '../staff-context';
import type { NavItem } from '../shell';

const NAV: NavItem[] = [
  { href: '/dashboard/cashier', icon: '💵', label: 'nav.cash' },
  { href: '/dashboard/cashier/mensajes', icon: '💬', label: 'nav.messages' },
];

export function CashierLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="cashier" nav={NAV}>{children}</StaffProvider>;
}
