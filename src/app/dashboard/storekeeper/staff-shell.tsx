'use client';
import { StaffProvider } from '../staff-context';
import type { NavItem } from '../shell';

const NAV: NavItem[] = [
  { href: '/dashboard/storekeeper', icon: '📦', label: 'nav.inventory' },
  { href: '/dashboard/storekeeper/mensajes', icon: '💬', label: 'nav.messages' },
];

export function StorekeeperLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="storekeeper" nav={NAV}>{children}</StaffProvider>;
}
