'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc, supabase } from '../../lib/supabase';
import { useVeltrixAuth } from '../auth-system';
import { Card } from './shell';
import { ui } from '../site-header';
import { useT } from '../i18n';
import type { DictKey } from '../i18n/es';
import { Sheet, isoDay } from './sheet';
import { friendlyError } from './owner/owner-context';

type Summary = {
  by_status: { status: string; n: number; amount: number }[];
  by_kind: { kind: string; n: number; amount: number }[];
  items: { kind: string; amount: number | null; reason: string | null; status: string; at: string; by: string | null; branch: string; note: string | null }[];
};
type Report = {
  id: string; kind: 'approvals' | 'period' | 'minutes' | 'free'; title: string; body: string; data: Partial<Summary>;
  from: string | null; to: string | null; target: 'admin' | 'board'; status: 'draft' | 'submitted' | 'approved' | 'observed';
  created_at: string; submitted_at: string | null; reviewed_at: string | null; note: string | null; author: string | null; mine: boolean;
};
type Form = { id: string | null; kind: Report['kind']; title: string; body: string; from: string; to: string; target: 'admin' | 'board'; data: Partial<Summary> };

const KINDS = ['approvals', 'period', 'minutes', 'free'] as const;
const STATUS_STYLE: Record<Report['status'], string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  submitted: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  observed: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};

/** Empresa (org) del usuario de un panel de trabajo */
export function useStaffOrg(): string {
  const { session } = useVeltrixAuth();
  const [org, setOrg] = useState('');
  useEffect(() => {
    if (!session?.userId) return;
    supabase.from('profiles').select('org_id').eq('id', session.userId).limit(1)
      .then(({ data }) => setOrg((data ?? [])[0]?.org_id ?? ''));
  }, [session?.userId]);
  return org;
}

