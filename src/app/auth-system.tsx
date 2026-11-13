'use client';
// =====================================================================
//  Veltrix · Sistema de acceso conectado a Supabase
//
//  Mantiene EXACTAMENTE los mismos nombres que usaban las pantallas
//  (useVeltrixAuth, login, registerCompany, addWorkerToCompany, ...),
//  pero ahora los datos viven en la base de datos real, no en el navegador.
//  La versión anterior (demo con localStorage) quedó en /respaldo.
// =====================================================================
import { useCallback, useEffect, useState } from 'react';
import { supabase, rpc } from '../lib/supabase';
import { COUNTRIES, CountryCode, TaxRegimeId, BusinessSectorId } from './language-selector';

export type UserRole = 'superadmin' | 'owner' | 'cashier' | 'vendor' | 'collector' | 'supervisor';

export interface WorkerAccount {
  id: string;
  companyId: string;
  name: string;
  email: string;
  password: string; // ya no se guarda: siempre vacío (la clave vive en Supabase Auth)
  role: 'cashier' | 'vendor' | 'collector' | 'supervisor';
  active: boolean;
}

export interface TenantCompany {
  id: string;        // id de la empresa (companies.id); para el superadmin, id de la organización
  orgId: string;
  name: string;
  taxId: string;
  type: string;
  countryCode: CountryCode;
  regime: TaxRegimeId;
  sector: BusinessSectorId;
  modules: string[];
  plan: number;
  daysOverdue: number; // 0 = Activa | 1-7 = Gracia | 8-30 = Suspendida (solo lectura)
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string; // siempre vacío
}

export interface ActiveSession {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  companyId: string | null;
}

type NewCompany = {
  name: string; taxId: string; type: string; plan: number; modules: string[];
  ownerName: string; ownerEmail: string; ownerPassword: string;
};

const PENDING_KEY = 'veltrix_pending_org';
const DAY = 24 * 60 * 60 * 1000;

// ---------- utilidades ----------
function readLocal(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function daysOverdueFrom(status: string, graceEndsAt: string | null): number {
  if (status === 'active') return 0;
  const ends = graceEndsAt ? new Date(graceEndsAt).getTime() : Date.now();
  if (status === 'past_due_grace') {
    const left = Math.ceil((ends - Date.now()) / DAY);
    return Math.min(7, Math.max(1, 7 - left));
  }
  return Math.min(30, 8 + Math.max(0, Math.floor((Date.now() - ends) / DAY)));
}

function regionFromBrowser() {
  const code = (readLocal('veltrix_country') as CountryCode | null) ?? 'BO';
  const country = COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
  const regime = (readLocal('veltrix_tax_regime') as TaxRegimeId | null) ?? 'general';
  const sector = (readLocal('veltrix_sector') as BusinessSectorId | null) ?? 'standard';
  return { country, regime, sector };
}

function alertError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error('Veltrix:', msg);
  if (typeof window !== 'undefined') window.alert(msg);
}

// Crea la organización completa para el usuario ya autenticado
async function finishRegistration(details: NewCompany, email: string) {
  const { country, regime, sector } = regionFromBrowser();
  // Durante el desarrollo todas las cuentas usan el plan con todos los módulos.
  // Cuando definas precios, cambia 'enterprise' según details.plan.
  await rpc('create_organization', {
    p_org_name: details.name,
    p_billing_email: email,
    p_plan_code: 'enterprise',
    p_full_name: details.ownerName,
    p_legal_name: details.name,
    p_country: country.code,
    p_currency: country.currency,
    p_tax_id: details.taxId || null,
  });
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (uid) await supabase.from('profiles').update({ email }).eq('id', uid);

  const { data: comp } = await supabase.from('companies').select('id').limit(1).single();
  if (comp) {
    await supabase.from('companies')
      .update({ business_type: details.type, tax_regime: regime, business_sector: sector,
                tax_rate: country.taxRate / 100 })
      .eq('id', comp.id);
    await rpc('bootstrap_company', { p_company: comp.id });
  }
}

