'use client';
import { StaffProvider } from '../staff-context';
import type { NavItem } from '../shell';

const NAV: NavItem[] = [
  { href: '/dashboard/workshop', icon: '🔧', label: 'nav.workshop' },
];

export function WorkshopLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="technician" nav={NAV}>{children}</StaffProvider>;
}
