'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { rpc } from '../../../lib/supabase';

type Kind = 'management' | 'tax_rule' | 'veltrix_help';
type Status = 'draft' | 'verified' | 'retired';
type Area = 'impuestos' | 'contabilidad' | 'finanzas' | 'credito_cobranza' | 'operacion' | 'legal' | 'veltrix';
type Row = {
  id: string; kind: Kind; area: Area; country_code: string | null; topic: string; title: string; summary: string;
  source_name: string | null; source_url: string | null; license: string | null; lang: string; status: Status;
  verified_by: string | null; verified_at: string | null; updated_at: string;
};
type Form = { id: string | null; kind: Kind; area: Area; country: string; topic: string; title: string; summary: string; source_name: string; source_url: string; license: string; lang: string; status: Status; verified_by: string };
// Carpeta activa: una vista de la biblioteca (una entrada puede aparecer en varias)
type Folder = 'all' | 'base' | 'pending' | 'verified' | 'retired' | `country:${string}`;

const KINDS: Record<Kind, string> = { management: 'Gestión de negocios', tax_rule: 'Regla tributaria o legal', veltrix_help: 'Ayuda de Veltrix' };
const STATUS: Record<Status, string> = { draft: 'Borrador', verified: 'Verificada', retired: 'Retirada' };
const AREAS: Record<Area, { label: string; icon: string }> = {
  impuestos: { label: 'Impuestos', icon: '🧾' },
  contabilidad: { label: 'Contabilidad', icon: '📒' },
  finanzas: { label: 'Finanzas y tesorería', icon: '💹' },
  credito_cobranza: { label: 'Crédito y cobranza', icon: '🤝' },
  operacion: { label: 'Operación y gestión', icon: '⚙️' },
  legal: { label: 'Legal y cumplimiento', icon: '⚖️' },
  veltrix: { label: 'Ayuda de Veltrix', icon: '🧭' },
};
const DEFAULT_AREA: Record<Kind, Area> = { tax_rule: 'impuestos', management: 'finanzas', veltrix_help: 'veltrix' };
const MAX = 2000;
const EMPTY: Form = { id: null, kind: 'veltrix_help', area: 'veltrix', country: '', topic: '', title: '', summary: '', source_name: '', source_url: '', license: '', lang: 'es', status: 'draft', verified_by: '' };

