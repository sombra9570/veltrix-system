'use client';
import { StaffProvider } from '../staff-context';
import { ROLE_NAV } from '../role-nav';


export function SupervisorLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="supervisor" nav={ROLE_NAV.supervisor}>{children}</StaffProvider>;
}
