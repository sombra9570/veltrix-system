'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  useLanguage,
  LanguageDropdown,
  RegionalStatusBar,
  COUNTRIES,
} from '../../language-selector';
import { useVeltrixAuth } from '../../auth-system';

interface ProductItem {
  id: number;
  sku: string;
  name: string;
  priceUsd: number;
  stock: number;
}

interface CartItem extends ProductItem {
  qty: number;
}

const CATALOG_SEED: ProductItem[] = [
  { id: 1, sku: 'POS-101', name: 'Producto / Servicio Estándar A', priceUsd: 8.5, stock: 42 },
  { id: 2, sku: 'POS-102', name: 'Insumo Comercial Corporativo B', priceUsd: 15.0, stock: 28 },
  { id: 3, sku: 'POS-103', name: 'Paquete Operativo Ejecutivo C', priceUsd: 24.0, stock: 15 },
  { id: 4, sku: 'POS-104', name: 'Suministro Técnico Especial D', priceUsd: 5.25, stock: 90 },
  { id: 5, sku: 'POS-105', name: 'Licencia / Mantenimiento Express', priceUsd: 32.0, stock: 12 },
  { id: 6, sku: 'POS-106', name: 'Kit Mayorista Distribución', priceUsd: 48.0, stock: 9 },
];

