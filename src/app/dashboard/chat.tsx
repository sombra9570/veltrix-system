'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, rpc } from '../../lib/supabase';
import { Card } from './shell';
import { ui } from '../site-header';
import { useSync } from './sync';
import { useT } from '../i18n';
import type { DictKey } from '../i18n/es';
import { compressImage, extFor } from './image';
import { useLive } from './live';
import { IconBack } from '../icons';

type Channel = { id: string; kind: 'announce' | 'branch' | 'direct'; name: string | null; can_post: boolean; last_at: string | null; last: string | null; unread: number };
type Msg = { id: string; at: string; body: string | null; photo: string | null; sender_id: string; sender: string; client_id: string | null; pending?: boolean };
type Person = { id: string; name: string; roles: string[] };

const BUCKET = 'chat-files';

/** Mensajería del equipo: avisos, canal de sucursal y mensajes directos, en vivo. */
export function ChatScreen() {
  const { t, lang } = useT();
  const [me, setMe] = useState<{ id: string; org: string } | null>(null);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [active, setActive] = useState<Channel | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [picking, setPicking] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [days, setDays] = useState<number | null>(null);
  // Conversación que se está abriendo: evita mostrar mensajes de la anterior y descarta respuestas tardías
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const openId = useRef<string | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const names = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: p } = await supabase.from('profiles').select('org_id, full_name').eq('id', u.user.id).single();
      setMe({ id: u.user.id, org: p?.org_id ?? '' });
      if (p?.org_id) {
        const { data: o } = await supabase.from('organizations').select('plans(chat_retention_days)').eq('id', p.org_id).single();
        const pl = (o as { plans?: { chat_retention_days?: number } | { chat_retention_days?: number }[] | null } | null)?.plans;
        const d = Array.isArray(pl) ? pl[0]?.chat_retention_days : pl?.chat_retention_days;
        if (d) setDays(d);
      }
      names.current.set(u.user.id, p?.full_name ?? '');
      const ppl = await rpc<Person[]>('chat_people').catch(() => []);
      setPeople(ppl ?? []);
      (ppl ?? []).forEach((x) => names.current.set(x.id, x.name));
    })();
  }, []);

  const loadChannels = useCallback(async () => {
    try { setChannels(await rpc<Channel[]>('chat_channels_list') ?? []); } catch { setChannels((c) => c ?? []); }
  }, []);
  useEffect(() => {
    loadChannels();
  }, [loadChannels]);
  useSync(loadChannels, 0);
  useLive('chat', loadChannels);

  // Enlaces temporales para ver fotos privadas
  const signPhotos = useCallback(async (list: Msg[]) => {
    const paths = list.map((m) => m.photo).filter((p): p is string => !!p && !photos[p]);
    if (!paths.length) return;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
    const add: Record<string, string> = {};
    (data ?? []).forEach((d) => { if (d.path && d.signedUrl) add[d.path] = d.signedUrl; });
    setPhotos((p) => ({ ...p, ...add }));
  }, [photos]);

  const openChannel = useCallback(async (c: Channel) => {
    const same = openId.current === c.id;
    openId.current = c.id;
    setActive(c);
    setPicking(false);
    setErr('');
    if (!same) { setMsgs([]); setText(''); setLoadingMsgs(true); }
    try {
      const h = await rpc<Msg[]>('chat_history', { p_channel: c.id, p_before: null, p_limit: 60 });
      if (openId.current !== c.id) return;
      setMsgs(h ?? []);
      signPhotos(h ?? []);
      await rpc('chat_mark_read', { p_channel: c.id });
      setChannels((list) => list?.map((x) => (x.id === c.id ? { ...x, unread: 0 } : x)) ?? list);
    } catch { if (openId.current === c.id) setErr(t('err.generic')); }
    finally { if (openId.current === c.id) setLoadingMsgs(false); }
  }, [signPhotos, t]);

  // Mensajes nuevos en vivo
  useEffect(() => {
    if (!active) return;
    const sub = supabase
      .channel(`chat-${active.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${active.id}` },
        (payload) => {
          const r = payload.new as { id: string; created_at: string; body: string | null; photo_path: string | null; sender_id: string; client_id: string | null };
          const m: Msg = { id: r.id, at: r.created_at, body: r.body, photo: r.photo_path, sender_id: r.sender_id, sender: names.current.get(r.sender_id) ?? '', client_id: r.client_id };
          setMsgs((list) => (list.some((x) => x.id === m.id || (m.client_id && x.client_id === m.client_id))
            ? list.map((x) => (m.client_id && x.client_id === m.client_id ? m : x))
            : [...list, m]));
          signPhotos([m]);
          rpc('chat_mark_read', { p_channel: active.id }).catch(() => {});
        })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [active, signPhotos]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length]);

  const send = async (photoFile?: File) => {
    if (!active || !me || (!text.trim() && !photoFile)) return;
    setBusy(true);
    setErr('');
    const clientId = crypto.randomUUID();
    const body = text.trim();
    // aparece al instante; se confirma cuando llega del servidor
    setMsgs((l) => [...l, { id: clientId, at: new Date().toISOString(), body: body || null, photo: null, sender_id: me.id, sender: names.current.get(me.id) ?? '', client_id: clientId, pending: true }]);
    setText('');
    try {
      let path: string | null = null;
      if (photoFile) {
        const blob = await compressImage(photoFile, 1280, 0.75);
        path = `${me.org}/${active.id}/${clientId}.${extFor(blob)}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
        if (error) throw new Error(error.message);
      }
      await rpc('chat_send', { p_channel: active.id, p_body: body, p_photo_path: path, p_client_id: clientId });
      setMsgs((l) => l.map((x) => (x.client_id === clientId ? { ...x, pending: false, photo: path } : x)));
      if (path) signPhotos([{ id: clientId, photo: path } as Msg]);
    } catch {
      setMsgs((l) => l.filter((x) => x.client_id !== clientId));
      setText(body);
      setErr(navigator.onLine ? t('chat.sendFailed') : t('chat.offline'));
    } finally {
      setBusy(false);
    }
  };

  const startDirect = async (p: Person) => {
    try {
      const id = await rpc<string>('chat_open_direct', { p_user: p.id });
      await loadChannels();
      openChannel({ id, kind: 'direct', name: p.name, can_post: true, last_at: null, last: null, unread: 0 });
    } catch { setErr(t('err.generic')); }
  };

  const title = (c: Channel) => c.kind === 'announce' ? `📣 ${t('chat.announce')}` : c.kind === 'branch' ? `🏬 ${c.name ?? ''}` : `💬 ${c.name ?? ''}`;
  const roleLabel = (r: string) => t(`role.${r}` as DictKey);
  const day = (iso: string) => new Date(iso).toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = (iso: string) => new Date(iso).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });

  const grouped = useMemo(() => {
    const out: { day: string; items: Msg[] }[] = [];
    msgs.forEach((m) => {
      const d = day(m.at);
      if (!out.length || out[out.length - 1].day !== d) out.push({ day: d, items: [m] });
      else out[out.length - 1].items.push(m);
    });
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs, lang]);

  if (channels === null) return <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>;

  return (
    <div className="grid h-[calc(100dvh-9rem)] min-h-[28rem] gap-4 lg:grid-cols-3">
      {/* Conversaciones */}
      <Card className={`flex min-h-0 flex-col !p-0 overflow-hidden ${active ? 'max-lg:hidden' : ''}`}>
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
          <h1 className="text-lg font-extrabold">💬 {t('chat.title')}</h1>
          <button type="button" onClick={() => setPicking(!picking)} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>+ {t('chat.new')}</button>
        </div>
        {days !== null && <p className={`border-b border-slate-200 p-3 text-xs ${ui.muted} dark:border-slate-800`}>ℹ️ {t('chat.retention', { n: days })}</p>}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {picking ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {people.length === 0 && <li className={`p-4 text-sm ${ui.muted}`}>{t('chat.noPeople')}</li>}
              {people.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => startDirect(p)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50 cursor-pointer dark:hover:bg-slate-800/50">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-100 font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{p.name.charAt(0).toUpperCase()}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className={`block truncate text-xs ${ui.muted}`}>{p.roles.map(roleLabel).join(', ')}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {channels.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => openChannel(c)}
                    className={`flex w-full items-center gap-3 p-3 text-left transition cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 ${active?.id === c.id ? 'bg-blue-50 dark:bg-blue-500/10' : ''}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{title(c)}</span>
                      <span className={`block truncate text-xs ${ui.muted}`}>{c.last ?? t('chat.empty')}</span>
                    </span>
                    {c.unread > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-blue-600 px-1.5 text-xs font-bold text-white">{c.unread}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Conversación abierta */}
      <Card className={`flex min-h-0 flex-col !p-0 overflow-hidden lg:col-span-2 ${active ? '' : 'max-lg:hidden'}`}>
        {!active ? (
          <div className={`grid flex-1 place-items-center p-6 text-center text-sm ${ui.muted}`}>{t('chat.pick')}</div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-slate-200 p-3 dark:border-slate-800">
              <button type="button" onClick={() => { openId.current = null; setActive(null); setMsgs([]); setLoadingMsgs(false); }} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 lg:hidden cursor-pointer dark:border-slate-700"><IconBack /></button>
              <h2 className="min-w-0 flex-1 truncate font-bold">{title(active)}</h2>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {loadingMsgs && msgs.length === 0 && <p className={`py-8 text-center text-sm ${ui.muted}`}>{t('common.wait')}</p>}
              {!loadingMsgs && msgs.length === 0 && <p className={`py-8 text-center text-sm ${ui.muted}`}>{t('chat.empty')}</p>}
              {grouped.map((g) => (
                <div key={g.day} className="space-y-2">
                  <p className={`text-center text-[11px] font-semibold uppercase ${ui.muted}`}>{g.day}</p>
                  {g.items.map((m) => {
                    const mine = m.sender_id === me?.id;
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm sm:max-w-[70%] ${mine ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800'} ${m.pending ? 'opacity-60' : ''}`}>
                          {!mine && active.kind !== 'direct' && <p className="mb-0.5 text-xs font-bold text-blue-700 dark:text-blue-300">{m.sender}</p>}
                          {m.photo && photos[m.photo] && (
                            <a href={photos[m.photo]} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={photos[m.photo]} alt="" className="mb-1 max-h-72 rounded-xl object-cover" loading="lazy" />
                            </a>
                          )}
                          {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                          <p className={`mt-0.5 text-right text-[10px] ${mine ? 'text-blue-100' : ui.muted}`}>{m.pending ? '…' : time(m.at)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div ref={bottom} />
            </div>
            {err && <p className="px-3 text-sm font-semibold text-red-600 dark:text-red-400">{err}</p>}
            {active.can_post ? (
              <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
                <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-slate-300 dark:border-slate-700" aria-label={t('chat.photo')}>
                  📷
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) send(f); }} />
                </label>
                <textarea value={text} rows={1} maxLength={2000} placeholder={t('chat.write')}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  className={`${ui.input} max-h-32 min-h-11 resize-none`} />
                <button type="submit" disabled={busy || !text.trim()} className={`${ui.btnPrimary} h-11 shrink-0`}>➤</button>
              </form>
            ) : (
              <p className={`border-t border-slate-200 p-3 text-center text-xs ${ui.muted} dark:border-slate-800`}>{t('chat.readOnly')}</p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
