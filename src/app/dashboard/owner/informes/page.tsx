'use client';
import { Reports } from '../../informes';
import { useOwner } from '../owner-context';

export default function Page() {
  const { orgId } = useOwner();
  return <Reports orgId={orgId} mode="review" owner />;
}
