'use client';
import { pushNotify } from '../../push-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { ui } from '../../site-header';
import { useT } from '../../i18n';

type Msg = { id: string; mine: boolean; body: string; at: string };
type Chat = { open: boolean; contact_pref: 'chat' | 'whatsapp'; store_name: string; store_whatsapp: string | null; messages: Msg[] };

/** Canal del pedido: solo existe mientras el pedido está en curso. El cliente elige hablar por mensaje directo o por WhatsApp. */
export function OrderChat({ requestId, ping }: { requestId: string; ping: number }) {
  const { t } = useT();
  const [c, setC] = useState<Chat | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('public_order_chat', { p_request: requestId });
    setC((data as Chat | null) ?? null);
  }, [requestId]);
  useEffect(() => { void load(); }, [load, ping]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [c?.messages.length]);

  const pref = async (p: 'chat' | 'whatsapp') => {
    setC((x) => (x ? { ...x, contact_pref: p } : x));
    await supabase.rpc('public_order_set_contact', { p_request: requestId, p_pref: p });
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('public_order_say', { p_request: requestId, p_body: text });
    setBusy(false);
    if (error) { setErr(/TOO_MANY/.test(error.message) ? t('dl.errMany') : /CHAT_CLOSED/.test(error.message) ? t('oc.closed') : t('err.generic')); return; }
    pushNotify(requestId, 'msg');
    setText(''); await load();
  };

  if (!c || (!c.open && c.messages.length === 0)) return null;
  const wa = c.store_whatsapp ? `https://wa.me/${c.store_whatsapp}?text=${encodeURIComponent(t('oc.waText', { store: c.store_name, id: requestId.slice(0, 4).toUpperCase() }))}` : null;
  return (
    <div className="space-y-3 border-t border-slate-200 pt-4 text-start dark:border-slate-800">
      <p className="text-sm font-bold">💬 {t('oc.title')}</p>
      {c.open && (
        <div className="grid grid-cols-2 gap-2">
          {(['chat', 'whatsapp'] as const).map((p) => (
            <button key={p} type="button" onClick={() => pref(p)}
              className={`rounded-xl border-2 py-2 text-xs font-bold cursor-pointer ${c.contact_pref === p ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-300 dark:border-slate-700'}`}>
              {p === 'chat' ? `💬 ${t('oc.prefChat')}` : `🟢 ${t('oc.prefWa')}`}
            </button>
          ))}
        </div>
      )}
      {c.contact_pref === 'whatsapp' && c.open && wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-bold text-white hover:brightness-95">🟢 {t('oc.openWa')}</a>
      ) : (
        <>
          <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl bg-slate-50 p-2 dark:bg-slate-800/50">
            {c.messages.length === 0 && <p className={`p-2 text-center text-xs ${ui.muted}`}>{t('oc.empty')}</p>}
            {c.messages.map((m) => (
              <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                <p className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm ${m.mine ? 'bg-blue-600 text-white' : 'bg-white shadow-sm dark:bg-slate-700'}`}>{m.body}</p>
              </div>
            ))}
            <div ref={end} />
          </div>
          {c.open ? (
            <form onSubmit={send} className="flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={t('oc.placeholder')} className={ui.input} />
              <button type="submit" disabled={busy || !text.trim()} className={`${ui.btnPrimary} shrink-0`}>➤</button>
            </form>
          ) : <p className={`text-center text-xs ${ui.muted}`}>{t('oc.closed')}</p>}
          {err && <p className="text-xs font-semibold text-red-600 dark:text-red-400">{err}</p>}
        </>
      )}
    </div>
  );
}
