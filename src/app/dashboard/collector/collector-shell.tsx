'use client';
import { StaffProvider } from '../staff-context';
import type { NavItem } from '../shell';

const NAV: NavItem[] = [
  { href: '/dashboard/collector', icon: '🛵', label: 'nav.route' },
  { href: '/dashboard/collector/mensajes', icon: '💬', label: 'nav.messages' },
];

export function CollectorLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="collector" nav={NAV}>{children}</StaffProvider>;
}
