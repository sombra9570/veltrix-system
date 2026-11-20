'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useVeltrixAuth } from '../../../auth-system';
import { rpc, supabase } from '../../../../lib/supabase';
import { Spinner } from '../../../spinner';
import { useLiveTopic } from '../../live';
import { PlatformBell } from '../platform-bell';
import { LeadsPanel } from '../leads-panel';

type Ticket = { id: string; subject: string; status: 'open' | 'answered' | 'closed'; priority: string; updated_at: string; assigned_to: string | null; assigned_name: string | null; org: string | null; plan: string | null; mine: boolean };
type Thread = {
  ticket: { id: string; subject: string; status: Ticket['status']; priority: string; created_at: string; assigned_to: string | null; assigned_name: string | null; org: string | null; plan: string | null; opener: string | null };
  messages: { id: string; kind: 'customer' | 'staff'; body: string; internal: boolean; at: string; by: string | null }[];
};
type Staff = { user_id: string; name: string; email: string; func: string; can_reply: boolean; can_assign: boolean; can_see_orgs: boolean; is_active: boolean };
type Contact = { id: string; name: string; func: string; unread: number };
type Chat = { id: string; mine: boolean; body: string; at: string };

const FUNCS: Record<string, string> = { support: 'Atención al cliente', technical: 'Soporte técnico', billing: 'Cobros y facturación', sales: 'Ventas' };
const ST: Record<Ticket['status'], { label: string; cls: string }> = {
  open: { label: 'Por atender', cls: 'bg-amber-500/15 text-amber-300' },
  answered: { label: 'Respondido', cls: 'bg-sky-500/15 text-sky-300' },
  closed: { label: 'Cerrado', cls: 'bg-slate-700 text-slate-300' },
};
const card = 'rounded-2xl border border-slate-800 bg-slate-900 p-4';
const input = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-500';
const btn = 'rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-50 cursor-pointer';
const ghost = 'rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 cursor-pointer';
const err = (e: unknown) => (e instanceof Error ? e.message : 'Error').replace(/^.*PERM_DENIED.*$/, 'No tienes permiso para esto.');

export default function SupportPage() {
  const router = useRouter();
  const { loaded, session, logout } = useVeltrixAuth();
  const isAdmin = session?.role === 'superadmin';
  const [tab, setTab] = useState<'tickets' | 'leads' | 'team' | 'chat'>('tickets');
  useEffect(() => { try { if (new URLSearchParams(window.location.search).get('tab') === 'leads') setTab('leads'); } catch { /* */ } }, []);

  useEffect(() => {
    if (loaded && (!session || (session.role !== 'superadmin' && session.role !== 'support'))) router.replace('/');
  }, [loaded, session, router]);

  if (!loaded || !session || (session.role !== 'superadmin' && session.role !== 'support')) {
    return <div className="grid min-h-dvh place-items-center bg-slate-950"><Spinner /></div>;
  }

  const tabs: [typeof tab, string][] = [['tickets', '🎫 Tickets'], ['leads', '🆘 Solicitudes']];
  if (isAdmin) tabs.push(['team', '👥 Equipo']);
  tabs.push(['chat', '💬 Chat directo']);

  return (
    <main className="min-h-dvh bg-slate-950 px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-white md:p-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-extrabold">🎧 Servicio al cliente</h1>
            <p className="text-xs text-slate-400">{session.name} · {isAdmin ? 'Superadmin' : 'Equipo de la plataforma'}</p>
          </div>
          <div className="flex gap-2">
            <PlatformBell />
            {isAdmin && <Link href="/dashboard/admin" className={ghost}>← Consola</Link>}
            <button type="button" onClick={logout} className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400 cursor-pointer">Cerrar sesión</button>
          </div>
        </header>

        <nav className="flex gap-2">
          {tabs.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`rounded-full border px-4 py-1.5 text-sm font-bold cursor-pointer ${tab === k ? 'border-sky-500 bg-sky-600' : 'border-slate-700'}`}>{l}</button>
          ))}
        </nav>

        {tab === 'tickets' && <Tickets myId={session.userId} />}
        {tab === 'leads' && <LeadsPanel />}
        {tab === 'team' && isAdmin && <Team />}
        {tab === 'chat' && <ChatTab />}
      </div>
    </main>
  );
}

