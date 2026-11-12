'use client';
import { useState } from 'react';
import Link from 'next/link';

const availableModules = [
  { id: 'crm', name: 'CRM & Clientes', desc: 'Gestión de prospectos, embudos y relaciones comerciales.', price: 15, active: true },
  { id: 'pos', name: 'Punto de Venta (POS)', desc: 'Facturación rápida, caja y control de inventario.', price: 20, active: true },
  { id: 'credits', name: 'Control de Créditos', desc: 'Gestión de préstamos, cuotas y carteras de cobro.', price: 25, active: false },
  { id: 'hr', name: 'Recursos Humanos', desc: 'Control de personal, asistencia y nómina.', price: 15, active: false },
];

export default function Home() {
  const [modules, setModules] = useState(availableModules);

  const toggleModule = (id: string) => {
    setModules(modules.map(m => m.id === id ? { ...m, active: !m.active } : m));
  };

  const totalPrice = modules
    .filter(m => m.active)
    .reduce((sum, m) => sum + m.price, 0);

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8 flex flex-col items-center">
      <div className="max-w-4xl w-full space-y-8">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-6 gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
              Panel de Control SaaS
            </span>
            <h1 className="text-3xl font-bold mt-2">Veltrix <span className="text-blue-500">System</span></h1>
          </div>
          <div className="bg-slate-900 border border-slate-800 px-5 py-3 rounded-xl flex items-center gap-6">
            <div>
              <p className="text-xs text-slate-400">Suscripción Mensual</p>
              <p className="text-2xl font-bold text-emerald-400">${totalPrice} <span className="text-xs text-slate-400 font-normal">USD/mes</span></p>
            </div>
            <Link 
              href="/dashboard/admin" 
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium text-sm transition"
            >
              Ir a Consola Admin →
            </Link>
          </div>
        </header>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-200">Configuración de Módulos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {modules.map((mod) => (
              <div 
                key={mod.id} 
                onClick={() => toggleModule(mod.id)}
                className={`p-5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                  mod.active 
                    ? 'bg-slate-900/80 border-blue-500/50 shadow-lg shadow-blue-500/5' 
                    : 'bg-slate-900/30 border-slate-800 opacity-60 hover:opacity-100'
                }`}
              >
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold text-lg">{mod.name}</h3>
                    <span className="text-sm font-semibold text-slate-300">${mod.price}/mes</span>
                  </div>
                  <p className="text-sm text-slate-400">{mod.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}