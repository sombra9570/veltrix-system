'use client';
import { StaffProvider } from '../staff-context';
import { ROLE_NAV } from '../role-nav';


export function WaiterLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="waiter" nav={ROLE_NAV.waiter}>{children}</StaffProvider>;
}
