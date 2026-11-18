'use client';
import { Reports, useStaffOrg } from '../informes';

export default function Page() {
  const orgId = useStaffOrg();
  return <Reports orgId={orgId} mode="write" />;
}