export default function CashierTerminalPage() {
  const router = useRouter();
  const { country, formatMoney } = useLanguage();
  const { loaded, session, companies, logout } = useVeltrixAuth();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [clientTaxId, setClientTaxId] = useState('');
  const [clientName, setClientName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'qr' | 'card'>('cash');
  const [salesHistory, setSalesHistory] = useState<
    { id: number; client: string; totalUsd: number; method: string; time: string }[]
  >([]);

  useEffect(() => {
    if (loaded && (!session || session.role !== 'cashier')) {
      router.replace('/');
    }
  }, [loaded, session, router]);

  if (!loaded || !session || session.role !== 'cashier') {
    return <div className="min-h-dvh bg-slate-950" />;
  }

  const myCompany = companies.find((c) => c.id === session.companyId);
  if (!myCompany) return null;

  const rawCountry = COUNTRIES.find((c) => c.code === country.code) || COUNTRIES[0];

  // Impuesto calculado automáticamente según el encuadre fiscal de ESTA empresa
  const companyTaxRate =
    myCompany.regime === 'simplified' || myCompany.regime === 'exempt'
      ? 0
      : myCompany.sector === 'essential'
      ? rawCountry.reducedTaxRate
      : myCompany.sector === 'special'
      ? rawCountry.specialTaxRate
      : rawCountry.taxRate;

  const addToCart = (prod: ProductItem) => {
    const exists = cart.find((item) => item.id === prod.id);
    if (exists) {
      setCart(cart.map((item) => (item.id === prod.id ? { ...item, qty: item.qty + 1 } : item)));
    } else {
      setCart([...cart, { ...prod, qty: 1 }]);
    }
  };

  const updateQty = (id: number, delta: number) => {
    setCart(
      cart
        .map((item) => (item.id === id ? { ...item, qty: item.qty + delta } : item))
        .filter((item) => item.qty > 0)
    );
  };

  const subtotalUsd = cart.reduce((sum, item) => sum + item.priceUsd * item.qty, 0);
  const taxAmountUsd = subtotalUsd * (companyTaxRate / 100);
  const grandTotalUsd = subtotalUsd + taxAmountUsd;

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    const newTicket = {
      id: Math.floor(100000 + Math.random() * 900000),
      client: clientName.trim() || 'Consumidor Final',
      totalUsd: grandTotalUsd,
      method: paymentMethod.toUpperCase(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setSalesHistory([newTicket, ...salesHistory]);
    setCart([]);
    setClientTaxId('');
    setClientName('');
  };

  const shiftTotalUsd = salesHistory.reduce((sum, s) => sum + s.totalUsd, 0);

  const handleLogout = () => {
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
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full">
                💳 Terminal Operativa POS & Tesorería
              </span>
              <span className="text-xs text-slate-400">
                {country.taxIdName} Emisor: <strong className="text-slate-200">{myCompany.taxId}</strong>
              </span>
            </div>
            <h1 className="text-2xl font-extrabold mt-2">{myCompany.name}</h1>
            <p className="text-xs text-slate-400">
              Operador en Turno: <strong className="text-white">{session.name}</strong> · Tasa Fiscal Aplicada:{' '}
              <strong className="text-purple-300">
                {country.taxName} {companyTaxRate}%
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-right">
              <p className="text-[11px] text-slate-400">Arqueo Acumulado de Turno</p>
              <p className="text-base font-bold text-emerald-400">{formatMoney(shiftTotalUsd)}</p>
            </div>
            <LanguageDropdown />
            <button
              onClick={handleLogout}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold px-4 py-2.5 rounded-lg cursor-pointer"
            >
              Cerrar Caja / Salir
            </button>
          </div>
        </header>

        <RegionalStatusBar />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Catálogo Rápido de Facturación */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-base font-bold text-slate-200">
              Catálogo Operativo Habilitado — Seleccionar Ítem
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {CATALOG_SEED.map((prod) => (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => addToCart(prod)}
                  className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-emerald-500 text-left transition cursor-pointer flex flex-col justify-between gap-3"
                >
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded">
                      {prod.sku} · Stock: {prod.stock}
                    </span>
                    <p className="font-bold text-sm text-white mt-2">{prod.name}</p>
                  </div>
                  <p className="text-sm font-extrabold text-emerald-400">
                    {formatMoney(prod.priceUsd)}
                  </p>
                </button>
              ))}
            </div>

            {/* Historial de Comprobantes Emitidos en el Turno */}
            {salesHistory.length > 0 && (
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-2.5 mt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Comprobantes Emitidos en esta Sesión
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {salesHistory.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="flex justify-between items-center text-xs bg-slate-950 px-3 py-2 rounded-lg border border-slate-800"
                    >
                      <span>
                        <strong className="text-emerald-400">#{ticket.id}</strong> · {ticket.client} ({ticket.method})
                      </span>
                      <span className="font-bold text-white">
                        {formatMoney(ticket.totalUsd)} <span className="text-slate-500">({ticket.time})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Comprobante Fiscal y Liquidación */}
          <form
            onSubmit={handleCheckout}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-5"
          >
            <div className="space-y-4">
              <h2 className="text-base font-bold border-b border-slate-800 pb-3">
                Emisión de Comprobante Fiscal
              </h2>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <input
                  type="text"
                  placeholder={`${country.taxIdName} Cliente`}
                  value={clientTaxId}
                  onChange={(e) => setClientTaxId(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
                <input
                  type="text"
                  placeholder="Razón Social / Nombre"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {cart.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">
                    Seleccione productos del catálogo para iniciar la liquidación.
                  </p>
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.id}
                      className="flex justify-between items-center bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs"
                    >
                      <div className="flex-1 pr-2">
                        <p className="font-semibold text-white truncate">{item.name}</p>
                        <p className="text-slate-400">{formatMoney(item.priceUsd)} c/u</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, -1)}
                          className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 font-bold cursor-pointer"
                        >
                          -
                        </button>
                        <span className="font-bold w-4 text-center">{item.qty}</span>
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, 1)}
                          className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 font-bold cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-3 border-t border-slate-800 pt-4 text-xs">
              <div className="flex gap-2">
                {(['cash', 'qr', 'card'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`flex-1 py-2 rounded-lg font-bold uppercase cursor-pointer border ${
                      paymentMethod === m
                        ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    {m === 'cash' ? 'Efectivo' : m === 'qr' ? 'QR Simple' : 'Tarjeta'}
                  </button>
                ))}
              </div>

              <div className="space-y-1 text-slate-300">
                <div className="flex justify-between">
                  <span>Subtotal Neto:</span>
                  <span>{formatMoney(subtotalUsd)}</span>
                </div>
                <div className="flex justify-between text-purple-300">
                  <span>
                    {country.taxName} ({companyTaxRate}%):
                  </span>
                  <span>{formatMoney(taxAmountUsd)}</span>
                </div>
                <div className="flex justify-between text-base font-extrabold text-emerald-400 pt-1 border-t border-slate-800">
                  <span>Total a Cobrar:</span>
                  <span>{formatMoney(grandTotalUsd)}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={cart.length === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl text-sm transition cursor-pointer"
              >
                ✓ Emitir Comprobante y Registrar Cobro
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}