'use client';
import { Reports } from '../../informes';
import { useStaffOrg } from '../../informes';

export default function Page() {
  const orgId = useStaffOrg();
  return <Reports orgId={orgId} mode="review" />;
}
