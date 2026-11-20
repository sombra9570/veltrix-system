'use client';
// Cobranza: reportes enviados del supervisor. Otros rubros: misma pantalla del dueño (lo que puede ver lo decide el servidor)
import { useEffect, useState } from 'react';
import { rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import { useStaff } from '../../staff-context';
import OwnerReports from '../../owner/reportes/page';

type Item = { id: string; at: string; route: string; body: string; kind?: string };

function SupReports() {
  const { t, lang } = useT();
  const [list, setList] = useState<Item[] | null>(null);
  useEffect(() => { rpc<{ sent: Item[] }>('sup_reports').then((d) => setList(d.sent ?? [])).catch(() => setList([])); }, []);
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-xl font-extrabold">📈 {t('rep.sent')}{list ? ` · ${list.length}` : ''}</h1>
      {!list ? <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p> : list.length === 0 ? <Card><p className={`text-sm ${ui.muted}`}>{t('rep.none')}</p></Card> : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id}>
              <Card className="space-y-1">
                <p className="text-xs font-bold">🛵 {r.route} · <span className={ui.muted}>{new Date(r.at).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' })}</span></p>
                <p className="whitespace-pre-wrap text-sm">{r.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Page() {
  const { modules } = useStaff();
  const { t } = useT();
  if (modules === null) return <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>;
  const cobranza = modules.includes('field_collection') && !modules.some((m) => ['retail', 'restaurant', 'workshop'].includes(m));
  return cobranza ? <SupReports /> : <OwnerReports />;
}
