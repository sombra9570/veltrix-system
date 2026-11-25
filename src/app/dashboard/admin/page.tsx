'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../language-selector';
import { LanguageDropdown, RegionalStatusBar, translations } from './regional-tools';
import { useVeltrixAuth } from '../../auth-system';
import { rpc, supabase } from '../../../lib/supabase';
import { Spinner } from '../../spinner';
import { TransferAdmin } from './transfer-admin';
import { StreetRequests } from './street-requests';
import { NetBanner } from '../sync';
import { PlatformBell } from './platform-bell';
import { PurgeOrg, SweepFiles, AutoPurgePanel } from './purge-org';
import { BUSINESS_CATEGORIES } from '../../business-catalog';
import { AvisosPanel } from './avisos-panel';
import { RecursosPanel } from './recursos-panel';
import { ActividadPanel } from './actividad-panel';

// Lo que devuelve la función platform_metrics() de la base de datos
type Stage = 'trial' | 'paying' | 'grace' | 'suspended';
type OrgRow = {
  org_id: string; name: string; email: string; plan: string; price_usd: number;
  stage: Stage; created_at: string; trial_ends_at: string | null; next_billing_date: string | null;
};
type Metrics = {
  generated_at: string;
  funnel: { total: number; trial: number; paying: number; grace: number; suspended: number };
  mrr_usd: number;
  conversion: { trials_finished: number; converted: number };
  churn_30d: number;
  trials_expiring: { org_id: string; name: string; email: string; plan: string; trial_ends_at: string; days_left: number }[];
  organizations: OrgRow[];
  growth: { month: string; new_orgs: number; revenue_usd: number }[];
};

type Filter = 'all' | Stage;
type AdminTab = 'menu' | 'home' | 'clients' | 'billing' | 'plans' | 'notices' | 'usage' | 'activity' | 'tools';
// Estructura de cada organización (solo cuántas empresas, sucursales, usuarios y módulos; nunca sus datos de negocio)
type OrgOverview = {
  org_id: string; users: number; modules: string[]; roles: Record<string, number>;
  limits: { companies: number; branches: number; users: number };
  companies: { name: string; type: string; cats: string[]; branches: string[] }[];
};
const CAT_LABEL: Record<string, string> = Object.fromEntries(BUSINESS_CATEGORIES.map((c) => [c.id, `${c.icon} ${c.label.split(' / ')[0]}`]));
const ROLE_LABEL: Record<string, string> = {
  owner: 'Dueño', supervisor: 'Supervisor', cashier: 'Cajero', vendor: 'Vendedor', collector: 'Cobrador', waiter: 'Mesero',
  kitchen: 'Cocina', technician: 'Técnico', storekeeper: 'Almacén', accountant: 'Contador', director: 'Director',
  secretary: 'Secretaría', reception: 'Recepción', delivery: 'Delivery',
};
const MOD_LABEL: Record<string, string> = {
  retail: 'Ventas', inventory: 'Inventario', purchasing: 'Compras', finance: 'Finanzas', restaurant: 'Restaurante',
  workshop: 'Taller', field_collection: 'Cobranza en calle', distribution: 'Distribución', hr: 'Personal',
};

