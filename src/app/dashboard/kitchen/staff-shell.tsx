'use client';
import { StaffProvider } from '../staff-context';
import { ROLE_NAV } from '../role-nav';


export function KitchenLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="kitchen" nav={ROLE_NAV.kitchen}>{children}</StaffProvider>;
}