// ---------- hook principal ----------
export function useVeltrixAuth() {
  const [companies, setCompanies] = useState<TenantCompany[]>([]);
  const [workers, setWorkers] = useState<WorkerAccount[]>([]);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<ActiveSession | null> => {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) {
      setSession(null); setCompanies([]); setWorkers([]); setLoaded(true);
      return null;
    }

    const [{ data: admin }, { data: profile }, { data: myMems }] = await Promise.all([
      supabase.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
      supabase.from('profiles').select('id, full_name, email, org_id').eq('id', user.id).maybeSingle(),
      supabase.from('memberships').select('role, company_id, org_id').eq('user_id', user.id)
        .eq('is_active', true).is('deleted_at', null),
    ]);

    const roles = (myMems ?? []).map((m) => m.role as string);
    const role: UserRole = admin ? 'superadmin'
      : roles.includes('owner') ? 'owner'
      : ((roles[0] ?? 'vendor') as UserRole);

    // ----- Empresas visibles -----
    const { data: orgs } = await supabase.from('organizations')
      .select('id, name, billing_email, subscription_status, grace_ends_at, plans(price_usd)');
    const { data: mods } = await supabase.from('org_modules').select('org_id, module').eq('enabled', true);
    const modsByOrg = new Map<string, string[]>();
    (mods ?? []).forEach((m) => modsByOrg.set(m.org_id, [...(modsByOrg.get(m.org_id) ?? []), m.module]));

    let list: TenantCompany[] = [];
    if (role === 'superadmin') {
      // El superadmin solo ve datos de suscripción, nunca la operación interna
      list = (orgs ?? []).map((o) => ({
        id: o.id, orgId: o.id, name: o.name, taxId: '', type: '', countryCode: 'BO' as CountryCode,
        regime: 'general' as TaxRegimeId, sector: 'standard' as BusinessSectorId,
        modules: modsByOrg.get(o.id) ?? [],
        plan: Number((o.plans as unknown as { price_usd: number } | null)?.price_usd ?? 0),
        daysOverdue: daysOverdueFrom(o.subscription_status, o.grace_ends_at),
        ownerName: '', ownerEmail: o.billing_email, ownerPassword: '',
      }));
    } else {
      const { data: comps } = await supabase.from('companies')
        .select('id, org_id, legal_name, tax_id, country_code, tax_regime, business_type, business_sector')
        .is('deleted_at', null);
      const { data: owners } = await supabase.from('memberships').select('user_id, org_id').eq('role', 'owner');
      const ownerIds = (owners ?? []).map((o) => o.user_id);
      const { data: ownerProfiles } = ownerIds.length
        ? await supabase.from('profiles').select('id, full_name, email').in('id', ownerIds)
        : { data: [] as { id: string; full_name: string; email: string | null }[] };

      list = (comps ?? []).map((c) => {
        const o = (orgs ?? []).find((x) => x.id === c.org_id);
        const ownerId = (owners ?? []).find((x) => x.org_id === c.org_id)?.user_id;
        const op = (ownerProfiles ?? []).find((p) => p.id === ownerId);
        return {
          id: c.id, orgId: c.org_id, name: o?.name ?? c.legal_name, taxId: c.tax_id ?? '',
          type: c.business_type ?? '', countryCode: c.country_code as CountryCode,
          regime: (c.tax_regime ?? 'general') as TaxRegimeId,
          sector: (c.business_sector ?? 'standard') as BusinessSectorId,
          modules: modsByOrg.get(c.org_id) ?? [],
          plan: Number((o?.plans as unknown as { price_usd: number } | null)?.price_usd ?? 0),
          daysOverdue: o ? daysOverdueFrom(o.subscription_status, o.grace_ends_at) : 0,
          ownerName: op?.full_name ?? '', ownerEmail: op?.email ?? o?.billing_email ?? '', ownerPassword: '',
        };
      });

      // ----- Trabajadores (solo el dueño/supervisor los ve todos) -----
      const { data: mems } = await supabase.from('memberships')
        .select('user_id, company_id, role, is_active').neq('role', 'owner').is('deleted_at', null);
      const ids = Array.from(new Set((mems ?? []).map((m) => m.user_id)));
      const { data: profs } = ids.length
        ? await supabase.from('profiles').select('id, full_name, email, is_active').in('id', ids)
        : { data: [] as { id: string; full_name: string; email: string | null; is_active: boolean }[] };
      setWorkers((mems ?? []).map((m) => {
        const p = (profs ?? []).find((x) => x.id === m.user_id);
        return {
          id: m.user_id, companyId: m.company_id, name: p?.full_name ?? '', email: p?.email ?? '',
          password: '', role: m.role as WorkerAccount['role'],
          active: Boolean(m.is_active && (p?.is_active ?? true)),
        };
      }));
    }
    setCompanies(list);

    const companyId = (myMems ?? []).find((m) => m.company_id)?.company_id
      ?? list.find((c) => c.orgId === profile?.org_id)?.id ?? null;
    const s: ActiveSession = {
      userId: user.id,
      name: profile?.full_name ?? user.email ?? '',
      email: user.email ?? '',
      role,
      companyId: role === 'superadmin' ? null : companyId,
    };
    setSession(s);
    setLoaded(true);
    return s;
  }, []);

  useEffect(() => {
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setSession(null); setCompanies([]); setWorkers([]); }
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const login = async (
    emailInput: string,
    passInput: string
  ): Promise<{ ok: boolean; error?: string; session?: ActiveSession }> => {
    const email = emailInput.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({ email, password: passInput.trim() });
    if (error) return { ok: false, error: 'Correo o contraseña incorrectos.' };

    // Si se registró con confirmación por correo, termina de crear su empresa ahora
    try {
      const pending = readLocal(PENDING_KEY);
      if (pending) {
        const details = JSON.parse(pending) as NewCompany;
        const { data: prof } = await supabase.from('profiles').select('org_id').maybeSingle();
        if (details.ownerEmail.toLowerCase() === email && !prof?.org_id) {
          await finishRegistration(details, email);
        }
        localStorage.removeItem(PENDING_KEY);
      }
    } catch (e) { alertError(e); }

    const s = await load();
    if (!s) return { ok: false, error: 'No se pudo cargar la sesión.' };
    if (s.role !== 'superadmin' && s.role !== 'owner') {
      const my = companies.find((c) => c.id === s.companyId);
      if (my && my.daysOverdue > 7) {
        // Suspendida: puede entrar en modo solo lectura (la base bloquea las escrituras)
        console.warn('Veltrix: suscripción suspendida, modo solo lectura');
      }
    }
    return { ok: true, session: s };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    if (typeof window !== 'undefined') window.location.href = '/';
  };

  async function registerCompany(newComp: NewCompany) {
    const email = newComp.ownerEmail.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: newComp.ownerPassword,
      options: { data: { full_name: newComp.ownerName } },
    });
    if (error) { alertError(error); return null; }

    if (!data.session) {
      // Supabase pide confirmar el correo: guardamos los datos y se completa al primer ingreso
      try { localStorage.setItem(PENDING_KEY, JSON.stringify({ ...newComp, ownerPassword: '' })); } catch {}
      window.alert('Te enviamos un correo para confirmar la cuenta. Después ingresa con tu correo y contraseña.');
      return null;
    }
    try {
      await finishRegistration(newComp, email);
      await load();
    } catch (e) { alertError(e); }
    return null;
  }

  const addWorkerToCompany = async (worker: Omit<WorkerAccount, 'id' | 'active'>) => {
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify(worker),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'No se pudo crear el trabajador');
      await load();
    } catch (e) { alertError(e); }
  };

  const toggleWorkerStatus = async (workerId: string) => {
    const w = workers.find((x) => x.id === workerId);
    if (!w) return;
    const { error } = await supabase.from('profiles').update({ is_active: !w.active }).eq('id', workerId);
    if (error) alertError(error); else await load();
  };

  // Solo el superadmin (o la pasarela de pago) cambia el estado de suscripción
  const updateCompanyOverdue = async (companyOrOrgId: string, daysOverdue: number) => {
    const c = companies.find((x) => x.id === companyOrOrgId);
    const orgId = c?.orgId ?? companyOrOrgId;
    const patch = daysOverdue <= 0
      ? { subscription_status: 'active', grace_ends_at: null }
      : daysOverdue <= 7
        ? { subscription_status: 'past_due_grace', grace_ends_at: new Date(Date.now() + (7 - daysOverdue) * DAY).toISOString() }
        : { subscription_status: 'suspended', grace_ends_at: new Date(Date.now() - (daysOverdue - 8) * DAY).toISOString() };
    const { error } = await supabase.from('organizations').update(patch).eq('id', orgId);
    if (error) alertError(error); else await load();
  };

  return {
    loaded,
    companies,
    workers,
    session,
    login,
    logout,
    registerCompany,
    addWorkerToCompany,
    toggleWorkerStatus,
    updateCompanyOverdue,
    reload: load,
  };
}
