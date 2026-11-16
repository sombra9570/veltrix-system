'use client';
import { StaffProvider } from '../staff-context';
import { ROLE_NAV } from '../role-nav';


export function VendorLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="vendor" nav={ROLE_NAV.vendor}>{children}</StaffProvider>;
}
