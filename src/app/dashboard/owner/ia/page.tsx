'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, rpc } from '../../../../lib/supabase';
import { Card, UsageBar } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';
import type { DictKey } from '../../../i18n/es';

type Status = { allowed: boolean; quota?: number; used?: number; resets?: string };
type Turn = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS: DictKey[] = ['ai.s1', 'ai.s2', 'ai.s3', 'ai.s4', 'ai.s5', 'ai.s6'];

export default function AiPage() {
  const { t, lang } = useT();
  const [status, setStatus] = useState<Status | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const bottom = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try { setStatus(await rpc<Status>('ai_quota_status')); } catch { setStatus({ allowed: false }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns.length, busy]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setErr('');
    setBusy(true);
    setQ('');
    const history = turns.slice(-6);
    setTurns((x) => [...x, { role: 'user', content: text }]);
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify({ question: text, history, lang }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) setTurns((x) => [...x, { role: 'assistant', content: j.answer }]);
      else {
        setTurns((x) => x.slice(0, -1));
        setQ(text);
        const code = j.error as string;
        setErr(code === 'AI_QUOTA_DAY' ? t('ai.quotaDay')
          : code === 'AI_QUOTA_EXCEEDED' ? t('ai.quotaExceeded')
          : code === 'AI_NOT_ENABLED' ? t('ai.notEnabled')
          : code === 'AI_NOT_CONFIGURED' ? t('ai.notConfigured')
          : t('ai.failed'));
      }
    } catch {
      setTurns((x) => x.slice(0, -1));
      setQ(text);
      setErr(t('chat.offline'));
    } finally {
      setBusy(false);
      load();
    }
  };

  if (!status) return <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>;
  if (!status.allowed) return <Card><p className={`text-sm ${ui.muted}`}>{t('ai.onlyOwners')}</p></Card>;

  const quota = status.quota ?? 0;
  const used = status.used ?? 0;
  const left = Math.max(0, quota - used);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold sm:text-2xl">✨ Veltrix IA</h1>
          <p className={`text-sm ${ui.muted}`}>{t('ai.subtitle')}</p>
        </div>
      </div>

      {quota === 0 ? (
        <Card className="space-y-3">
          <h2 className="font-bold">{t('ai.offTitle')}</h2>
          <p className={`text-sm ${ui.muted}`}>{t('ai.offText')}</p>
          <ul className="list-disc space-y-1 ps-5 text-sm">
            {SUGGESTIONS.slice(0, 4).map((k) => <li key={k}>{t(k)}</li>)}
          </ul>
          <a href="mailto:hola@veltrixsystem.app?subject=Veltrix%20IA" className={`${ui.btnPrimary} w-full sm:w-auto`}>{t('ai.request')}</a>
        </Card>
      ) : (
        <>
          <Card className="!p-4">
            <UsageBar label={t('ai.usage')} used={used} max={quota} />
            {status.resets && <p className={`mt-1 text-xs ${ui.muted}`}>{t('ai.resets', { date: new Date(status.resets + 'T12:00:00').toLocaleDateString(lang) })}</p>}
          </Card>

          <Card className="flex min-h-[24rem] flex-col !p-0 overflow-hidden">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {turns.length === 0 && (
                <div className="space-y-3">
                  <p className={`text-sm ${ui.muted}`}>{t('ai.try')}</p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((k) => (
                      <button key={k} type="button" disabled={busy || left === 0} onClick={() => ask(t(k))}
                        className="rounded-full border border-slate-300 px-3 py-1.5 text-left text-sm transition hover:border-blue-400 cursor-pointer disabled:opacity-50 dark:border-slate-700">
                        {t(k)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {turns.map((x, i) => (
                <div key={i} className={`flex ${x.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm sm:max-w-[75%] ${
                    x.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
                    {x.content}
                    {x.role === 'assistant' && (
                      <button type="button" onClick={() => navigator.clipboard?.writeText(x.content)}
                        className={`mt-2 block text-xs font-semibold ${ui.muted} hover:underline cursor-pointer`}>
                        📋 {t('ai.copy')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {busy && <p className={`text-sm ${ui.muted}`}>✨ {t('ai.thinking')}</p>}
              <div ref={bottom} />
            </div>
            {err && <p className="px-4 text-sm font-semibold text-red-600 dark:text-red-400">{err}</p>}
            <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="flex items-end gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
              <textarea value={q} rows={1} maxLength={800} placeholder={left === 0 ? t('ai.quotaExceeded') : t('ai.placeholder')}
                disabled={left === 0}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(q); } }}
                className={`${ui.input} max-h-32 min-h-11 resize-none`} />
              <button type="submit" disabled={busy || !q.trim() || left === 0} className={`${ui.btnPrimary} h-11 shrink-0`}>➤</button>
            </form>
          </Card>
          <p className={`text-xs ${ui.muted}`}>🔒 {t('ai.privacy')}</p>
          <p className={`text-xs ${ui.muted}`}>⚠️ {t('ai.disclaimer')}</p>
        </>
      )}
    </div>
  );
}
