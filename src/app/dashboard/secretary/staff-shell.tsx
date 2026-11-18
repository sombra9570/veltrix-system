'use client';
import { StaffProvider } from '../staff-context';
import { ROLE_NAV } from '../role-nav';

export function SecretaryLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="secretary" nav={ROLE_NAV.secretary}>{children}</StaffProvider>;
}
