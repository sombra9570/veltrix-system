'use client';
import { StaffProvider } from '../staff-context';
import type { NavItem } from '../shell';

const NAV: NavItem[] = [
  { href: '/dashboard/waiter', icon: '🍽️', label: 'nav.tables' },
  { href: '/dashboard/waiter/mensajes', icon: '💬', label: 'nav.messages' },
];

export function WaiterLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="waiter" nav={NAV}>{children}</StaffProvider>;
}