const STAGE_INFO: Record<Stage, { label: string; badge: string }> = {
  trial:     { label: '🧪 En prueba',  badge: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
  paying:    { label: '🟢 Pagando',    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  grace:     { label: '🟡 En gracia',  badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  suspended: { label: '🔴 Suspendida', badge: 'bg-red-500/10 text-red-300 border-red-500/30' },
};

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const monthLabel = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(2, 4);
const fmtDate = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString('es-BO') : '—');

function BarChart({
  data, color, format,
}: { data: { label: string; value: number }[]; color: string; format: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-0.5 sm:gap-1.5 h-40 pt-4 min-w-0">
      {data.map((d) => (
        <div key={d.label} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full gap-1 group">
          <span className="hidden sm:block text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition truncate max-w-full">
            {format(d.value)}
          </span>
          <div
            className={`w-full rounded-t-md ${color} transition-all`}
            style={{ height: `${Math.max(d.value > 0 ? 4 : 1, (d.value / max) * 100)}%`, opacity: d.value > 0 ? 1 : 0.25 }}
            title={`${d.label}: ${format(d.value)}`}
          />
          <span className="text-[9px] sm:text-[10px] leading-tight text-center text-slate-500">
            {d.label.split(' ')[0]}<br />{d.label.split(' ')[1]}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function GlobalCoreAdminPage() {
  const router = useRouter();
  const { lang, formatMoney } = useLanguage();
  const t = translations[lang] || translations.es;
  const { loaded, session, logout } = useVeltrixAuth();
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [tab, setTab] = useState<AdminTab>('menu');
  const [ov, setOv] = useState<Record<string, OrgOverview>>({});
  const [open, setOpen] = useState<string | null>(null);
  // Correo desde el dominio de Veltrix (no desde el correo personal del teléfono)
  const [mail, setMail] = useState<{ to: string; name: string; subject: string; text: string } | null>(null);
  // Veltrix IA: cupo mensual por organización
  const [ai, setAi] = useState<{ org_id: string; name: string; quota: number; used: number; tokens_in: number; tokens_out: number }[]>([]);
  const [aiEdit, setAiEdit] = useState<Record<string, string>>({});
  const loadAi = useCallback(async () => { try { setAi(await rpc('ai_admin_overview') ?? []); } catch { /* */ } }, []);
  useEffect(() => { if (loaded && session?.role === 'superadmin') loadAi(); }, [loaded, session, loadAi]);
  const saveQuota = async (org: string) => {
    const n = parseInt(aiEdit[org] ?? '', 10);
    if (Number.isNaN(n) || n < 0) return;
    try { await rpc('ai_set_quota', { p_org: org, p_quota: n }); setAiEdit((e) => { const c = { ...e }; delete c[org]; return c; }); await loadAi(); } catch { /* */ }
  };
  // Plan Piloto / Fundador
  type Pilot = { org_id: string; name: string; plan: string; price_usd: number; price_now: number; is_pilot: boolean;
    pilot_ends: string | null; founder_discount_pct: number; founder_until: string | null; referral_credit_pct?: number; next_billing_date: string | null;
    status: string; last_payment: string | null };
  const [pilots, setPilots] = useState<Pilot[]>([]);
  const [pForm, setPForm] = useState<{ org: string; kind: 'pilot' | 'pay'; a: string; b: string; c: string } | null>(null);
  const [pMsg, setPMsg] = useState('');
  const loadPilots = useCallback(async () => { try { setPilots(await rpc<Pilot[]>('admin_pilots') ?? []); } catch { /* */ } }, []);
  useEffect(() => { if (loaded && session?.role === 'superadmin') loadPilots(); }, [loaded, session, loadPilots]);
  const savePilot = async () => {
    if (!pForm) return;
    setPMsg('');
    try {
      if (pForm.kind === 'pilot') {
        await rpc('admin_set_pilot', { p_org: pForm.org, p_days: parseInt(pForm.a, 10), p_discount_pct: parseInt(pForm.b || '0', 10), p_founder_months: parseInt(pForm.c || '0', 10) });
        setPMsg('✅ Piloto activado.');
      } else {
        const until = await rpc<string>('admin_record_payment', { p_org: pForm.org, p_amount: parseFloat(pForm.a.replace(',', '.')), p_months: parseInt(pForm.b || '1', 10), p_ref: pForm.c || null });
        setPMsg(`✅ Pago registrado. Pagado hasta ${fmtDate(until)}.`);
      }
      setPForm(null);
      await Promise.all([loadPilots(), refresh()]);
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setPMsg(m.includes('INVALID') ? '⚠️ Verifique los valores: días 1–180, descuento 0–90 %, meses 0–24.' : '⚠️ No se pudo guardar.');
    }
  };
  const clearPilot = async (org: string) => {
    if (!window.confirm('¿Quitar el descuento de fundador a esta empresa? Pagará el precio normal.')) return;
    try { await rpc('admin_clear_pilot', { p_org: org }); await loadPilots(); } catch { /* */ }
  };
  // Planes y precios (editables por el superadmin)
  type AdminPlan = { code: string; name: string; price_usd: number; price_global_usd: number; max_companies: number; max_branches: number;
    max_users: number; max_storage_mb: number; max_store_products: number; chat_retention_days: number; orgs: number };
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [planEdit, setPlanEdit] = useState<Record<string, Record<string, string>>>({});
  const [planMsg, setPlanMsg] = useState('');
  const loadPlans = useCallback(async () => { try { setPlans(await rpc<AdminPlan[]>('admin_plans') ?? []); } catch { /* */ } }, []);
  useEffect(() => { if (loaded && session?.role === 'superadmin') loadPlans(); }, [loaded, session, loadPlans]);
  const PLAN_FIELDS: [keyof AdminPlan, string][] = [
    ['price_usd', 'Precio Latam (USD)'], ['price_global_usd', 'Precio resto del mundo (USD)'], ['max_companies', 'Empresas'],
    ['max_branches', 'Sucursales'], ['max_users', 'Usuarios'], ['max_storage_mb', 'Almacenamiento (MB)'],
    ['max_store_products', 'Productos en tienda'], ['chat_retention_days', 'Días de chat'],
  ];
  const planVal = (p: AdminPlan, k: keyof AdminPlan) => planEdit[p.code]?.[k as string] ?? String(p[k]);
  const savePlan = async (p: AdminPlan) => {
    const v = (k: keyof AdminPlan) => Number(planVal(p, k).replace(',', '.'));
    setPlanMsg('');
    try {
      await rpc('admin_save_plan', {
        p_code: p.code, p_name: planVal(p, 'name'), p_price_usd: v('price_usd'), p_price_global_usd: v('price_global_usd'),
        p_max_companies: v('max_companies'), p_max_branches: v('max_branches'), p_max_users: v('max_users'),
        p_max_storage_mb: v('max_storage_mb'), p_max_store_products: v('max_store_products'), p_chat_retention_days: v('chat_retention_days'),
      });
      setPlanEdit((e) => { const c = { ...e }; delete c[p.code]; return c; });
      setPlanMsg(`✅ Plan ${planVal(p, 'name')} guardado. La portada y "Mi plan" ya muestran los nuevos valores.`);
      await loadPlans();
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setPlanMsg(m.includes('INVALID') ? '⚠️ Verifique los valores: precios desde 0 y límites desde 1.' : '⚠️ No se pudo guardar el plan.');
    }
  };
  // Plan de cobranza en calle (precios en bolivianos, propios de este rubro)
  type StreetCfg = { base_bs: number; collector_bs: number; collectors_per_supervisor: number; manager_after_collectors: number; manager_free: boolean };
  const [street, setStreet] = useState<StreetCfg | null>(null);
  const [stEdit, setStEdit] = useState<Record<string, string>>({});
  const loadStreet = useCallback(async () => { try { setStreet(await rpc<StreetCfg>('public_street_plan')); } catch { /* */ } }, []);
  useEffect(() => { if (loaded && session?.role === 'superadmin') loadStreet(); }, [loaded, session, loadStreet]);
  const stVal = (k: keyof StreetCfg) => stEdit[k] ?? String(street?.[k] ?? '');
  const saveStreet = async () => {
    const n = (k: keyof StreetCfg) => Number(stVal(k).replace(',', '.'));
    setPlanMsg('');
    try {
      await rpc('admin_save_street_plan', { p_base_bs: n('base_bs'), p_collector_bs: n('collector_bs'), p_collectors_per_supervisor: n('collectors_per_supervisor'), p_manager_after_collectors: n('manager_after_collectors'), p_manager_free: stEdit.manager_free !== undefined ? stEdit.manager_free === 'true' : street?.manager_free ?? true });
      setStEdit({}); setPlanMsg('✅ Plan de cobranza en calle guardado.'); await loadStreet();
    } catch (e) {
      setPlanMsg((e instanceof Error ? e.message : '').includes('STREET_INVALID') ? '⚠️ Verifique los valores: precios desde 0, supervisor cada 1 a 100 cobradores.' : '⚠️ No se pudo guardar el plan.');
    }
  };

  // Extras pagados (usuarios, sucursales, almacenamiento)
  type AdminAddon = { code: string; price_usd: number; price_global_usd: number; max_units: number; unit_mb: number };
  const [addons, setAddons] = useState<AdminAddon[]>([]);
  const [adEdit, setAdEdit] = useState<Record<string, Record<string, string>>>({});
  const loadAddons = useCallback(async () => { try { setAddons(await rpc<AdminAddon[]>('admin_addons') ?? []); } catch { /* */ } }, []);
  useEffect(() => { if (loaded && session?.role === 'superadmin') loadAddons(); }, [loaded, session, loadAddons]);
  const ADDON_NAME: Record<string, string> = { user: '👤 Usuario adicional', branch: '🏪 Sucursal adicional', storage: '💾 Almacenamiento adicional' };
  const adVal = (a: AdminAddon, k: keyof AdminAddon) => adEdit[a.code]?.[k as string] ?? String(a[k]);
  const saveAddon = async (a: AdminAddon) => {
    const v = (k: keyof AdminAddon) => Number(adVal(a, k).replace(',', '.'));
    setPlanMsg('');
    try {
      await rpc('admin_save_addon', { p_code: a.code, p_price_usd: v('price_usd'), p_price_global_usd: v('price_global_usd'), p_max_units: v('max_units') });
      setAdEdit((e) => { const c = { ...e }; delete c[a.code]; return c; });
      setPlanMsg(`✅ ${ADDON_NAME[a.code] ?? a.code} guardado. Actualice también el precio en Paddle.`);
      await loadAddons();
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setPlanMsg(m.includes('INVALID') ? '⚠️ Verifique los valores: precios desde 0 y máximo entre 0 y 500.' : '⚠️ No se pudo guardar el complemento.');
    }
  };
  // Borrar empresas de prueba: pasos y clave de borrado en purge-org.tsx
  const [purgeDone, setPurgeDone] = useState('');
  const afterPurge = async (m: string) => { setPurgeDone(m); await Promise.all([refresh(), loadPlans(), loadAi(), loadPilots()]); };
  const [mailMsg, setMailMsg] = useState('');
  const [sending, setSending] = useState(false);
  const sendMail = async () => {
    if (!mail) return;
    setSending(true);
    setMailMsg('');
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify({ to: mail.to, subject: mail.subject, text: mail.text }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setMail(null); setMailMsg('✅ Correo enviado desde Veltrix.'); }
      else setMailMsg(j.error === 'EMAIL_NOT_CONFIGURED'
        ? '⚠️ Falta configurar el correo de Veltrix (Resend).'
        : '⚠️ No se pudo enviar el correo. Intente nuevamente.');
    } catch {
      setMailMsg('⚠️ Sin conexión.');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (loaded && (!session || session.role !== 'superadmin')) router.replace('/');
  }, [loaded, session, router]);

  const loadOv = useCallback(async () => {
    try {
      const rows = await rpc<OrgOverview[]>('admin_org_overview');
      setOv(Object.fromEntries((rows ?? []).map((r) => [r.org_id, r])));
    } catch { /* la lista básica sigue funcionando */ }
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setM(await rpc<Metrics>('platform_metrics'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las métricas');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (loaded && session?.role === 'superadmin') { refresh(); loadOv(); }
  }, [loaded, session, refresh, loadOv]);

  if (!loaded || !session || session.role !== 'superadmin') {
    return <div className="grid min-h-dvh place-items-center bg-slate-950"><Spinner /></div>;
  }

  const f = m?.funnel ?? { total: 0, trial: 0, paying: 0, grace: 0, suspended: 0 };
  const conv = m?.conversion ?? { trials_finished: 0, converted: 0 };
  const convPct = conv.trials_finished > 0 ? Math.round((conv.converted / conv.trials_finished) * 100) : null;
  const orgs = (m?.organizations ?? []).filter((o) => filter === 'all' || o.stage === filter);
  const growth = m?.growth ?? [];

  const cards: { key: Filter; label: string; value: number; on: string; text: string }[] = [
    { key: 'all',       label: 'Organizaciones',  value: f.total,     on: 'bg-blue-950/40 border-blue-500',       text: 'text-white' },
    { key: 'trial',     label: '🧪 En prueba',     value: f.trial,     on: 'bg-sky-950/40 border-sky-500',         text: 'text-sky-300' },
    { key: 'paying',    label: '🟢 Pagando',       value: f.paying,    on: 'bg-emerald-950/40 border-emerald-500', text: 'text-emerald-300' },
    { key: 'grace',     label: '🟡 En gracia',     value: f.grace,     on: 'bg-amber-950/40 border-amber-500',     text: 'text-amber-300' },
    { key: 'suspended', label: '🔴 Suspendidas',   value: f.suspended, on: 'bg-red-950/40 border-red-500',         text: 'text-red-300' },
  ];


  const funnelEl = (onPick: (k: Filter) => void) => (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {cards.map((c) => (
        <button key={c.key} onClick={() => onPick(c.key)}
          className={`cursor-pointer rounded-xl border p-4 text-left transition ${filter === c.key && tab === 'clients' ? c.on : 'border-slate-800 bg-slate-900/50 hover:border-slate-600'}`}>
          <p className="text-xs font-semibold text-slate-400">{c.label}</p>
          <p className={`mt-1 text-2xl font-extrabold ${c.text}`}>{c.value}</p>
        </button>
      ))}
    </div>
  );
  const TABS: { id: AdminTab; icon: string; label: string; d: string; n?: number }[] = [
    { id: 'home', icon: '📊', label: 'Resumen', d: 'Embudo de clientes, conversión y bajas' },
    { id: 'clients', icon: '🏢', label: 'Clientes', d: 'Organizaciones, empresas, sucursales, módulos y estado', n: f.total },
    { id: 'billing', icon: '💵', label: 'Cobros', d: 'Suscripciones, pagos y vencimientos' },
    { id: 'plans', icon: '🏷️', label: 'Planes', d: 'Precios, límites y funciones de cada plan' },
    { id: 'notices', icon: '📣', label: 'Avisos', d: 'Mensajes visibles para los clientes en su aplicación' },
    { id: 'usage', icon: '📦', label: 'Recursos', d: 'Almacenamiento y consumo por cliente' },
    { id: 'activity', icon: '🧾', label: 'Actividad', d: 'Registro de acciones realizadas en la plataforma' },
    { id: 'tools', icon: '🛠️', label: 'Plataforma', d: 'Idioma, país, limpieza y mantenimiento' },
  ];

  return (
    <main className="min-h-dvh bg-slate-950 text-white px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:p-8">
      <div className="w-full max-w-[1600px] mx-auto space-y-6 min-w-0">
        <NetBanner />
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="min-w-0">
            <span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-purple-400">
              🛡️ Superadmin
            </span>
            <h1 className="mt-2 text-xl font-bold sm:text-2xl">
              {t.globalConsole} <span className="text-blue-500">Veltrix Enterprise</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5">
              <p className="text-[10px] text-slate-400">Ingreso mensual (MRR)</p>
              <p className="text-sm font-bold text-emerald-400">{formatMoney(m?.mrr_usd ?? 0)}</p>
            </div>
            <button onClick={refresh} disabled={busy} aria-label="Actualizar"
              className="cursor-pointer rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs font-semibold hover:bg-slate-800 disabled:opacity-50">
              {busy ? '…' : '↻'}
            </button>
            <PlatformBell />
            <button onClick={logout}
              className="cursor-pointer rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs font-semibold text-red-400 hover:bg-red-500/20">
              Salir
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-xs font-semibold">
            ⚠️ {error}
          </div>
        )}

        <div className="space-y-5">
        {tab === 'menu' ? (
          <nav className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4" aria-label="Secciones">
            {TABS.map((x) => (
              <button key={x.id} type="button" onClick={() => setTab(x.id)}
                className="flex min-h-32 cursor-pointer flex-col items-start gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-start transition hover:border-blue-500 hover:bg-slate-900">
                <span className="flex w-full items-center justify-between"><span className="text-3xl" aria-hidden>{x.icon}</span>{x.n !== undefined && <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-200">{x.n}</span>}</span>
                <span className="text-base font-bold">{x.label}</span>
                <span className="text-xs leading-snug text-slate-400">{x.d}</span>
              </button>
            ))}
            <a href="/dashboard/admin/soporte" className="flex min-h-32 cursor-pointer flex-col items-start gap-1.5 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-start transition hover:bg-sky-500/20">
              <span className="text-3xl" aria-hidden>🎧</span>
              <span className="text-base font-bold text-sky-200">Soporte</span>
              <span className="text-xs leading-snug text-sky-300/80">Tickets, consultas y equipo de atención</span>
            </a>
          </nav>
        ) : (
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setTab('menu')} className="cursor-pointer rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold hover:bg-slate-800">← Menú</button>
            <h2 className="text-base font-bold">{TABS.find((x) => x.id === tab)?.icon} {TABS.find((x) => x.id === tab)?.label}</h2>
          </div>
        )}
        <div className="min-w-0 space-y-6">

        {tab === 'home' && (
        <>
        {funnelEl((k) => { setFilter(k); setTab('clients'); })}

        {/* CONVERSIÓN Y BAJAS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl border bg-slate-900/50 border-slate-800">
            <p className="text-xs text-slate-400 font-semibold">Conversión de prueba a pago</p>
            <p className="text-2xl font-extrabold mt-1 text-white">{convPct === null ? '—' : `${convPct}%`}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              {conv.converted} de {conv.trials_finished} pruebas terminadas pagaron
            </p>
          </div>
          <div className="p-4 rounded-xl border bg-slate-900/50 border-slate-800">
            <p className="text-xs text-slate-400 font-semibold">Bajas últimos 30 días</p>
            <p className="text-2xl font-extrabold mt-1 text-red-300">{m?.churn_30d ?? 0}</p>
            <p className="text-[11px] text-slate-500 mt-1">Empresas suspendidas por falta de pago</p>
          </div>
          <div className="p-4 rounded-xl border bg-slate-900/50 border-slate-800">
            <p className="text-xs text-slate-400 font-semibold">Pruebas activas</p>
            <p className="text-2xl font-extrabold mt-1 text-sky-300">{f.trial}</p>
            <p className="text-[11px] text-slate-500 mt-1">14 días gratis desde que se registran</p>
          </div>
        </div>


        {/* CRECIMIENTO */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <h2 className="text-sm font-bold">📈 Empresas nuevas por mes</h2>
            <p className="text-[11px] text-slate-500">Últimos 12 meses</p>
            <BarChart
              data={growth.map((g) => ({ label: monthLabel(g.month), value: g.new_orgs }))}
              color="bg-blue-500"
              format={(n) => String(n)}
            />
          </section>
          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <h2 className="text-sm font-bold">💰 Ingresos cobrados por mes</h2>
            <p className="text-[11px] text-slate-500">Pagos de suscripción confirmados</p>
            <BarChart
              data={growth.map((g) => ({ label: monthLabel(g.month), value: Number(g.revenue_usd) }))}
              color="bg-emerald-500"
              format={(n) => formatMoney(n)}
            />
          </section>
        </div>


        {/* PRUEBAS POR VENCER */}
        <section className="bg-slate-900/60 border border-sky-900/50 rounded-2xl p-5 space-y-3">
          <div>
            <h2 className="text-sm font-bold">⏰ Pruebas por vencer</h2>
            <p className="text-[11px] text-slate-500">Contáctelos antes de que finalice el período de prueba para su conversión a clientes.</p>
          </div>
          {(m?.trials_expiring ?? []).length === 0 ? (
            <p className="text-xs text-slate-500">No hay empresas en prueba por ahora.</p>
          ) : (
            <div className="space-y-2">
              {m!.trials_expiring.map((x) => (
                <div key={x.org_id} className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-3 text-xs">
                  <div>
                    <p className="font-bold text-sm">{x.name}</p>
                    <p className="text-slate-400">{x.email} · Plan {x.plan}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-full font-bold border ${
                      x.days_left <= 3 ? 'bg-red-500/10 text-red-300 border-red-500/30' : 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                    }`}>
                      {x.days_left === 0 ? 'Vence hoy' : `${x.days_left} día${x.days_left === 1 ? '' : 's'}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMail({
                        to: x.email, name: x.name,
                        subject: 'Su período de prueba de Veltrix',
                        text: `Estimado equipo de ${x.name}:\n\nLe escribimos porque a su período de prueba de Veltrix le ${x.days_left === 1 ? 'queda 1 día' : `quedan ${x.days_left} días`}. ¿Cómo ha sido su experiencia? Si tiene consultas o requiere asistencia para configurar su negocio, responda a este correo y le atenderemos.\n\nAtentamente,\nEquipo Veltrix`,
                      })}
                      className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 font-bold px-3 py-1.5 rounded-lg cursor-pointer"
                    >
                      ✉️ Escribir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        </>
        )}
        {tab === 'plans' && (
        <>
        {/* VELTRIX IA */}
        <section className="bg-slate-900/60 border border-violet-900/50 rounded-2xl p-5 space-y-3">
          <div>
            <h2 className="text-sm font-bold">✨ Veltrix IA (complemento pagado)</h2>
            <p className="text-[11px] text-slate-500">Cupo mensual de preguntas por empresa. 0 = apagada. El consumo se reinicia cada mes.</p>
          </div>
          <div className="space-y-2">
            {ai.map((o) => (
              <div key={o.org_id} className="flex flex-wrap items-center gap-3 bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-3 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm truncate">{o.name}</p>
                  <p className="text-slate-400">Usadas {o.used} de {o.quota} · tokens {o.tokens_in.toLocaleString()} entrada / {o.tokens_out.toLocaleString()} salida</p>
                </div>
                <input inputMode="numeric" value={aiEdit[o.org_id] ?? String(o.quota)} onChange={(e) => setAiEdit({ ...aiEdit, [o.org_id]: e.target.value.replace(/\D/g, '') })}
                  className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm" />
                <button type="button" onClick={() => saveQuota(o.org_id)} className="bg-violet-600/20 hover:bg-violet-600/30 text-violet-200 border border-violet-500/30 font-bold px-3 py-1.5 rounded-lg cursor-pointer">Guardar cuota</button>
              </div>
            ))}
          </div>
        </section>

        {/* PLANES Y PRECIOS */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
          <div>
            <h2 className="text-sm font-bold">💲 Planes y precios</h2>
            <p className="text-[11px] text-slate-500">Modifique precios y límites en cualquier momento. Se aplican de inmediato en la portada, en "Mi plan" y en los límites de cada empresa. Si modifica un precio, actualícelo también en Paddle (Catálogo → Precios).</p>
          </div>
          {planMsg && <p className="text-xs font-semibold text-slate-200">{planMsg}</p>}
          <div className="grid gap-3 lg:grid-cols-3">
            {plans.map((p) => (
              <div key={p.code} className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <input value={planVal(p, 'name')} onChange={(e) => setPlanEdit({ ...planEdit, [p.code]: { ...planEdit[p.code], name: e.target.value } })}
                    className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm font-bold" />
                  <span className="shrink-0 text-slate-400">{p.orgs} empresas</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {PLAN_FIELDS.map(([k, label]) => (
                    <label key={k} className="block">
                      <span className="block text-[11px] text-slate-400 mb-0.5">{label}</span>
                      <input inputMode="decimal" value={planVal(p, k)}
                        onChange={(e) => setPlanEdit({ ...planEdit, [p.code]: { ...planEdit[p.code], [k]: e.target.value } })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm" />
                    </label>
                  ))}
                </div>
                {planEdit[p.code] && (
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setPlanEdit((e) => { const c = { ...e }; delete c[p.code]; return c; })} className="flex-1 border border-slate-700 font-bold px-3 py-1.5 rounded-lg cursor-pointer">Cancelar</button>
                    <button type="button" onClick={() => savePlan(p)} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg cursor-pointer">Guardar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {street && (
            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-bold text-slate-300">🛵 Plan exclusivo de cobranza en calle y microfinanzas (bolivianos al mes; se muestra al cliente al final del registro)</h3>
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {([['base_bs', 'Base (1 administrador + 1 cobrador), Bs'], ['collector_bs', 'Cada cobrador adicional, Bs'], ['collectors_per_supervisor', 'Un supervisor cada N cobradores'], ['manager_after_collectors', 'Gerente después del cobrador N']] as [keyof StreetCfg, string][]).map(([k, label]) => (
                    <label key={k} className="block">
                      <span className="block text-[11px] text-slate-400 mb-0.5">{label}</span>
                      <input inputMode="decimal" value={stVal(k)} onChange={(e) => setStEdit({ ...stEdit, [k]: e.target.value })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm" />
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={stEdit.manager_free !== undefined ? stEdit.manager_free === 'true' : street.manager_free}
                    onChange={(e) => setStEdit({ ...stEdit, manager_free: String(e.target.checked) })} />
                  <span>Gerente sin costo</span>
                </label>
                {Object.keys(stEdit).length > 0 && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setStEdit({})} className="flex-1 border border-slate-700 font-bold px-3 py-1.5 rounded-lg cursor-pointer">Cancelar</button>
                    <button type="button" onClick={saveStreet} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg cursor-pointer">Guardar</button>
                  </div>
                )}
              </div>
            </div>
          )}
          {addons.length > 0 && (
            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-bold text-slate-300">➕ Complementos que el administrador de cada empresa puede contratar sin cambiar de plan (precio mensual por unidad)</h3>
              <div className="grid gap-3 lg:grid-cols-3">
                {addons.map((a) => (
                  <div key={a.code} className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
                    <p className="text-sm font-bold">{ADDON_NAME[a.code] ?? a.code}{a.code === 'storage' && <span className="text-slate-400 font-normal"> · {Math.round(a.unit_mb / 1024)} GB por unidad</span>}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([['price_usd', 'Latam (USD)'], ['price_global_usd', 'Mundo (USD)'], ['max_units', 'Máximo']] as [keyof AdminAddon, string][]).map(([k, label]) => (
                        <label key={k} className="block">
                          <span className="block text-[11px] text-slate-400 mb-0.5">{label}</span>
                          <input inputMode="decimal" value={adVal(a, k)}
                            onChange={(e) => setAdEdit({ ...adEdit, [a.code]: { ...adEdit[a.code], [k]: e.target.value } })}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm" />
                        </label>
                      ))}
                    </div>
                    {adEdit[a.code] && (
                      <div className="flex gap-2 pt-1">
                        <button type="button" onClick={() => setAdEdit((e) => { const c = { ...e }; delete c[a.code]; return c; })} className="flex-1 border border-slate-700 font-bold px-3 py-1.5 rounded-lg cursor-pointer">Cancelar</button>
                        <button type="button" onClick={() => saveAddon(a)} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg cursor-pointer">Guardar</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        </>
        )}

        {tab === 'billing' && (
        <>
        {/* PAGOS POR TRANSFERENCIA O QR */}
        <TransferAdmin />
        <StreetRequests />

        {/* PILOTOS Y FUNDADORES */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
          <div>
            <h2 className="text-sm font-bold">🤝 Pilotos y precio fundador</h2>
            <p className="text-[11px] text-slate-500">Días gratis con todo el plan. Al terminar paga con descuento de fundador durante los meses que elijas (no es de por vida) y luego el precio normal. Registra aquí los pagos por QR o transferencia.</p>
          </div>
          {pMsg && <p className="text-xs font-semibold text-slate-200">{pMsg}</p>}
          <div className="space-y-2">
            {pilots.map((o) => (
              <div key={o.org_id} className="bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-3 text-xs space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm truncate">
                      {o.name} <span className="text-slate-500 font-normal">· {o.plan}</span>
                      {o.is_pilot && <span className="ms-2 text-[11px] px-2 py-0.5 rounded-full font-bold border bg-sky-500/10 text-sky-300 border-sky-500/30">Piloto</span>}
                    </p>
                    <p className="text-slate-400">
                      {o.is_pilot && o.pilot_ends ? `Gratis hasta ${fmtDate(o.pilot_ends)} · ` : ''}
                      {o.founder_until ? `Fundador −${o.founder_discount_pct}% hasta ${fmtDate(o.founder_until)} · ` : ''}
                      {Number(o.referral_credit_pct ?? 0) > 0 ? `🎁 Descuento por invitar −${o.referral_credit_pct}% en su próximo pago (con tarjeta se aplica solo en Paddle) · ` : ''}
                      Próximo cobro {fmtDate(o.next_billing_date)}
                      {o.last_payment ? ` · Último pago ${fmtDate(o.last_payment)}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-emerald-400 text-sm">{formatMoney(Number(o.price_now))}/mes</p>
                    {Number(o.price_now) !== Number(o.price_usd) && <p className="text-slate-500 line-through">{formatMoney(Number(o.price_usd))}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setPForm({ org: o.org_id, kind: 'pilot', a: '60', b: '50', c: '12' })} className="bg-sky-600/20 hover:bg-sky-600/30 text-sky-200 border border-sky-500/30 font-bold px-3 py-1.5 rounded-lg cursor-pointer">🧪 Activar piloto</button>
                  <button type="button" onClick={() => setPForm({ org: o.org_id, kind: 'pay', a: String(o.price_now), b: '1', c: '' })} className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-200 border border-emerald-500/30 font-bold px-3 py-1.5 rounded-lg cursor-pointer">💵 Registrar pago</button>
                  {o.founder_until && <button type="button" onClick={() => clearPilot(o.org_id)} className="border border-slate-700 text-slate-300 font-bold px-3 py-1.5 rounded-lg cursor-pointer">Retirar descuento</button>}
                </div>
                {pForm?.org === o.org_id && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end border-t border-slate-800 pt-2">
                    {(pForm.kind === 'pilot'
                      ? [['a', 'Días gratis'], ['b', 'Descuento fundador %'], ['c', 'Meses con descuento']]
                      : [['a', 'Monto USD'], ['b', 'Meses que paga'], ['c', 'Referencia (n.º de QR o transferencia)']]
                    ).map(([k, label]) => (
                      <label key={k} className="block">
                        <span className="block text-[11px] text-slate-400 mb-1">{label}</span>
                        <input value={pForm[k as 'a' | 'b' | 'c']} inputMode={k === 'c' && pForm.kind === 'pay' ? 'text' : 'decimal'}
                          onChange={(e) => setPForm({ ...pForm, [k]: e.target.value })}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm" />
                      </label>
                    ))}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setPForm(null)} className="flex-1 border border-slate-700 font-bold px-3 py-1.5 rounded-lg cursor-pointer">Cancelar</button>
                      <button type="button" onClick={savePilot} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg cursor-pointer">Guardar</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
        </>
        )}

        {tab === 'clients' && (
          <section className="space-y-3">
            {funnelEl((k) => setFilter(k))}
            <h2 className="text-sm font-bold">
              🏢 {filter === 'all' ? 'Todas las organizaciones' : STAGE_INFO[filter].label} ({orgs.length})
            </h2>
            {orgs.length === 0 && (
              <p className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-500">
                {busy ? 'Cargando…' : 'No hay organizaciones en esta etapa.'}
              </p>
            )}
            {orgs.map((o) => {
              const d = ov[o.org_id];
              const nBranches = d ? d.companies.reduce((a, c) => a + c.branches.length, 0) : 0;
              const cats: string[] = d ? Array.from(new Set<string>(d.companies.flatMap((c) => c.cats))) : [];
              const isOpen = open === o.org_id;
              return (
                <div key={o.org_id} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="flex flex-col justify-between gap-3 md:flex-row">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold">{o.name}</h3>
                        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${STAGE_INFO[o.stage].badge}`}>{STAGE_INFO[o.stage].label}</span>
                        <span className="rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] font-bold text-slate-300">Plan {o.plan}</span>
                      </div>
                      <p className="truncate text-xs text-slate-400">{o.email}</p>
                      <p className="text-[11px] text-slate-500">
                        Registrada: {fmtDate(o.created_at)}
                        {o.trial_ends_at && ` · Prueba hasta: ${fmtDate(o.trial_ends_at)}`}
                        {` · Próximo cobro: ${fmtDate(o.next_billing_date)}`}
                      </p>
                    </div>
                    <div className="self-end text-right md:self-center">
                      <p className="text-[11px] text-slate-400">Mensualidad</p>
                      <p className="text-lg font-bold text-emerald-400">{formatMoney(Number(o.price_usd))}</p>
                    </div>
                  </div>

                  {d && (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {([['🏢 Empresas', d.companies.length, d.limits.companies], ['📍 Sucursales', nBranches, d.limits.branches], ['👥 Usuarios', d.users, d.limits.users]] as const).map(([l, n, max]) => (
                          <div key={l} className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-2">
                            <p className="text-[10px] font-semibold text-slate-400">{l}</p>
                            <p className="text-base font-extrabold">{n}<span className="text-xs font-semibold text-slate-500"> / {max}</span></p>
                          </div>
                        ))}
                      </div>
                      {cats.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {cats.map((c) => <span key={c} className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-300">{CAT_LABEL[c] ?? c}</span>)}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {d.modules.map((x) => <span key={x} className="rounded-md border border-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-300">{MOD_LABEL[x] ?? x}</span>)}
                      </div>
                      <button type="button" onClick={() => setOpen(isOpen ? null : o.org_id)} className="cursor-pointer text-xs font-semibold text-sky-300 hover:underline">
                        {isOpen ? '▲ Ocultar detalle' : '▼ Ver empresas, sucursales y equipo'}
                      </button>
                      {isOpen && (
                        <div className="grid gap-3 md:grid-cols-2">
                          <ul className="space-y-2">
                            {d.companies.map((c) => (
                              <li key={c.name} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs">
                                <p className="font-bold">{c.name}</p>
                                <p className="text-slate-400">{c.cats.map((x) => CAT_LABEL[x] ?? x).join(' · ') || '—'}</p>
                                <p className="mt-1 text-slate-500">📍 {c.branches.join(' · ') || 'Sin sucursales'}</p>
                              </li>
                            ))}
                          </ul>
                          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs">
                            <p className="mb-1 font-bold">Equipo por cargo</p>
                            <ul className="space-y-0.5">
                              {Object.entries(d.roles).map(([r, n]) => (
                                <li key={r} className="flex justify-between"><span className="text-slate-300">{ROLE_LABEL[r] ?? r}</span><span className="font-bold">{n}</span></li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex justify-end"><PurgeOrg orgId={o.org_id} name={o.name} onDone={afterPurge} /></div>
                </div>
              );
            })}
          </section>
        )}


        {tab === 'notices' && <AvisosPanel orgs={(m?.organizations ?? []).map((o) => ({ org_id: o.org_id, name: o.name }))} />}
        {tab === 'usage' && <RecursosPanel />}
        {tab === 'activity' && <ActividadPanel />}

        {tab === 'tools' && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold">🛠️ Plataforma</h2>
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><span className="text-xs font-semibold text-slate-400">País, moneda e idioma del panel</span><LanguageDropdown /></div>
            <RegionalStatusBar />
            <div className="flex flex-wrap items-start gap-2"><AutoPurgePanel onDone={setPurgeDone} /><SweepFiles onDone={setPurgeDone} /></div>
            {purgeDone && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs font-semibold text-emerald-300">{purgeDone}</p>}
          </section>
        )}

        </div>
        </div>
      </div>
      {mailMsg && !mail && (
        <div className="fixed inset-x-0 bottom-4 z-50 mx-auto w-fit max-w-[90vw] rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold shadow-xl">{mailMsg}</div>
      )}
      {mail && (
        <div className="fixed inset-x-0 top-0 z-50 h-dvh">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMail(null)} />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[90dvh] max-w-xl space-y-3 overflow-y-auto rounded-t-3xl bg-slate-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">✉️ Correo a {mail.name}</h2>
              <button type="button" onClick={() => setMail(null)} className="h-9 w-9 rounded-lg border border-slate-700 cursor-pointer">✕</button>
            </div>
            <p className="text-xs text-slate-400">Se envía desde el correo institucional de Veltrix (veltrixsystem.app), no desde un correo personal.</p>
            <p className="text-sm"><span className="text-slate-400">Para:</span> {mail.to}</p>
            <input value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
            <textarea rows={9} value={mail.text} onChange={(e) => setMail({ ...mail, text: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
            {mailMsg && <p className="text-sm font-semibold text-amber-300">{mailMsg}</p>}
            <button type="button" disabled={sending} onClick={sendMail} className="w-full rounded-xl bg-blue-600 py-3 font-bold cursor-pointer disabled:opacity-50">
              {sending ? 'Enviando…' : 'Enviar desde Veltrix'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
