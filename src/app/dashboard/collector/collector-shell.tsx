'use client';
import { StaffProvider } from '../staff-context';
import { ROLE_NAV } from '../role-nav';


export function CollectorLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="collector" nav={ROLE_NAV.collector}>{children}</StaffProvider>;
}
