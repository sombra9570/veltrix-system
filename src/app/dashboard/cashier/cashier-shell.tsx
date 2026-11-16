'use client';
import { StaffProvider } from '../staff-context';
import { ROLE_NAV } from '../role-nav';


export function CashierLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider role="cashier" nav={ROLE_NAV.cashier}>{children}</StaffProvider>;
}
