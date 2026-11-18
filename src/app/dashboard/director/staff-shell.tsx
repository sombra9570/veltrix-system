'use client';
import { StaffProvider } from '../staff-context';
import { ROLE_NAV } from '../role-nav';

export function DirectorLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="director" nav={ROLE_NAV.director}>{children}</StaffProvider>;
}
