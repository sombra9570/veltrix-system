'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOwner, friendlyError } from '../owner-context';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { rpc } from '../../../../lib/supabase';
import { useT } from '../../../i18n';
import type { DictKey } from '../../../i18n/es';
import { Sheet } from '../../sheet';

type Ticket = { id: string; subject: string; status: 'open' | 'answered' | 'closed'; updated_at: string; last: string | null };
type Thread = { ticket: { id: string; subject: string; status: Ticket['status'] }; messages: { id: string; kind: 'customer' | 'staff'; body: string; at: string; by: string | null }[] };

export default function HelpPage() {
  const { orgId } = useOwner();
  const { t } = useT();
  const [list, setList] = useState<Ticket[]>([]);
  const [sel, setSel] = useState<Thread | null>(null);
  const [form, setForm] = useState<{ subject: string; body: string } | null>(null);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fail = (e: unknown) => setMsg({ ok: false, text: /TICKETS_LIMIT/.test(e instanceof Error ? e.message : '') ? t('help.limit') : friendlyError(e instanceof Error ? e.message : '', t) });

  const load = useCallback(async () => {
    if (!orgId) return;
    try { setList((await rpc<Ticket[]>('support_my_tickets', { p_org: orgId })) ?? []); } catch (e) { fail(e); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  const open = async (id: string) => { try { setSel(await rpc<Thread>('support_thread', { p_id: id })); } catch (e) { fail(e); } };
  const create = async () => {
    if (!form || !form.subject.trim() || !form.body.trim()) return;
    setBusy(true); setMsg(null);
    try { await rpc('support_open', { p_org: orgId, p_subject: form.subject, p_body: form.body, p_priority: 'normal' }); setForm(null); setMsg({ ok: true, text: t('help.sent') }); await load(); }
    catch (e) { fail(e); }
    setBusy(false);
  };
  const reply = async () => {
    if (!sel || !text.trim()) return;
    setBusy(true);
    try { await rpc('support_reply', { p_id: sel.ticket.id, p_body: text, p_internal: false }); setText(''); await open(sel.ticket.id); await load(); } catch (e) { fail(e); }
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold sm:text-2xl">🎧 {t('help.title')}</h1>
          <p className={`text-sm ${ui.muted}`}>{t('help.sub')}</p>
        </div>
        <button type="button" className={ui.btnPrimary} onClick={() => { setMsg(null); setForm({ subject: '', body: '' }); }}>+ {t('help.new')}</button>
      </div>
      {msg && (
        <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
          : 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400'}`}>{msg.text}</p>
      )}
      {list.length === 0 ? <Card><p className={`text-sm ${ui.muted}`}>{t('help.empty')}</p></Card> : (
        <ul className="space-y-3">
          {list.map((tk) => (
            <li key={tk.id}>
              <Card>
                <button type="button" className="flex w-full items-start justify-between gap-3 text-start cursor-pointer" onClick={() => open(tk.id)}>
                  <div className="min-w-0">
                    <p className="font-bold break-words">{tk.subject}</p>
                    <p className={`text-xs ${ui.muted} break-words`}>{tk.last}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold dark:bg-slate-800">{t(`help.st.${tk.status}` as DictKey)}</span>
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {form && (
        <Sheet onClose={() => setForm(null)} label={t('pos.close')}>
          <h2 className="text-lg font-extrabold">{t('help.new')}</h2>
          <div className="mt-3 space-y-4">
            <div><label className={ui.label}>{t('help.subject')}</label><input className={ui.input} maxLength={160} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
            <div><label className={ui.label}>{t('help.body')}</label><textarea className={ui.input} rows={5} maxLength={4000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
            <button type="button" disabled={busy} className={ui.btnPrimary} onClick={create}>{t('help.send')}</button>
          </div>
        </Sheet>
      )}

      {sel && (
        <Sheet onClose={() => setSel(null)} label={t('pos.close')}>
          <h2 className="text-lg font-extrabold break-words">{sel.ticket.subject}</h2>
          <ul className="mt-3 max-h-[45vh] space-y-2 overflow-y-auto">
            {sel.messages.map((m) => (
              <li key={m.id} className={`rounded-xl p-3 text-sm ${m.kind === 'staff' ? 'bg-sky-50 dark:bg-sky-500/10' : 'bg-slate-100 dark:bg-slate-800'}`}>
                <p className={`text-[11px] font-bold ${ui.muted}`}>{m.kind === 'staff' ? t('help.team') : t('help.you')} · {new Date(m.at).toLocaleString()}</p>
                <p className="mt-1 whitespace-pre-wrap break-words">{m.body}</p>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-2">
            <textarea className={ui.input} rows={3} maxLength={4000} value={text} placeholder={t('help.replyPh')} onChange={(e) => setText(e.target.value)} />
            <button type="button" disabled={busy || !text.trim()} className={ui.btnPrimary} onClick={reply}>{t('help.reply')}</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