const countryName = (code: string) => {
  try { return new Intl.DisplayNames(['es'], { type: 'region' }).of(code) ?? code; } catch { return code; }
};
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Biblioteca de conocimiento de Veltrix IA: la IA solo usa las entradas verificadas, con su fuente y licencia.
export type KnowledgeAccess = { edit: boolean; verify: boolean };
export function ConocimientoPanel({ access = { edit: true, verify: true } }: { access?: KnowledgeAccess }) {
  const [list, setList] = useState<Row[]>([]);
  const [f, setF] = useState<Form>(EMPTY);
  const [folder, setFolder] = useState<Folder>('all');
  const [area, setArea] = useState<'' | Area>('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [review, setReview] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => { try { setList((await rpc<Row[]>('admin_list_ai_knowledge')) ?? []); } catch (e) { setMsg(e instanceof Error ? e.message : 'Error'); } }, []);
  useEffect(() => { load(); }, [load]);

  const needsSource = f.kind !== 'veltrix_help';
  const ready = !!(f.topic.trim() && f.title.trim() && f.summary.trim() && f.summary.length <= MAX && (f.kind !== 'tax_rule' || f.country.trim()));
  const canVerify = access.verify && ready && (!needsSource || (f.source_url.trim() && f.license.trim()));

  const call = (r: { id: string | null; kind: Kind; area: Area; country: string | null; topic: string; title: string; summary: string; source_name: string | null; source_url: string | null; license: string | null; lang: string; verified_by: string | null }, status: Status) =>
    rpc('admin_save_ai_knowledge', {
      p_id: r.id, p_kind: r.kind, p_area: r.area, p_country: r.country || null, p_topic: r.topic, p_title: r.title, p_summary: r.summary,
      p_source_name: r.source_name || null, p_source_url: r.source_url || null, p_license: r.license || null, p_lang: r.lang || 'es', p_status: status, p_verified_by: r.verified_by || null,
    });

  const save = async (status: Status) => {
    setBusy(true); setMsg('');
    try {
      await call({ ...f, country: f.country || null, source_name: f.source_name || null, source_url: f.source_url || null, license: f.license || null, verified_by: f.verified_by || null }, status);
      setF(EMPTY); setMsg(status === 'verified' ? '✅ Entrada verificada' : '✅ Borrador guardado'); await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'No fue posible guardar'); } finally { setBusy(false); }
  };
  const retire = async (r: Row) => {
    setBusy(true); setMsg('');
    try {
      await call({ id: r.id, kind: r.kind, area: r.area, country: r.country_code, topic: r.topic, title: r.title, summary: r.summary, source_name: r.source_name, source_url: r.source_url, license: r.license, lang: r.lang, verified_by: r.verified_by }, 'retired');
      setMsg('✅ Entrada retirada'); await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'No fue posible retirar'); } finally { setBusy(false); }
  };
  const edit = (r: Row) => setF({ id: r.id, kind: r.kind, area: r.area, country: r.country_code ?? '', topic: r.topic, title: r.title, summary: r.summary, source_name: r.source_name ?? '', source_url: r.source_url ?? '', license: r.license ?? '', lang: r.lang, status: r.status, verified_by: r.verified_by ?? '' });

  // Archivos de texto (.txt, .md): su contenido pasa al resumen para revisarlo antes de guardar
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const x = e.target.files?.[0]; e.target.value = '';
    if (!x) return;
    if (!/\.(txt|md|markdown)$/i.test(x.name)) { setMsg('Solo se aceptan archivos .txt o .md. Para un PDF, copia el texto que corresponde.'); return; }
    if (x.size > 200_000) { setMsg('El archivo es demasiado grande: divídelo en entradas de hasta 2000 caracteres.'); return; }
    const text = (await x.text()).trim();
    setF((p) => ({ ...p, summary: text, title: p.title || x.name.replace(/\.[^.]+$/, '') }));
    setMsg(text.length > MAX ? `El texto tiene ${text.length} caracteres y el máximo es ${MAX}: divídelo en varias entradas.` : '✅ Texto cargado: revísalo antes de guardar');
  };

  // Contadores de las carpetas
  const live = useMemo(() => list.filter((r) => r.status !== 'retired'), [list]);
  const counts = useMemo(() => {
    const countries = new Map<string, number>();
    live.forEach((r) => { if (r.country_code) countries.set(r.country_code, (countries.get(r.country_code) ?? 0) + 1); });
    return {
      all: live.length,
      base: live.filter((r) => !r.country_code).length,
      pending: list.filter((r) => r.status === 'draft').length,
      verified: list.filter((r) => r.status === 'verified').length,
      retired: list.filter((r) => r.status === 'retired').length,
      countries: [...countries.entries()].sort((a, b) => countryName(a[0]).localeCompare(countryName(b[0]), 'es')),
    };
  }, [list, live]);
  const areaCounts = useMemo(() => {
    const m = new Map<Area, number>();
    list.filter(inFolder(folder)).forEach((r) => m.set(r.area, (m.get(r.area) ?? 0) + 1));
    return m;
  }, [list, folder]);

  const shown = useMemo(() => {
    const s = norm(q.trim());
    return list.filter(inFolder(folder)).filter((r) => !area || r.area === area)
      .filter((r) => !s || norm(`${r.title} ${r.topic} ${r.summary} ${r.source_name ?? ''}`).includes(s));
  }, [list, folder, area, q]);

  const queue = useMemo(() => shown.filter((r) => r.status === 'draft' && !skipped.includes(r.id)), [shown, skipped]);
  const cur = queue[0];
  const reviewVerify = async (r: Row) => {
    setBusy(true); setMsg('');
    try {
      await call({ id: r.id, kind: r.kind, area: r.area, country: r.country_code, topic: r.topic, title: r.title, summary: r.summary, source_name: r.source_name, source_url: r.source_url, license: r.license, lang: r.lang, verified_by: null }, 'verified');
      setMsg('✅ Entrada verificada'); await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'No fue posible verificar'); } finally { setBusy(false); }
  };

  const inp = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm';
  const lbl = 'text-[11px] font-semibold text-slate-400';
  const folderBtn = (id: Folder, icon: string, label: string, n: number, sub = false) => (
    <button key={id} type="button" onClick={() => { setFolder(id); setArea(''); }}
      className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${sub ? 'ml-3 w-[calc(100%-0.75rem)]' : ''} ${folder === id ? 'border-blue-500 bg-blue-600/20 text-white' : 'border-slate-800 bg-slate-900/50 text-slate-300 hover:border-slate-600'}`}>
      <span>{icon} {label}</span><span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">{n}</span>
    </button>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[15rem_1fr_1fr]">
      <nav className="space-y-2 self-start" aria-label="Carpetas de conocimiento">
        <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Carpetas</p>
        {folderBtn('all', '📚', 'Toda la biblioteca', counts.all)}
        {folderBtn('base', '🧠', 'Base de la IA', counts.base)}
        <p className="px-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Por país</p>
        {counts.countries.length === 0 && <p className="px-1 text-xs text-slate-500">Aún no hay entradas por país.</p>}
        {counts.countries.map(([c, n]) => folderBtn(`country:${c}`, '🌎', `${countryName(c)} (${c})`, n, true))}
        <p className="px-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Estado</p>
        {folderBtn('pending', '⏳', 'Por verificar', counts.pending)}
        {folderBtn('verified', '✅', 'Verificadas', counts.verified)}
        {folderBtn('retired', '🗄️', 'Retiradas', counts.retired)}
      </nav>

      <form onSubmit={(e) => { e.preventDefault(); save('draft'); }} className="space-y-3 self-start rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
        <h2 className="text-sm font-bold">{f.id ? 'Editar entrada' : 'Nueva entrada de conocimiento'}</h2>
        <p className="text-[11px] text-slate-500">Veltrix IA solo usa las entradas verificadas. Una regla tributaria o legal exige país, enlace de la fuente oficial y licencia. Sin país, la entrada pertenece a la base general de la IA.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className={lbl}>Tipo</span>
            <select value={f.kind} onChange={(e) => { const k = e.target.value as Kind; setF({ ...f, kind: k, area: DEFAULT_AREA[k] }); }} className={inp}>
              {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          <label className="space-y-1"><span className={lbl}>Área</span>
            <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value as Area })} className={inp}>
              {Object.entries(AREAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></label>
        </div>
        <label className="block space-y-1"><span className={lbl}>País (código de 2 letras, p. ej. BO; vacío = base general)</span>
          <input value={f.country} maxLength={2} onChange={(e) => setF({ ...f, country: e.target.value.toUpperCase() })} className={inp} /></label>
        <label className="block space-y-1"><span className={lbl}>Tema</span><input value={f.topic} maxLength={80} onChange={(e) => setF({ ...f, topic: e.target.value })} className={inp} /></label>
        <label className="block space-y-1"><span className={lbl}>Título</span><input value={f.title} maxLength={140} onChange={(e) => setF({ ...f, title: e.target.value })} className={inp} /></label>
        <label className="block space-y-1"><span className={lbl}>Contenido ({f.summary.length}/{MAX})</span>
          <textarea rows={8} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} className={inp} /></label>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={file} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" onChange={onFile} className="hidden" />
          <button type="button" onClick={() => file.current?.click()} className="cursor-pointer rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold hover:bg-slate-800">📎 Subir archivo (.txt o .md)</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className={lbl}>Nombre de la fuente</span><input value={f.source_name} onChange={(e) => setF({ ...f, source_name: e.target.value })} className={inp} /></label>
          <label className="space-y-1"><span className={lbl}>Licencia o condiciones de uso</span><input value={f.license} onChange={(e) => setF({ ...f, license: e.target.value })} className={inp} /></label>
        </div>
        <label className="block space-y-1"><span className={lbl}>Enlace de la fuente</span><input type="url" value={f.source_url} onChange={(e) => setF({ ...f, source_url: e.target.value })} className={inp} /></label>
        <p className="text-[11px] text-slate-500">Al verificar, la entrada queda registrada con tu nombre y la fecha de hoy.</p>
        {msg && <p className="text-xs font-semibold text-amber-300">{msg}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="submit" disabled={busy || !ready || !access.edit} className="cursor-pointer rounded-xl border border-slate-600 bg-slate-800 py-3 text-sm font-bold disabled:opacity-50">Guardar borrador</button>
          {access.verify
            ? <button type="button" disabled={busy || !canVerify} onClick={() => save('verified')} className="cursor-pointer rounded-xl bg-blue-600 py-3 text-sm font-bold disabled:opacity-50">Marcar verificada</button>
            : <p className="grid place-items-center rounded-xl border border-slate-800 px-2 text-center text-[11px] text-slate-500">La verificación la realiza quien tiene ese permiso.</p>}
        </div>
        {f.id && <button type="button" onClick={() => setF(EMPTY)} className="w-full cursor-pointer text-xs font-semibold text-slate-400 hover:underline">Cancelar edición</button>}
      </form>

      <section className="space-y-2 self-start">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título, tema, contenido o fuente" className={inp} aria-label="Buscar en la biblioteca" />
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setArea('')} className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold ${area === '' ? 'border-blue-500 bg-blue-600/20' : 'border-slate-700 hover:border-slate-500'}`}>Todas las áreas</button>
          {(Object.keys(AREAS) as Area[]).filter((a) => areaCounts.get(a)).map((a) => (
            <button key={a} type="button" onClick={() => setArea(area === a ? '' : a)}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold ${area === a ? 'border-blue-500 bg-blue-600/20' : 'border-slate-700 hover:border-slate-500'}`}>
              {AREAS[a].icon} {AREAS[a].label} · {areaCounts.get(a)}
            </button>
          ))}
        </div>
        {access.verify && (
          <button type="button" onClick={() => { setReview(!review); setSkipped([]); }} className="w-full cursor-pointer rounded-xl border border-blue-500/50 bg-blue-600/10 px-3 py-2 text-sm font-bold text-blue-200 hover:bg-blue-600/20">
            {review ? 'Salir de la revisión rápida' : `⚡ Revisión rápida (${shown.filter((r) => r.status === 'draft').length} por verificar en esta vista)`}
          </button>
        )}
        {review && access.verify && (cur ? (
          <div className="space-y-2 rounded-2xl border border-blue-500/40 bg-slate-900 p-4">
            <p className="text-[11px] font-semibold text-slate-400">Pendientes en esta vista: {queue.length}</p>
            <p className="font-bold">{cur.title}</p>
            <p className="whitespace-pre-wrap text-sm text-slate-200">{cur.summary}</p>
            <div className="space-y-1 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
              <p><b>Fuente:</b> {cur.source_url ? <a href={cur.source_url} target="_blank" rel="noreferrer" className="text-blue-400 underline">{cur.source_name || cur.source_url}</a> : 'sin enlace'}</p>
              <p><b>Licencia o condiciones:</b> {cur.license || 'sin dato'}</p>
              <p><b>País:</b> {cur.country_code ? countryName(cur.country_code) : 'Base general'} · <b>Área:</b> {AREAS[cur.area]?.label}</p>
            </div>
            {msg && <p className="text-xs font-semibold text-amber-300">{msg}</p>}
            {cur.kind !== 'veltrix_help' && !(cur.source_url && cur.license) && <p className="text-xs text-rose-300">Falta el enlace o la licencia: edita la entrada antes de verificarla.</p>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busy || (cur.kind !== 'veltrix_help' && !(cur.source_url && cur.license))} onClick={() => reviewVerify(cur)} className="cursor-pointer rounded-xl bg-emerald-600 py-2.5 text-sm font-bold disabled:opacity-50">✅ Verificar</button>
              <button type="button" onClick={() => edit(cur)} className="cursor-pointer rounded-xl border border-slate-600 py-2.5 text-sm font-bold">✏️ Corregir</button>
              <button type="button" onClick={() => setSkipped([...skipped, cur.id])} className="cursor-pointer rounded-xl border border-slate-700 py-2.5 text-sm font-semibold text-slate-300">⏭ Omitir</button>
              <button type="button" disabled={busy} onClick={() => retire(cur)} className="cursor-pointer rounded-xl border border-red-500/40 py-2.5 text-sm font-semibold text-red-300">🗄️ Retirar</button>
            </div>
          </div>
        ) : <p className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-400">No quedan entradas por revisar en esta vista.</p>)}
        <h2 className="text-sm font-bold">Entradas ({shown.length})</h2>
        {shown.length === 0 && <p className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-500">No hay entradas en esta carpeta con ese filtro.</p>}
        {shown.map((r) => (
          <div key={r.id} className="space-y-1 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold">{r.title}</p>
              <div className="flex shrink-0 gap-3 text-xs font-semibold">
                {(access.verify || (access.edit && r.status === 'draft')) && <button type="button" onClick={() => edit(r)} className="cursor-pointer text-blue-400 hover:underline">Editar</button>}
                {access.verify && r.status !== 'retired' && <button type="button" disabled={busy} onClick={() => retire(r)} className="cursor-pointer text-red-400 hover:underline">Retirar</button>}
              </div>
            </div>
            <p className="line-clamp-3 text-xs text-slate-300">{r.summary}</p>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
              <span className="rounded-full bg-slate-800 px-2 py-0.5">{AREAS[r.area]?.icon} {AREAS[r.area]?.label ?? r.area}</span>
              <span className="rounded-full bg-slate-800 px-2 py-0.5">{r.country_code ? `🌎 ${countryName(r.country_code)}` : '🧠 Base de la IA'}</span>
              <span className={`rounded-full px-2 py-0.5 ${r.status === 'verified' ? 'bg-emerald-500/20 text-emerald-300' : r.status === 'draft' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-300'}`}>{STATUS[r.status]}</span>
              {r.kind === 'tax_rule' && r.status !== 'verified' && r.status !== 'retired' && <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-rose-300">Requiere revisión de un contador</span>}
            </div>
            <p className="text-[11px] text-slate-500">
              {KINDS[r.kind]} · {r.topic}
              {r.status === 'verified' && r.verified_by ? ` · verificada por ${r.verified_by}` : ''}
              {r.source_url && <> · <a href={r.source_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{r.source_name || 'fuente'}</a></>}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}

function inFolder(folder: Folder) {
  return (r: Row) => {
    switch (folder) {
      case 'all': return r.status !== 'retired';
      case 'base': return !r.country_code && r.status !== 'retired';
      case 'pending': return r.status === 'draft';
      case 'verified': return r.status === 'verified';
      case 'retired': return r.status === 'retired';
      default: return r.country_code === folder.slice('country:'.length) && r.status !== 'retired';
    }
  };
}
