'use client';
import { StaffProvider } from '../staff-context';
import { ROLE_NAV } from '../role-nav';


export function AccountantLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="accountant" nav={ROLE_NAV.accountant}>{children}</StaffProvider>;
}