function SummaryView({ s }: { s: Partial<Summary> }) {
  const { t } = useT();
  if (!s.by_status?.length && !s.items?.length) return <p className={`text-sm ${ui.muted}`}>{t('rep.noApprovals')}</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(s.by_status ?? []).map((x) => (
          <span key={x.status} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold dark:border-slate-700">
            {t(`rep.ap.${x.status}` as DictKey)}: {x.n}
          </span>
        ))}
      </div>
      {(s.items ?? []).length > 0 && (
        <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
          {(s.items ?? []).slice(0, 30).map((it, i) => (
            <li key={i} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="font-semibold">{it.kind.replace(/_/g, " ")} · {it.branch}</p>
                <p className={`text-xs ${ui.muted}`}>{it.by ?? ''} · {new Date(it.at).toLocaleDateString()}{it.reason ? ` · ${it.reason}` : ''}</p>
              </div>
              <div className="shrink-0 text-end">
                {it.amount != null && <p className="font-bold whitespace-nowrap">{Number(it.amount).toLocaleString()}</p>}
                <p className={`text-xs ${ui.muted}`}>{t(`rep.ap.${it.status}` as DictKey)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Reports({ orgId, mode, owner }: { orgId: string; mode: 'write' | 'review'; owner?: boolean }) {
  const { t } = useT();
  const [list, setList] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    try { setList((await rpc<Report[]>('reports_list', { p_org: orgId })) ?? []); } catch (e) { setMsg({ ok: false, text: friendlyError(e instanceof Error ? e.message : '', t) }); }
    setLoading(false);
  }, [orgId, t]);
  useEffect(() => { load(); }, [load]);

  const today = isoDay(new Date());
  const blank = (): Form => ({ id: null, kind: 'approvals', title: '', body: '', from: isoDay(new Date(Date.now() - 29 * 86_400_000)), to: today, target: 'admin', data: {} });

  const loadSummary = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      const s = await rpc<Summary>('approvals_summary', { p_org: orgId, p_from: edit.from, p_to: edit.to });
      setEdit({ ...edit, data: s ?? {} });
    } catch (e) { setMsg({ ok: false, text: friendlyError(e instanceof Error ? e.message : '', t) }); }
    setBusy(false);
  };

  const save = async (submit: boolean) => {
    if (!edit) return;
    if (!edit.title.trim()) { setMsg({ ok: false, text: t('rep.needTitle') }); return; }
    setBusy(true); setMsg(null);
    try {
      await rpc('report_save', {
        p_org: orgId, p_id: edit.id, p_kind: edit.kind, p_title: edit.title, p_body: edit.body,
        p_from: edit.kind === 'approvals' || edit.kind === 'period' ? edit.from : null,
        p_to: edit.kind === 'approvals' || edit.kind === 'period' ? edit.to : null,
        p_target: edit.target, p_data: edit.data, p_submit: submit,
      });
      setEdit(null); setMsg({ ok: true, text: submit ? t('rep.sent') : t('rep.saved') });
      await load();
    } catch (e) { setMsg({ ok: false, text: friendlyError(e instanceof Error ? e.message : '', t) }); }
    setBusy(false);
  };

  const review = async (r: Report, approve: boolean) => {
    setBusy(true); setMsg(null);
    try {
      await rpc('report_review', { p_id: r.id, p_approve: approve, p_note: note });
      setNote(''); setMsg({ ok: true, text: approve ? t('rep.approvedMsg') : t('rep.observedMsg') });
      await load();
    } catch (e) { setMsg({ ok: false, text: friendlyError(e instanceof Error ? e.message : '', t) }); }
    setBusy(false);
  };

  const canReview = (r: Report) => r.status === 'submitted' && (owner || r.target === 'board');
  const mineEditable = (r: Report) => mode === 'write' && r.mine && (r.status === 'draft' || r.status === 'observed');
  const pending = list.filter((r) => r.status === 'submitted').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold sm:text-2xl">📑 {t('nav.informes')}</h1>
          <p className={`text-sm ${ui.muted}`}>{mode === 'write' ? t('rep.subWrite') : t('rep.subReview')}</p>
        </div>
        {mode === 'write' && <button type="button" className={ui.btnPrimary} onClick={() => { setMsg(null); setEdit(blank()); }}>+ {t('rep.new')}</button>}
      </div>

      {mode === 'review' && pending > 0 && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          {t('rep.pendingN', { n: pending })}
        </p>
      )}
      {msg && (
        <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
          : 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400'}`}>{msg.text}</p>
      )}

      {loading ? <p className={ui.muted}>…</p> : list.length === 0 ? <Card><p className={`text-sm ${ui.muted}`}>{t('rep.empty')}</p></Card> : (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.id}>
              <Card>
                <button type="button" className="flex w-full items-start justify-between gap-3 text-start cursor-pointer" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <div className="min-w-0">
                    <p className="font-bold break-words">{r.title}</p>
                    <p className={`text-xs ${ui.muted}`}>
                      {t(`rep.kind.${r.kind}` as DictKey)} · {t(r.target === 'board' ? 'rep.toBoard' : 'rep.toAdmin')}
                      {r.author ? ` · ${r.author}` : ''} · {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[r.status]}`}>{t(`rep.st.${r.status}` as DictKey)}</span>
                </button>
                {open === r.id && (
                  <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                    {(r.from || r.to) && <p className={`text-xs ${ui.muted}`}>{r.from} → {r.to}</p>}
                    {r.body && <p className="whitespace-pre-wrap break-words text-sm">{r.body}</p>}
                    {r.kind === 'approvals' && <SummaryView s={r.data} />}
                    {r.note && <p className="rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-800"><b>{t('rep.note')}:</b> {r.note}</p>}
                    {canReview(r) && (
                      <div className="space-y-2">
                        <input className={ui.input} placeholder={t('rep.notePh')} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
                        <div className="flex gap-2">
                          <button type="button" disabled={busy} className={ui.btnPrimary} onClick={() => review(r, true)}>✓ {t('rep.approve')}</button>
                          <button type="button" disabled={busy} className={ui.btnGhost} onClick={() => review(r, false)}>{t('rep.observe')}</button>
                        </div>
                      </div>
                    )}
                    {mineEditable(r) && (
                      <button type="button" className={ui.btnGhost} onClick={() => { setMsg(null); setEdit({ id: r.id, kind: r.kind, title: r.title, body: r.body, from: r.from ?? today, to: r.to ?? today, target: r.target, data: r.data }); }}>
                        ✎ {t('rep.edit')}
                      </button>
                    )}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {edit && (
        <Sheet onClose={() => setEdit(null)} label={t('pos.close')}>
          <h2 className="text-lg font-extrabold">{edit.id ? t('rep.edit') : t('rep.new')}</h2>
          <div className="mt-3 space-y-4">
            <div>
              <label className={ui.label}>{t('rep.type')}</label>
              <select className={ui.input} value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as Report['kind'] })}>
                {KINDS.map((k) => <option key={k} value={k}>{t(`rep.kind.${k}` as DictKey)}</option>)}
              </select>
            </div>
            <div>
              <label className={ui.label}>{t('rep.title')}</label>
              <input className={ui.input} value={edit.title} maxLength={160} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </div>
            {(edit.kind === 'approvals' || edit.kind === 'period') && (
              <div className="grid grid-cols-2 gap-3">
                <div><label className={ui.label}>{t('rep.from')}</label><input type="date" className={ui.input} value={edit.from} onChange={(e) => setEdit({ ...edit, from: e.target.value })} /></div>
                <div><label className={ui.label}>{t('rep.to')}</label><input type="date" className={ui.input} value={edit.to} onChange={(e) => setEdit({ ...edit, to: e.target.value })} /></div>
              </div>
            )}
            {edit.kind === 'approvals' && (
              <div className="space-y-2">
                <button type="button" disabled={busy} className={ui.btnGhost} onClick={loadSummary}>⟳ {t('rep.loadApprovals')}</button>
                <SummaryView s={edit.data} />
              </div>
            )}
            <div>
              <label className={ui.label}>{t('rep.body')}</label>
              <textarea className={ui.input} rows={6} value={edit.body} maxLength={20000} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
            </div>
            <div>
              <label className={ui.label}>{t('rep.sendTo')}</label>
              <select className={ui.input} value={edit.target} onChange={(e) => setEdit({ ...edit, target: e.target.value as 'admin' | 'board' })}>
                <option value="admin">{t('rep.toAdmin')}</option>
                <option value="board">{t('rep.toBoard')}</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} className={ui.btnPrimary} onClick={() => save(true)}>{t('rep.send')}</button>
              <button type="button" disabled={busy} className={ui.btnGhost} onClick={() => save(false)}>{t('rep.saveDraft')}</button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
