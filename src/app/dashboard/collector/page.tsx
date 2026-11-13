'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage, LanguageDropdown, RegionalStatusBar } from '../../language-selector';
import { useVeltrixAuth } from '../../auth-system';

interface RouteAssignment {
  id: number;
  clientName: string;
  address: string;
  phone: string;
  overdueUsd: number;
  status: 'pending' | 'collected' | 'promised' | 'rejected';
}

const INITIAL_ROUTE: RouteAssignment[] = [
  { id: 1, clientName: 'Comercial El Ahorro S.R.L.', address: 'Av. 3 Pasos al Frente #240', phone: '352-9182', overdueUsd: 180, status: 'pending' },
  { id: 2, clientName: 'Ferretería Constructiva Ltda.', address: 'Radial 19, 4to Anillo', phone: '348-1920', overdueUsd: 450, status: 'pending' },
  { id: 3, clientName: 'Minimarket Don Pepe', address: 'Barrio Las Palmas, Calle 3', phone: '358-9921', overdueUsd: 120, status: 'pending' },
];

export default function FieldCollectorStationPage() {
  const router = useRouter();
  const { country, formatMoney } = useLanguage();
  const { loaded, session, companies, logout } = useVeltrixAuth();

  const [route, setRoute] = useState<RouteAssignment[]>(INITIAL_ROUTE);
  const [selectedClient, setSelectedClient] = useState<RouteAssignment | null>(null);
  const [collectionAmount, setCollectionAmount] = useState<number>(0);
  const [paymentChannel, setPaymentChannel] = useState<'cash' | 'qr'>('cash');
  const [shiftSettled, setShiftSettled] = useState(false);

  useEffect(() => {
    if (loaded && (!session || session.role !== 'collector')) {
      router.replace('/');
    }
  }, [loaded, session, router]);

  if (!loaded || !session || session.role !== 'collector') {
    return <div className="min-h-dvh bg-slate-950" />;
  }

  const myCompany = companies.find((c) => c.id === session.companyId) || companies[0];

  const handleRecordCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || collectionAmount <= 0) return;

    setRoute(
      route.map((item) =>
        item.id === selectedClient.id ? { ...item, status: 'collected' } : item
      )
    );
    setSelectedClient(null);
    setCollectionAmount(0);
  };

  const totalCollectedUsd = route
    .filter((r) => r.status === 'collected')
    .reduce((sum, r) => sum + r.overdueUsd, 0);

  const handleLogout = () => {
    logout();
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  return (
    <main className="min-h-dvh bg-slate-950 text-white px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-wrap justify-between items-center border-b border-slate-800 pb-5 gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1 rounded-full">
              🛵 Ruta de Cobranza en Calle (Modo Offline / Sincronizado)
            </span>
            <h1 className="text-2xl font-extrabold mt-2">{myCompany.name}</h1>
            <p className="text-xs text-slate-400">
              Cobrador en Ruta: <strong className="text-white">{session.name}</strong> · Zona Operativa: Santa Cruz Centro
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-right">
              <p className="text-[11px] text-slate-400">Efectivo Recaudado en Ruta</p>
              <p className="text-base font-bold text-amber-400">{formatMoney(totalCollectedUsd)}</p>
            </div>
            <LanguageDropdown />
            <button
              onClick={handleLogout}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold px-4 py-2.5 rounded-lg cursor-pointer"
            >
              Cerrar Jornada / Salir
            </button>
          </div>
        </header>

        <RegionalStatusBar />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-base font-bold text-slate-200">
              Itinerario Asignado del Día ({route.length} Clientes)
            </h2>
            <div className="space-y-3">
              {route.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${
                    item.status === 'collected'
                      ? 'bg-emerald-950/20 border-emerald-500/40'
                      : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-white">{item.clientName}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                        item.status === 'collected' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {item.status === 'collected' ? '✓ Cobrado / Sincronizado' : '⏳ Pendiente en Ruta'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">📍 {item.address} · Tel: {item.phone}</p>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400">Saldo Vencido</p>
                      <p className="text-sm font-extrabold text-amber-400">{formatMoney(item.overdueUsd)}</p>
                    </div>
                    {item.status !== 'collected' && (
                      <button
                        onClick={() => {
                          setSelectedClient(item);
                          setCollectionAmount(item.overdueUsd);
                        }}
                        className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold px-3.5 py-2 rounded-lg text-xs transition cursor-pointer"
                      >
                        Registrar Abono →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-bold border-b border-slate-800 pb-3">
              Liquidación de Visita en Terreno
            </h2>

            {selectedClient ? (
              <form onSubmit={handleRecordCollection} className="space-y-4 text-xs">
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                  <p className="text-slate-400">Cliente Seleccionado:</p>
                  <p className="font-bold text-sm text-white">{selectedClient.clientName}</p>
                  <p className="text-amber-300 font-semibold">Deuda Total: {formatMoney(selectedClient.overdueUsd)}</p>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Monto a Recaudar (USD) *</label>
                  <input
                    type="number"
                    value={collectionAmount}
                    onChange={(e) => setCollectionAmount(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Medio de Recepción</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentChannel('cash')}
                      className={`flex-1 py-2 rounded-lg font-bold cursor-pointer border ${
                        paymentChannel === 'cash' ? 'bg-amber-600/30 border-amber-500 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      💵 Efectivo (Bolsa)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentChannel('qr')}
                      className={`flex-1 py-2 rounded-lg font-bold cursor-pointer border ${
                        paymentChannel === 'qr' ? 'bg-blue-600/30 border-blue-500 text-blue-300' : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      📱 QR / Transferencia
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-sm transition cursor-pointer"
                >
                  ✓ Confirmar Abono y Sincronizar
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedClient(null)}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2 rounded-xl text-xs transition cursor-pointer"
                >
                  Cancelar
                </button>
              </form>
            ) : (
              <p className="text-xs text-slate-500 text-center py-12">
                Seleccione un cliente del itinerario de ruta para registrar un cobro o promesa de pago.
              </p>
            )}

            <div className="border-t border-slate-800 pt-4 space-y-2">
              <h3 className="font-bold text-xs text-slate-300">Resumen de Rendición al Supervisor:</h3>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Visitas Ejecutadas:</span>
                <span className="font-bold text-white">{route.filter(r => r.status === 'collected').length} / {route.length}</span>
              </div>
              <button
                type="button"
                onClick={() => setShiftSettled(true)}
                className="w-full mt-3 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                📥 Solicitar Arqueo de Rendición Final
              </button>
              {shiftSettled && (
                <p className="text-[11px] text-emerald-400 text-center font-semibold pt-1">
                  ✓ Rendición enviada a Tesorería corporativa exitosamente.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}