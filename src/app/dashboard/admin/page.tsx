'use client';
import { useState } from 'react';
import Link from 'next/link';

const initialClients = [
  { 
    id: 1, 
    name: 'Restaurante El Buen Sabor', 
    type: 'Restaurante (Venta Libre)', 
    modules: ['POS (Sin Stock)', 'Caja'], 
    plan: 20, 
    active: true 
  },
  { 
    id: 2, 
    name: 'Ferretería Industrial Norte', 
    type: 'Comercio con Inventario', 
    modules: ['POS (Con Stock)', 'CRM', 'Contabilidad'], 
    plan: 50, 
    active: true 
  },
  { 
    id: 3, 
    name: 'Inversiones & Créditos Rápidos', 
    type: 'Financiera / Cobranzas', 
    modules: ['CRM', 'Control de Créditos'], 
    plan: 40, 
    active: false 
  },
];

export default function AdminPage() {
  const [clients, setClients] = useState(initialClients);

  const toggleClientStatus = (id: number) => {
    setClients(clients.map(c => c.id === id ? { ...c, active: !c.active } : c));
  };

  const totalRevenue = clients
    .filter(c => c.active)
    .reduce((sum, c) => sum + c.plan, 0);

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Encabezado del Super Admin */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-6 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Link href="/" className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition">
                ← Volver al Inicio
              </Link>
              <span className="text-xs font-semibold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">
                Modo Dios / Super Admin
              </span>
            </div>
            <h1 className="text-3xl font-bold mt-3">Consola Global <span className="text-blue-500">Veltrix</span></h1>
            <p className="text-slate-400 text-sm mt-1">Control de empresas registradas, licencias y módulos contratados.</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 px-6 py-4 rounded-xl flex items-center gap-6">
            <div>
              <p className="text-xs text-slate-400">Ingresos Mensuales (MRR)</p>
              <p className="text-2xl font-bold text-emerald-400">${totalRevenue} <span className="text-xs text-slate-400 font-normal">USD/mes</span></p>
            </div>
            <button className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition">
              + Nueva Empresa
            </button>
          </div>
        </header>

        {/* Tabla de Empresas Clientes */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-200">Empresas en el Ecosistema</h2>
          
          <div className="grid grid-cols-1 gap-4">
            {clients.map((client) => (
              <div 
                key={client.id} 
                className={`p-5 rounded-xl border transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
                  client.active ? 'bg-slate-900/70 border-slate-800' : 'bg-slate-900/20 border-red-900/30 opacity-60'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-lg">{client.name}</h3>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                      client.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {client.active ? 'Servicio Activo' : 'Suspendido por Impago'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">Giro de negocio: <strong className="text-slate-300">{client.type}</strong></p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {client.modules.map((mod, i) => (
                      <span key={i} className="text-xs bg-slate-800 text-blue-300 px-2.5 py-1 rounded-md border border-slate-700">
                        {mod}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-6 self-end md:self-center">
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Tarifa Mensual</p>
                    <p className="text-lg font-bold text-white">${client.plan} USD</p>
                  </div>
                  <button 
                    onClick={() => toggleClientStatus(client.id)}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                      client.active 
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20' 
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                    }`}
                  >
                    {client.active ? 'Suspender Acceso' : 'Reactivar Cuenta'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
}