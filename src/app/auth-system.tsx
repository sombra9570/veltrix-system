'use client';
import { useState, useEffect } from 'react';
import { CountryCode, TaxRegimeId, BusinessSectorId } from './language-selector';

export type UserRole = 'superadmin' | 'owner' | 'cashier' | 'vendor' | 'collector' | 'supervisor';

export interface WorkerAccount {
  id: number;
  companyId: number;
  name: string;
  email: string;
  password: string;
  role: 'cashier' | 'vendor' | 'collector' | 'supervisor';
  active: boolean;
}

export interface TenantCompany {
  id: number;
  name: string;
  taxId: string;
  type: string;
  countryCode: CountryCode;
  regime: TaxRegimeId;
  sector: BusinessSectorId;
  modules: string[];
  plan: number;
  daysOverdue: number; // 0 = Activa | 1-7 = Gracia Migración | 8-30 = Bóveda Retención
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
}

export interface ActiveSession {
  userId: number;
  name: string;
  email: string;
  role: UserRole;
  companyId: number | null;
}

export const INITIAL_COMPANIES: TenantCompany[] = [
  {
    id: 1,
    name: 'Restaurante El Buen Sabor',
    taxId: '4589210015',
    type: 'Gastronomía / POS',
    countryCode: 'BO',
    regime: 'simplified',
    sector: 'standard',
    modules: ['POS', 'CRM'],
    plan: 35,
    daysOverdue: 0,
    ownerName: 'Carlos Méndez',
    ownerEmail: 'dueno@buensabor.com',
    ownerPassword: '123',
  },
  {
    id: 2,
    name: 'Ferretería Industrial Norte',
    taxId: '1029384019',
    type: 'Comercio & Inventario',
    countryCode: 'BO',
    regime: 'general',
    sector: 'standard',
    modules: ['POS', 'CRM', 'Credit Control'],
    plan: 60,
    daysOverdue: 0,
    ownerName: 'Roberto Vargas',
    ownerEmail: 'dueno@ferreteria.com',
    ownerPassword: '123',
  },
];

export const INITIAL_WORKERS: WorkerAccount[] = [
  {
    id: 101,
    companyId: 1,
    name: 'Ana Rojas (Cajera)',
    email: 'caja@buensabor.com',
    password: '123',
    role: 'cashier',
    active: true,
  },
  {
    id: 102,
    companyId: 1,
    name: 'Luis Paz (Vendedor)',
    email: 'ventas@buensabor.com',
    password: '123',
    role: 'vendor',
    active: true,
  },
  {
    id: 103,
    companyId: 1,
    name: 'Mateo Cobranza (Ruta)',
    email: 'ruta@buensabor.com',
    password: '123',
    role: 'collector',
    active: true,
  },
  {
    id: 104,
    companyId: 1,
    name: 'Carla Supervisor (Cartera)',
    email: 'supervisor@buensabor.com',
    password: '123',
    role: 'supervisor',
    active: true,
  },
];

export function useVeltrixAuth() {
  const [companies, setCompanies] = useState<TenantCompany[]>(INITIAL_COMPANIES);
  const [workers, setWorkers] = useState<WorkerAccount[]>(INITIAL_WORKERS);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const savedComp = localStorage.getItem('veltrix_companies');
    if (savedComp) {
      try { setCompanies(JSON.parse(savedComp)); } catch {}
    }
    const savedWork = localStorage.getItem('veltrix_workers');
    if (savedWork) {
      try { setWorkers(JSON.parse(savedWork)); } catch {}
    }
    const savedSess = localStorage.getItem('veltrix_session');
    if (savedSess) {
      try { setSession(JSON.parse(savedSess)); } catch {}
    }
    setLoaded(true);
  }, []);

  const saveCompanies = (list: TenantCompany[]) => {
    setCompanies(list);
    localStorage.setItem('veltrix_companies', JSON.stringify(list));
  };

  const saveWorkers = (list: WorkerAccount[]) => {
    setWorkers(list);
    localStorage.setItem('veltrix_workers', JSON.stringify(list));
  };

  const login = (
    emailInput: string,
    passInput: string
  ): { ok: boolean; error?: string; session?: ActiveSession } => {
    const email = emailInput.trim().toLowerCase();
    const pass = passInput.trim();

    if (email === 'admin@veltrix.com' && pass === 'admin123') {
      const s: ActiveSession = {
        userId: 9999,
        name: 'Diego (Súper Admin)',
        email,
        role: 'superadmin',
        companyId: null,
      };
      setSession(s);
      localStorage.setItem('veltrix_session', JSON.stringify(s));
      return { ok: true, session: s };
    }

    const foundCompany = companies.find(
      (c) => c.ownerEmail.toLowerCase() === email && c.ownerPassword === pass
    );
    if (foundCompany) {
      const s: ActiveSession = {
        userId: foundCompany.id,
        name: foundCompany.ownerName,
        email: foundCompany.ownerEmail,
        role: 'owner',
        companyId: foundCompany.id,
      };
      setSession(s);
      localStorage.setItem('veltrix_session', JSON.stringify(s));
      return { ok: true, session: s };
    }

    const foundWorker = workers.find(
      (w) => w.email.toLowerCase() === email && w.password === pass
    );
    if (foundWorker) {
      if (!foundWorker.active) {
        return { ok: false, error: 'Tu cuenta de trabajador fue desactivada por el dueño.' };
      }
      const workerCompany = companies.find((c) => c.id === foundWorker.companyId);
      if (workerCompany && workerCompany.daysOverdue > 7) {
        return {
          ok: false,
          error: 'La suscripción de tu empresa está suspendida. Contacta al propietario.',
        };
      }
      const s: ActiveSession = {
        userId: foundWorker.id,
        name: foundWorker.name,
        email: foundWorker.email,
        role: foundWorker.role,
        companyId: foundWorker.companyId,
      };
      setSession(s);
      localStorage.setItem('veltrix_session', JSON.stringify(s));
      return { ok: true, session: s };
    }

    return { ok: false, error: 'Correo o contraseña incorrectos.' };
  };

  const logout = () => {
    setSession(null);
    localStorage.removeItem('veltrix_session');
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  function registerCompany(newComp: Omit<TenantCompany, 'id' | 'daysOverdue'>) {
    const created: TenantCompany = {
      ...newComp,
      id: Date.now(),
      daysOverdue: 0,
    };
    saveCompanies([created, ...companies]);

    const s: ActiveSession = {
      userId: created.id,
      name: created.ownerName,
      email: created.ownerEmail,
      role: 'owner',
      companyId: created.id,
    };
    setSession(s);
    localStorage.setItem('veltrix_session', JSON.stringify(s));
    return created;
  }

  const addWorkerToCompany = (worker: Omit<WorkerAccount, 'id' | 'active'>) => {
    const created: WorkerAccount = {
      ...worker,
      id: Date.now(),
      active: true,
    };
    saveWorkers([created, ...workers]);
  };

  const toggleWorkerStatus = (workerId: number) => {
    saveWorkers(workers.map((w) => (w.id === workerId ? { ...w, active: !w.active } : w)));
  };

  const updateCompanyOverdue = (companyId: number, daysOverdue: number) => {
    saveCompanies(
      companies.map((c) => (c.id === companyId ? { ...c, daysOverdue } : c))
    );
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
  };
}