'use client';
import { StaffProvider } from '../staff-context';
import { ROLE_NAV } from '../role-nav';


export function StorekeeperLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="storekeeper" nav={ROLE_NAV.storekeeper}>{children}</StaffProvider>;
}