function Tickets({ myId }: { myId: string }) {
  const [list, setList] = useState<Ticket[]>([]);
  const [filter, setFilter] = useState<'all' | Ticket['status'] | 'mine'>('open');
  const [sel, setSel] = useState<Thread | null>(null);
  const [staff, setStaff] = useState<Contact[]>([]);
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setList((await rpc<Ticket[]>('support_inbox', {})) ?? []); } catch (e) { setMsg(err(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { rpc<Contact[]>('platform_chat_contacts').then((c) => setStaff(c ?? [])).catch(() => undefined); }, []);

  const open = async (id: string) => {
    setMsg('');
    try { setSel(await rpc<Thread>('support_thread', { p_id: id })); } catch (e) { setMsg(err(e)); }
  };
  const reply = async () => {
    if (!sel || !text.trim()) return;
    setBusy(true); setMsg('');
    try { await rpc('support_reply', { p_id: sel.ticket.id, p_body: text, p_internal: internal }); setText(''); await open(sel.ticket.id); await load(); }
    catch (e) { setMsg(err(e)); }
    setBusy(false);
  };
  const setStatus = async (status: Ticket['status']) => {
    if (!sel) return;
    setBusy(true);
    try { await rpc('support_set', { p_id: sel.ticket.id, p_status: status }); await open(sel.ticket.id); await load(); } catch (e) { setMsg(err(e)); }
    setBusy(false);
  };
  const assign = async (to: string) => {
    if (!sel) return;
    setBusy(true);
    try { await rpc('support_set', { p_id: sel.ticket.id, p_assign: to || null, p_unassign: !to }); await open(sel.ticket.id); await load(); } catch (e) { setMsg(err(e)); }
    setBusy(false);
  };

  const shown = list.filter((t) => filter === 'all' || (filter === 'mine' ? t.mine : t.status === filter));
  const counts = { open: list.filter((t) => t.status === 'open').length };

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,20rem)_1fr]">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {([['open', `Por atender (${counts.open})`], ['answered', 'Respondidos'], ['mine', 'Míos'], ['closed', 'Cerrados'], ['all', 'Todos']] as [typeof filter, string][]).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 text-xs font-bold cursor-pointer ${filter === k ? 'border-sky-500 bg-sky-600' : 'border-slate-700'}`}>{l}</button>
          ))}
        </div>
        {shown.length === 0 ? <p className="text-sm text-slate-400">No hay tickets aquí.</p> : (
          <ul className="space-y-2">
            {shown.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => open(t.id)} className={`${card} w-full text-start cursor-pointer hover:bg-slate-800/60 ${sel?.ticket.id === t.id ? '!border-sky-500' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-bold">{t.subject}</p>
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${ST[t.status].cls}`}>{ST[t.status].label}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{t.org ?? 'Cliente'}{t.plan ? ` · ${t.plan}` : ''}{t.assigned_name ? ` · 👤 ${t.assigned_name}` : ''}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={card}>
        {msg && <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs font-semibold text-red-400">{msg}</p>}
        {!sel ? <p className="text-sm text-slate-400">Elige un ticket para verlo y responder.</p> : (
          <div className="space-y-4">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="min-w-0 break-words text-base font-extrabold">{sel.ticket.subject}</h2>
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${ST[sel.ticket.status].cls}`}>{ST[sel.ticket.status].label}</span>
              </div>
              <p className="text-xs text-slate-400">{sel.ticket.org ?? 'Cliente'}{sel.ticket.plan ? ` · ${sel.ticket.plan}` : ''} · abierto por {sel.ticket.opener ?? '—'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select className={`${input} !w-auto`} value={sel.ticket.assigned_to ?? ''} onChange={(e) => assign(e.target.value)} disabled={busy}>
                <option value="">Sin asignar</option>
                <option value={myId}>Yo</option>
                {staff.filter((s) => s.id !== myId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {sel.ticket.status !== 'closed'
                ? <button type="button" disabled={busy} className={ghost} onClick={() => setStatus('closed')}>✓ Cerrar ticket</button>
                : <button type="button" disabled={busy} className={ghost} onClick={() => setStatus('open')}>Reabrir</button>}
            </div>
            <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
              {sel.messages.map((m) => (
                <li key={m.id} className={`rounded-xl p-3 text-sm ${m.internal ? 'border border-dashed border-amber-500/40 bg-amber-500/5' : m.kind === 'staff' ? 'bg-sky-600/20' : 'bg-slate-800'}`}>
                  <p className="text-[11px] font-bold text-slate-400">{m.internal ? '🔒 Nota interna · ' : ''}{m.kind === 'staff' ? 'Equipo' : 'Cliente'} · {m.by ?? ''} · {new Date(m.at).toLocaleString()}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words">{m.body}</p>
                </li>
              ))}
            </ul>
            <div className="space-y-2">
              <textarea className={input} rows={3} value={text} maxLength={4000} placeholder={internal ? 'Nota interna (el cliente no la ve)…' : 'Responder al cliente…'} onChange={(e) => setText(e.target.value)} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Nota interna</label>
                <button type="button" disabled={busy || !text.trim()} className={btn} onClick={reply}>{internal ? 'Guardar nota' : 'Enviar respuesta'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Team() {
  const [list, setList] = useState<Staff[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '', func: 'support', canReply: true, canAssign: false, canSeeOrgs: true });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setList((await rpc<Staff[]>('staff_list')) ?? []); } catch (e) { setMsg({ ok: false, text: err(e) }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true); setMsg(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch('/api/platform-staff', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify(f),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'No se pudo crear');
      setShow(false); setF({ name: '', email: '', password: '', func: 'support', canReply: true, canAssign: false, canSeeOrgs: true });
      setMsg({ ok: true, text: 'Cuenta creada. Entra con su correo y contraseña.' }); await load();
    } catch (e) { setMsg({ ok: false, text: err(e) }); }
    setBusy(false);
  };

  const update = async (s: Staff, patch: Partial<Staff>) => {
    const n = { ...s, ...patch };
    try {
      await rpc('staff_update', { p_user: n.user_id, p_func: n.func, p_reply: n.can_reply, p_assign: n.can_assign, p_orgs: n.can_see_orgs, p_active: n.is_active });
      await load();
    } catch (e) { setMsg({ ok: false, text: err(e) }); }
  };

  const Chk = ({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) => (
    <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} /> {label}</label>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">Tu equipo atiende a los clientes. Nadie del equipo ve el dinero ni la operación de las empresas.</p>
        <button type="button" className={btn} onClick={() => setShow(!show)}>+ Nueva cuenta</button>
      </div>
      {msg && <p className={`rounded-lg border p-2 text-xs font-semibold ${msg.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>{msg.text}</p>}
      {show && (
        <div className={`${card} space-y-3`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={input} placeholder="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input className={input} type="email" placeholder="Correo" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <input className={input} type="text" placeholder="Contraseña (mín. 8)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            <select className={input} value={f.func} onChange={(e) => setF({ ...f, func: e.target.value })}>
              {Object.entries(FUNCS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-4">
            <Chk on={f.canReply} label="Puede responder y cerrar tickets" onChange={(v) => setF({ ...f, canReply: v })} />
            <Chk on={f.canAssign} label="Puede asignar tickets" onChange={(v) => setF({ ...f, canAssign: v })} />
            <Chk on={f.canSeeOrgs} label="Ve el nombre y plan de la empresa" onChange={(v) => setF({ ...f, canSeeOrgs: v })} />
          </div>
          <button type="button" disabled={busy || !f.name || !f.email || f.password.length < 8} className={btn} onClick={create}>Crear cuenta</button>
        </div>
      )}
      {list.length === 0 ? <p className="text-sm text-slate-400">Aún no tienes equipo.</p> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((s) => (
            <li key={s.user_id} className={`${card} space-y-2 ${s.is_active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="break-words font-bold">{s.name}</p><p className="break-all text-xs text-slate-400">{s.email}</p></div>
                <button type="button" className={ghost} onClick={() => update(s, { is_active: !s.is_active })}>{s.is_active ? 'Desactivar' : 'Activar'}</button>
              </div>
              <select className={input} value={s.func} onChange={(e) => update(s, { func: e.target.value })}>
                {Object.entries(FUNCS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <div className="flex flex-wrap gap-4">
                <Chk on={s.can_reply} label="Responde y cierra" onChange={(v) => update(s, { can_reply: v })} />
                <Chk on={s.can_assign} label="Asigna" onChange={(v) => update(s, { can_assign: v })} />
                <Chk on={s.can_see_orgs} label="Ve empresa y plan" onChange={(v) => update(s, { can_see_orgs: v })} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChatTab() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [who, setWho] = useState<string>('');
  const [list, setList] = useState<Chat[]>([]);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    rpc<Contact[]>('platform_chat_contacts').then((c) => { setContacts(c ?? []); if (c?.length) setWho((w) => w || c[0].id); }).catch((e) => setMsg(err(e)));
  }, []);
  const load = useCallback(async () => {
    if (!who) return;
    try { setList((await rpc<Chat[]>('platform_chat_list', { p_with: who })) ?? []); } catch (e) { setMsg(err(e)); }
  }, [who]);
  useEffect(() => { load(); }, [load]);
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setUid(data.session?.user.id ?? null)); }, []);
  useLiveTopic(uid ? `plat:${uid}` : null, load);

  const send = async () => {
    if (!text.trim() || !who) return;
    try { await rpc('platform_chat_send', { p_to: who, p_body: text }); setText(''); await load(); } catch (e) { setMsg(err(e)); }
  };

  if (contacts.length === 0) return <p className="text-sm text-slate-400">{msg || 'Aún no hay con quién conversar. Crea una cuenta del equipo primero.'}</p>;
  return (
    <div className={`${card} space-y-3`}>
      <select className={input} value={who} onChange={(e) => setWho(e.target.value)}>
        {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.func !== 'admin' ? ` · ${FUNCS[c.func] ?? c.func}` : ' · Superadmin'}</option>)}
      </select>
      {msg && <p className="text-xs font-semibold text-red-400">{msg}</p>}
      <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
        {list.length === 0 && <li className="text-sm text-slate-400">Sin mensajes todavía.</li>}
        {list.map((m) => (
          <li key={m.id} className={`max-w-[85%] rounded-xl p-2.5 text-sm ${m.mine ? 'ms-auto bg-sky-600/30' : 'bg-slate-800'}`}>
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">{new Date(m.at).toLocaleString()}</p>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input className={input} value={text} maxLength={2000} placeholder="Escribe un mensaje…" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
        <button type="button" className={btn} disabled={!text.trim()} onClick={send}>Enviar</button>
      </div>
    </div>
  );
}
