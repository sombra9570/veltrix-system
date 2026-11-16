'use client';
import { StaffProvider } from '../staff-context';
import { ROLE_NAV } from '../role-nav';


export function WorkshopLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="technician" nav={ROLE_NAV.technician}>{children}</StaffProvider>;
}
