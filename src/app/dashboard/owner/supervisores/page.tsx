'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import { useOwner } from '../owner-context';

type Rating = { id: string; period: string; collector: string | null; rated_by: string | null; route: string | null; overall: number; punctuality: number; temperament: number; efficiency: number; responsibility: number; communication: number; condition: number; vehicle_care: number; notes: string | null };
const RATING_COLS = [['punctuality', 'cr.punctuality'], ['temperament', 'cr.temperament'], ['efficiency', 'cr.efficiency'], ['responsibility', 'cr.responsibility'], ['communication', 'cr.communication'], ['condition', 'cr.condition'], ['vehicle_care', 'cr.vehicle']] as const;

export default function SupervisorsPage() {
  const { t } = useT();
  const { orgId } = useOwner();
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [list, setList] = useState<{ membership_id: string; name: string; routes: string[] }[] | null>(null);
  useEffect(() => { if (orgId) rpc<{ membership_id: string; name: string; routes: string[] }[]>('owner_supervisors', { p_org: orgId }).then((r) => setList(r ?? [])).catch(() => setList([])); }, [orgId]);
  useEffect(() => { if (orgId) rpc<Rating[]>('owner_collector_ratings', { p_org: orgId }).then((r) => setRatings(r ?? [])).catch(() => setRatings([])); }, [orgId]);
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
      <h2 className="pt-2 text-lg font-extrabold">⭐ {t('cr.title')}</h2>
      {ratings.length === 0 ? <Card><p className={`text-sm ${ui.muted}`}>{t('cr.empty')}</p></Card> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ratings.map((r) => (
            <Card key={r.id} className="space-y-1">
              <p className="font-bold">🛵 {r.collector ?? '—'} · {r.period.slice(0, 7)}</p>
              <p className={`text-xs ${ui.muted}`}>{r.route ?? ''}{r.rated_by ? ` · ${t('cr.by')} ${r.rated_by}` : ''}</p>
              <p className="text-sm font-semibold">{t('cr.overall')}: {'★'.repeat(r.overall)}<span className="text-slate-300 dark:text-slate-600">{'★'.repeat(5 - r.overall)}</span></p>
              <ul className="text-xs">
                {RATING_COLS.map(([k, label]) => <li key={k} className="flex justify-between"><span>{t(label)}</span><b>{r[k]}/5</b></li>)}
              </ul>
              {r.notes && <p className={`text-xs ${ui.muted}`}>{r.notes}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
