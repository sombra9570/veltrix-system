'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import { useOwner } from '../owner-context';

export default function SupervisorsPage() {
  const { t } = useT();
  const { orgId } = useOwner();
  const [list, setList] = useState<{ membership_id: string; name: string; routes: string[] }[] | null>(null);
  useEffect(() => { if (orgId) rpc<{ membership_id: string; name: string; routes: string[] }[]>('owner_supervisors', { p_org: orgId }).then((r) => setList(r ?? [])).catch(() => setList([])); }, [orgId]);
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-extrabold sm:text-2xl">🧑‍💼 {t('nav.supervisors')}</h1>
      {list === null ? <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p> : list.length === 0 ? <Card><p className={`text-sm ${ui.muted}`}>{t('sv.none')}</p></Card> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => (
            <Link key={s.membership_id} href={`/dashboard/owner/supervisor?s=${s.membership_id}`} className="block">
              <Card className="transition hover:shadow-md"><p className="font-bold">🧑‍💼 {s.name}</p><p className={`text-xs ${ui.muted}`}>{t('sv.nRoutes', { n: s.routes.length })}</p></Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
