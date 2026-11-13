'use client';
import { StaffProvider } from '../staff-context';
import type { NavItem } from '../shell';

const NAV: NavItem[] = [
  { href: '/dashboard/vendor', icon: '🛒', label: 'nav.pos' },
];

export function VendorLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="vendor" nav={NAV}>{children}</StaffProvider>;
}
