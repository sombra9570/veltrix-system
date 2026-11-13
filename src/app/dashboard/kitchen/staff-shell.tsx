'use client';
import { StaffProvider } from '../staff-context';
import type { NavItem } from '../shell';

const NAV: NavItem[] = [
  { href: '/dashboard/kitchen', icon: '🔥', label: 'nav.kitchen' },
  { href: '/dashboard/kitchen/mensajes', icon: '💬', label: 'nav.messages' },
];

export function KitchenLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="kitchen" nav={NAV}>{children}</StaffProvider>;
}
