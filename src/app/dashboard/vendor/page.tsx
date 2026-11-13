'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage, LanguageDropdown, RegionalStatusBar } from '../../language-selector';
import { useVeltrixAuth } from '../../auth-system';

type PipelineStage = 'prospect' | 'proposal' | 'closed';

interface LeadRecord {
  id: number;
  clientName: string;
  contactPhone: string;
  dealValueUsd: number;
  stage: PipelineStage;
}

const INITIAL_LEADS: LeadRecord[] = [
  {
    id: 1,
    clientName: 'Distribuidora Cordillera S.R.L.',
    contactPhone: '700-48291',
    dealValueUsd: 420,
    stage: 'proposal',
  },
  {
    id: 2,
    clientName: 'Importadora Santa Cruz Norte',
    contactPhone: '755-19203',
    dealValueUsd: 850,
    stage: 'prospect',
  },
  {
    id: 3,
    clientName: 'Grupo Gastronómico Sur',
    contactPhone: '710-99384',
    dealValueUsd: 310,
    stage: 'closed',
  },
];

export default function VendorCrmStationPage() {
  const router = useRouter();
  const { country, formatMoney } = useLanguage();
  const { loaded, session, companies, logout } = useVeltrixAuth();

  const [leads, setLeads] = useState<LeadRecord[]>(INITIAL_LEADS);
  const [clientName, setClientName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [dealValueUsd, setDealValueUsd] = useState(250);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (loaded && (!session || session.role !== 'vendor')) {
      router.replace('/');
    }
  }, [loaded, session, router]);

  if (!loaded || !session || session.role !== 'vendor' || isLoggingOut) {
    return <div className="min-h-dvh bg-slate-950" />;
  }

  const myCompany = companies.find((c) => c.id === session.companyId);
  if (!myCompany) return null;

  const handleCreateLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || isLoggingOut) return;
    const created: LeadRecord = {
      id: Date.now(),
      clientName: clientName.trim(),
      contactPhone: contactPhone.trim() || `${country.phonePrefix} S/N`,
      dealValueUsd: Number(dealValueUsd) || 100,
      stage: 'prospect',
    };
    setLeads([created, ...leads]);
    setClientName('');
    setContactPhone('');
  };

  const advanceStage = (id: number, nextStage: PipelineStage) => {
    if (isLoggingOut) return;
    setLeads(leads.map((l) => (l.id === id ? { ...l, stage: nextStage } : l)));
  };

  const closedVolumeUsd = leads
    .filter((l) => l.stage === 'closed')
    .reduce((sum, l) => sum + l.dealValueUsd, 0);

  const handleLogout = () => {
    setIsLoggingOut(true); // Congela el renderizado de la UI de inmediato
    logout();
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  return (
    <main className="min-h-dvh bg-slate-950 text-white px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:p-8">
      <div className="w-full max-w-[1600px] mx-auto space-y-6 min-w-0">
        <header className="flex flex-wrap justify-between items-center border-b border-slate-800 pb-5 gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-3 py-1 rounded-full">
              📈 Estación Comercial CRM & Pipeline
            </span>
            <h1 className="text-2xl font-extrabold mt-2">{myCompany.name}</h1>
            <p className="text-xs text-slate-400">
              Ejecutivo Asignado: <strong className="text-white">{session.name}</strong> · Cartera Comercial Aislada
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-right">
              <p className="text-[11px] text-slate-400">Volumen Cerrado del Mes</p>
              <p className="text-base font-bold text-emerald-400">{formatMoney(closedVolumeUsd)}</p>
            </div>
            <LanguageDropdown />
            <button
              onClick={handleLogout}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold px-4 py-2.5 rounded-lg cursor-pointer"
            >
              Finalizar Sesión
            </button>
          </div>
        </header>

        <RegionalStatusBar />

        {/* Alta de Oportunidad Comercial */}
        <form
          onSubmit={handleCreateLead}
          className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs items-end"
        >
          <div>
            <label className="block text-slate-400 mb-1">Cuenta / Prospecto Corporativo *</label>
            <input
              type="text"
              required
              placeholder="Ej. Constructora del Oriente"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Teléfono ({country.phonePrefix})</label>
            <input
              type="text"
              placeholder={`${country.phonePrefix} 70000000`}
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Valor Estimado Cotización (USD)</label>
            <input
              type="number"
              value={dealValueUsd}
              onChange={(e) => setDealValueUsd(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-bold"
            />
          </div>
          <button
            type="submit"
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2.5 px-4 rounded-lg transition cursor-pointer"
          >
            + Registrar Oportunidad
          </button>
        </form>

        {/* Tablero Kanban del Embudo Comercial */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {(
            [
              { id: 'prospect', title: '1. Prospección & Contacto', badge: 'text-slate-300' },
              { id: 'proposal', title: '2. Propuesta Económica Enviada', badge: 'text-amber-300' },
              { id: 'closed', title: '3. Adjudicado / Venta Cerrada', badge: 'text-emerald-400' },
            ] as const
          ).map((col) => (
            <div
              key={col.id}
              className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3"
            >
              <h3 className={`text-sm font-bold ${col.badge}`}>{col.title}</h3>
              <div className="space-y-3">
                {leads
                  .filter((l) => l.stage === col.id)
                  .map((lead) => (
                    <div
                      key={lead.id}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs"
                    >
                      <p className="font-bold text-sm text-white">{lead.clientName}</p>
                      <p className="text-slate-400">Tel: {lead.contactPhone}</p>
                      <p className="font-extrabold text-cyan-300">
                        {formatMoney(lead.dealValueUsd)}
                      </p>
                      <div className="flex gap-2 pt-2">
                        {col.id !== 'prospect' && (
                          <button
                            type="button"
                            onClick={() => advanceStage(lead.id, 'prospect')}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] cursor-pointer"
                          >
                            ← Prospecto
                          </button>
                        )}
                        {col.id !== 'proposal' && (
                          <button
                            type="button"
                            onClick={() => advanceStage(lead.id, 'proposal')}
                            className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[11px] cursor-pointer"
                          >
                            Cotizar
                          </button>
                        )}
                        {col.id !== 'closed' && (
                          <button
                            type="button"
                            onClick={() => advanceStage(lead.id, 'closed')}
                            className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[11px] font-bold cursor-pointer"
                          >
                            ✓ Cerrar Venta
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}