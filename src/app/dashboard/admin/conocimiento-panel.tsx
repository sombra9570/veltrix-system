'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { rpc } from '../../../lib/supabase';

type Row = {
  id: string; kind: 'management' | 'tax_rule' | 'veltrix_help'; country_code: string | null; topic: string; title: string; summary: string;
  source_name: string | null; source_url: string | null; license: string | null; lang: string; status: 'draft' | 'verified' | 'retired';
  verified_by: string | null; verified_at: string | null; updated_at: string;
};
type Form = { id: string | null; kind: Row['kind']; country: string; topic: string; title: string; summary: string; source_name: string; source_url: string; license: string; lang: string; status: Row['status']; verified_by: string };

const KINDS: Record<Row['kind'], string> = { management: 'Gestión de negocios', tax_rule: 'Regla tributaria o legal', veltrix_help: 'Ayuda de Veltrix' };
const STATUS: Record<Row['status'], string> = { draft: 'Borrador', verified: 'Verificada', retired: 'Retirada' };
const MAX = 2000;
const EMPTY: Form = { id: null, kind: 'veltrix_help', country: '', topic: '', title: '', summary: '', source_name: '', source_url: '', license: '', lang: 'es', status: 'draft', verified_by: '' };

// Biblioteca de conocimiento de Veltrix IA: la IA solo usa las entradas verificadas, con su fuente y licencia.
export function ConocimientoPanel() {
  const [list, setList] = useState<Row[]>([]);
  const [f, setF] = useState<Form>(EMPTY);
  const [filter, setFilter] = useState<'all' | Row['status']>('all');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => { try { setList((await rpc<Row[]>('admin_list_ai_knowledge')) ?? []); } catch (e) { setMsg(e instanceof Error ? e.message : 'Error'); } }, []);
  useEffect(() => { load(); }, [load]);

  const needsSource = f.kind !== 'veltrix_help';
  const ready = !!(f.topic.trim() && f.title.trim() && f.summary.trim() && f.summary.length <= MAX && (f.kind !== 'tax_rule' || f.country.trim()));
  const canVerify = ready && !!f.verified_by.trim() && (!needsSource || (f.source_url.trim() && f.license.trim()));

  const save = async (status: Row['status']) => {
    setBusy(true); setMsg('');
    try {
      await rpc('admin_save_ai_knowledge', {
        p_id: f.id, p_kind: f.kind, p_country: f.country || null, p_topic: f.topic, p_title: f.title, p_summary: f.summary,
        p_source_name: f.source_name || null, p_source_url: f.source_url || null, p_license: f.license || null, p_lang: f.lang || 'es', p_status: status, p_verified_by: f.verified_by || null,
      });
      setF(EMPTY); setMsg(status === 'verified' ? '✅ Entrada verificada' : status === 'retired' ? '✅ Entrada retirada' : '✅ Borrador guardado'); await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'No fue posible guardar'); } finally { setBusy(false); }
  };
  const retire = async (r: Row) => {
    setBusy(true); setMsg('');
    try {
      await rpc('admin_save_ai_knowledge', {
        p_id: r.id, p_kind: r.kind, p_country: r.country_code, p_topic: r.topic, p_title: r.title, p_summary: r.summary,
        p_source_name: r.source_name, p_source_url: r.source_url, p_license: r.license, p_lang: r.lang, p_status: 'retired', p_verified_by: r.verified_by,
      });
      setMsg('✅ Entrada retirada'); await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'No fue posible retirar'); } finally { setBusy(false); }
  };
  const edit = (r: Row) => setF({ id: r.id, kind: r.kind, country: r.country_code ?? '', topic: r.topic, title: r.title, summary: r.summary, source_name: r.source_name ?? '', source_url: r.source_url ?? '', license: r.license ?? '', lang: r.lang, status: r.status, verified_by: r.verified_by ?? '' });

  // Archivos de texto (.txt, .md): su contenido pasa al resumen para revisarlo antes de guardar
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const x = e.target.files?.[0]; e.target.value = '';
    if (!x) return;
    if (!/\.(txt|md|markdown)$/i.test(x.name)) { setMsg('Solo se aceptan archivos .txt o .md. Para un PDF, copia el texto que corresponde.'); return; }
    if (x.size > 200_000) { setMsg('El archivo es demasiado grande: divídelo en entradas de hasta 2000 caracteres.'); return; }
    const text = (await x.text()).trim();
    setF((p) => ({ ...p, summary: text, title: p.title || x.name.replace(/\.[^.]+$/, '') }));
    setMsg(text.length > MAX ? `El texto tiene ${text.length} caracteres y el máximo es ${MAX}: divídelo en varias entradas.` : '✅ Texto cargado: revísalo antes de guardar');
  };

  const shown = list.filter((r) => filter === 'all' || r.status === filter);
  const inp = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm';
  const lbl = 'text-[11px] font-semibold text-slate-400';

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <form onSubmit={(e) => { e.preventDefault(); save('draft'); }} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
        <h2 className="text-sm font-bold">{f.id ? 'Editar entrada' : 'Nueva entrada de conocimiento'}</h2>
        <p className="text-[11px] text-slate-500">Veltrix IA solo usa las entradas verificadas. Una regla tributaria o legal exige país, enlace de la fuente oficial y licencia.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className={lbl}>Tipo</span>
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Row['kind'] })} className={inp}>
              {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          <label className="space-y-1"><span className={lbl}>País (código, p. ej. BO)</span>
            <input value={f.country} maxLength={2} onChange={(e) => setF({ ...f, country: e.target.value.toUpperCase() })} className={inp} /></label>
        </div>
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
        <label className="block space-y-1"><span className={lbl}>Verificado por (nombre de quien revisó)</span><input value={f.verified_by} onChange={(e) => setF({ ...f, verified_by: e.target.value })} className={inp} /></label>
        {msg && <p className="text-xs font-semibold text-amber-300">{msg}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="submit" disabled={busy || !ready} className="cursor-pointer rounded-xl border border-slate-600 bg-slate-800 py-3 text-sm font-bold disabled:opacity-50">Guardar borrador</button>
          <button type="button" disabled={busy || !canVerify} onClick={() => save('verified')} className="cursor-pointer rounded-xl bg-blue-600 py-3 text-sm font-bold disabled:opacity-50">Marcar verificada</button>
        </div>
        {f.id && <button type="button" onClick={() => setF(EMPTY)} className="w-full cursor-pointer text-xs font-semibold text-slate-400 hover:underline">Cancelar edición</button>}
      </form>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">Entradas ({shown.length})</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs" aria-label="Filtrar por estado">
            <option value="all">Todas</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {shown.length === 0 && <p className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-500">Aún no hay entradas.</p>}
        {shown.map((r) => (
          <div key={r.id} className="space-y-1 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold">{r.title}</p>
              <div className="flex shrink-0 gap-3 text-xs font-semibold">
                <button type="button" onClick={() => edit(r)} className="cursor-pointer text-blue-400 hover:underline">Editar</button>
                {r.status !== 'retired' && <button type="button" disabled={busy} onClick={() => retire(r)} className="cursor-pointer text-red-400 hover:underline">Retirar</button>}
              </div>
            </div>
            <p className="line-clamp-3 text-xs text-slate-300">{r.summary}</p>
            <p className="text-[11px] text-slate-500">
              {KINDS[r.kind]}{r.country_code ? ` · ${r.country_code}` : ''} · {r.topic} · {STATUS[r.status]}
              {r.status === 'verified' && r.verified_by ? ` por ${r.verified_by}` : ''}
              {r.source_url && <> · <a href={r.source_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{r.source_name || 'fuente'}</a></>}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
