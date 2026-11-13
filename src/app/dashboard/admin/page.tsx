'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  useLanguage,
  LanguageDropdown,
  RegionalStatusBar,
  COUNTRIES,
} from '../../language-selector';
import { useVeltrixAuth, TenantCompany } from '../../auth-system';

type FilterType = 'all' | 'active' | 'grace' | 'retention';

export default function GlobalCoreAdminPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterType>('all');
  const { t, country, formatMoney } = useLanguage();
  const { loaded, session, companies, logout, updateCompanyOverdue } = useVeltrixAuth();

  useEffect(() => {
    if (loaded && (!session || session.role !== 'superadmin')) {
      router.replace('/');
    }
  }, [loaded, session, router]);

  if (!loaded || !session || session.role !== 'superadmin') {
    return <div className="min-h-screen bg-slate-950" />;
  }

  const rawCountry = COUNTRIES.find((c) => c.code === country.code) || COUNTRIES[0];

  const getClientTaxRate = (client: TenantCompany): number => {
    if (client.regime === 'simplified' || client.regime === 'exempt') return 0;
    if (client.sector === 'essential') return rawCountry.reducedTaxRate;
    if (client.sector === 'special') return rawCountry.specialTaxRate;
    return rawCountry.taxRate;
  };

  const activeCount = companies.filter((c) => c.daysOverdue === 0).length;
  const graceCount = companies.filter((c) => c.daysOverdue >= 1 && c.daysOverdue <= 7).length;
  const retentionCount = companies.filter((c) => c.daysOverdue >= 8).length;

  const activeRevenueUsd = companies
    .filter((c) => c.daysOverdue === 0)
    .reduce((sum, c) => sum + c.plan, 0);

  const pendingRevenueUsd = companies
    .filter((c) => c.daysOverdue >= 1 && c.daysOverdue <= 30)
    .reduce((sum, c) => sum + c.plan, 0);

  const filteredClients = companies.filter((c) => {
    if (filter === 'active') return c.daysOverdue === 0;
    if (filter === 'grace') return c.daysOverdue >= 1 && c.daysOverdue <= 7;
    if (filter === 'retention') return c.daysOverdue >= 8;
    return true;
  });

  const handleLogout = () => {
    logout();
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-6 gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">
              🛡️ Veltrix Core Control · Auditoría Global Multi-Tenant
            </span>
            <h1 className="text-3xl font-bold mt-3">
              {t.globalConsole} <span className="text-blue-500">Veltrix Enterprise</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Supervisión de instancias corporativas, portabilidad (7 días) y custodia en bóveda (30 días).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <LanguageDropdown />
            <div className="bg-slate-900 border border-slate-800 px-5 py-3 rounded-xl flex items-center gap-5">
              <div>
                <p className="text-[11px] text-slate-400">{t.mrr} Activo</p>
                <p className="text-lg font-bold text-emerald-400">{formatMoney(activeRevenueUsd)}</p>
              </div>
              <div className="border-l border-slate-800 pl-5">
                <p className="text-[11px] text-amber-400">En Cobranza</p>
                <p className="text-lg font-bold text-amber-300">{formatMoney(pendingRevenueUsd)}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold px-4 py-2.5 rounded-lg cursor-pointer"
            >
              Cerrar Sesión Maestra
            </button>
          </div>
        </header>

        <RegionalStatusBar />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <button
            onClick={() => setFilter('all')}
            className={`p-4 rounded-xl border text-left transition cursor-pointer ${
              filter === 'all'
                ? 'bg-blue-950/40 border-blue-500'
                : 'bg-slate-900/50 border-slate-800'
            }`}
          >
            <p className="text-xs text-slate-400">Organizaciones Inscritas</p>
            <p className="text-2xl font-extrabold text-white mt-1">{companies.length}</p>
          </button>

          <button
            onClick={() => setFilter('active')}
            className={`p-4 rounded-xl border text-left transition cursor-pointer ${
              filter === 'active'
                ? 'bg-emerald-950/40 border-emerald-500'
                : 'bg-slate-900/50 border-slate-800'
            }`}
          >
            <p className="text-xs text-emerald-400 font-semibold">● Instancias Activas</p>
            <p className="text-2xl font-extrabold text-emerald-300 mt-1">{activeCount}</p>
          </button>

          <button
            onClick={() => setFilter('grace')}
            className={`p-4 rounded-xl border text-left transition cursor-pointer ${
              filter === 'grace'
                ? 'bg-amber-950/40 border-amber-500'
                : 'bg-slate-900/50 border-slate-800'
            }`}
          >
            <p className="text-xs text-amber-400 font-semibold">⏳ Portabilidad (≤ 7 días)</p>
            <p className="text-2xl font-extrabold text-amber-300 mt-1">{graceCount}</p>
          </button>

          <button
            onClick={() => setFilter('retention')}
            className={`p-4 rounded-xl border text-left transition cursor-pointer ${
              filter === 'retention'
                ? 'bg-red-950/40 border-red-500'
                : 'bg-slate-900/50 border-slate-800'
            }`}
          >
            <p className="text-xs text-red-400 font-semibold">🗄️ Custodia Bóveda (≤ 30 días)</p>
            <p className="text-2xl font-extrabold text-red-300 mt-1">{retentionCount}</p>
          </button>
        </div>

        <section className="space-y-4">
          {filteredClients.map((client) => {
            const clientTax = getClientTaxRate(client);
            const totalWithTaxUsd = client.plan * (1 + clientTax / 100);
            const isActive = client.daysOverdue === 0;
            const isGrace = client.daysOverdue >= 1 && client.daysOverdue <= 7;
            const graceDaysLeft = Math.max(0, 7 - client.daysOverdue);
            const retentionDaysLeft = Math.max(0, 30 - client.daysOverdue);

            return (
              <div
                key={client.id}
                className={`p-5 rounded-xl border flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 ${
                  isActive
                    ? 'bg-slate-900/70 border-slate-800'
                    : isGrace
                    ? 'bg-amber-950/15 border-amber-600/40'
                    : 'bg-red-950/15 border-red-800/40'
                }`}
              >
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="font-bold text-lg">{client.name}</h3>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-slate-800 text-slate-300">
                      Director: {client.ownerName} ({client.ownerEmail})
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30">
                      🏛️ {country.taxName}: {clientTax}%
                    </span>
                  </div>

                  <p className="text-xs text-slate-400">
                    División: <strong className="text-slate-300">{client.type}</strong> ·{' '}
                    {country.taxIdName}: <strong className="text-slate-300">{client.taxId}</strong>
                  </p>

                  {!isActive && (
                    <p className="text-xs text-amber-300">
                      {isGrace
                        ? `⏳ Día ${client.daysOverdue}/7 — Ventana de exportación habilitada (${graceDaysLeft}d restantes)`
                        : `🔒 Día ${client.daysOverdue}/30 — Base de datos en custodia (${retentionDaysLeft}d antes de depuración)`}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-4 self-end lg:self-center">
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Canon + {country.taxName}</p>
                    <p className="text-lg font-bold text-emerald-400">
                      {formatMoney(totalWithTaxUsd)}
                    </p>
                  </div>

                  <select
                    value={isActive ? '0' : isGrace ? '4' : '19'}
                    onChange={(e) => updateCompanyOverdue(client.id, Number(e.target.value))}
                    className="bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded-lg px-3 py-2 cursor-pointer"
                  >
                    <option value="0">🟢 Activa (0 mora)</option>
                    <option value="4">🟡 Portabilidad (Día 4/7)</option>
                    <option value="19">🟠 Bóveda 30d (Día 19/30)</option>
                  </select>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}