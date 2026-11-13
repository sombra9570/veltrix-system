'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../../lib/supabase';
import { Card } from '../shell';
import { ui } from '../../site-header';
import { useT } from '../../i18n';
import type { DictKey } from '../../i18n/es';
import { money, shortTime, parseAmount } from '../format';

type Method = 'cash' | 'qr_transfer' | 'card';
type MovType = 'expense' | 'withdrawal' | 'deposit' | 'change_fund';

type Home = {
  shift: null | {
    id: string; opened_at: string; opening_cash: number; register: string; branch: string; currency: string;
    payments: { id: string; at: string; customer: string; method: Method; amount: number }[];
    movements: { id: string; at: string; type: MovType; amount: number; description: string }[];
  };
  registers: { id: string; name: string; branch: string; currency: string; busy: boolean }[];
  last_closed: null | { status: 'closed_ok' | 'discrepancy'; difference: number; closed_at: string; currency: string };
};
type QueueRow = {
  order_id: string; customer_id: string; customer_name: string; vendor_name: string;
  total: number; balance: number; created_at: string;
};
type Settlement = { settlement_id: string; route_name: string; collector_name: string; created_at: string };
type Item = { description: string; qty: number; unit_price: number; line_total: number };

type Tab = 'queue' | 'debts' | 'settlements' | 'movements' | 'payments' | 'close';
const TABS: { id: Tab; icon: string; label: DictKey }[] = [
  { id: 'queue', icon: '🧾', label: 'cash.tabQueue' },
  { id: 'debts', icon: '📅', label: 'cash.tabDebts' },
  { id: 'settlements', icon: '🛵', label: 'cash.tabSettlements' },
  { id: 'movements', icon: '↕️', label: 'cash.tabMovements' },
  { id: 'payments', icon: '✅', label: 'cash.tabPayments' },
  { id: 'close', icon: '🔒', label: 'cash.tabClose' },
];
const METHODS: Method[] = ['cash', 'qr_transfer', 'card'];
const MOV_TYPES: MovType[] = ['expense', 'withdrawal', 'deposit', 'change_fund'];

const okBox = 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
const errBox = 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400';

/** Mensajes de la base → texto claro en el idioma del usuario */
function cashError(msg: string, t: (k: DictKey) => string) {
  if (/turno de caja abierto/i.test(msg)) return t('cash.needShift');
  if (/excede/i.test(msg)) return t('cash.exceeds');
  if (/suspendida/i.test(msg)) return t('err.suspended');
  if (/Monto inválido|efectivo contado/i.test(msg)) return t('cash.invalidAmount');
  return t('err.generic');
}

export default function CashierPage() {
  const { t, lang } = useT();
  const [home, setHome] = useState<Home | null>(null);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [tab, setTab] = useState<Tab>('queue');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const h = await rpc<Home>('cashier_home');
      setHome(h);
      if (h.shift) {
        const [q, s] = await Promise.all([
          rpc<QueueRow[]>('get_cashier_queue'),
          rpc<Settlement[]>('get_pending_settlements'),
        ]);
        setQueue(q ?? []);
        setSettlements(s ?? []);
      }
    } catch { /* sin conexión: se reintenta en el próximo ciclo */ }
  }, []);

  // Carga inicial y actualización automática cada 20 s
  useEffect(() => {
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [load]);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 5000);
  };

  if (!home) return <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p>;

  const s = home.shift;
  const fmt = (n: number, cur?: string) => money(Number(n), cur ?? s?.currency ?? 'USD', lang);

  return (
    <div className="space-y-5">
      {msg && (
        <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? okBox : errBox}`}>{msg.text}</p>
      )}

      {!s ? (
        <OpenShift home={home} busy={busy} setBusy={setBusy} onDone={load} flash={flash} />
      ) : (
        <>
          {/* Encabezado del turno */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold sm:text-2xl">💵 {s.register} · {s.branch}</h1>
              <p className={`text-sm ${ui.muted}`}>{t('cash.openSince', { time: shortTime(s.opened_at, lang) })}</p>
            </div>
            <button type="button" onClick={load} className={`${ui.btnGhost} !py-2 text-sm`}>↻ {t('cash.refresh')}</button>
          </div>

          {/* Pestañas: en celular se deslizan; en computadora caben todas */}
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
              {TABS.map((x) => {
                const count = x.id === 'queue' ? queue.length : x.id === 'settlements' ? settlements.length : 0;
                return (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => setTab(x.id)}
                    className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition cursor-pointer ${
                      tab === x.id
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                  >
                    <span>{x.icon}</span>
                    <span>{t(x.label)}</span>
                    {count > 0 && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tab === x.id ? 'bg-white/25' : 'bg-blue-600 text-white'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {tab === 'queue' && (
            <QueueTab queue={queue} shiftId={s.id} fmt={fmt} busy={busy} setBusy={setBusy} onDone={load} flash={flash} />
          )}
          {tab === 'debts' && (
            <DebtsTab shiftId={s.id} fmt={fmt} busy={busy} setBusy={setBusy} onDone={load} flash={flash} />
          )}
          {tab === 'settlements' && (
            <SettlementsTab list={settlements} busy={busy} setBusy={setBusy} onDone={load} flash={flash} />
          )}
          {tab === 'movements' && (
            <MovementsTab movements={s.movements} fmt={fmt} busy={busy} setBusy={setBusy} onDone={load} flash={flash} />
          )}
          {tab === 'payments' && (
            <Card className="!p-0 overflow-hidden">
              {s.payments.length === 0 ? (
                <p className={`p-5 text-sm ${ui.muted}`}>{t('cash.paymentsEmpty')}</p>
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {s.payments.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 p-4">
                      <span className={`w-12 shrink-0 text-xs ${ui.muted}`}>{shortTime(p.at, lang)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{p.customer}</p>
                        <p className={`text-xs ${ui.muted}`}>{t(`cash.m.${p.method}` as DictKey)}</p>
                      </div>
                      <span className={`font-bold ${p.amount < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{fmt(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {tab === 'close' && (
            <CloseTab shiftId={s.id} fmt={fmt} busy={busy} setBusy={setBusy} onDone={load} flash={flash} />
          )}
        </>
      )}
    </div>
  );
}

type Common = {
  busy: boolean;
  setBusy: (b: boolean) => void;
  onDone: () => Promise<void>;
  flash: (ok: boolean, text: string) => void;
};

/* ---------------- Abrir caja ---------------- */
function OpenShift({ home, busy, setBusy, onDone, flash }: Common & { home: Home }) {
  const { t, lang } = useT();
  const free = home.registers.filter((r) => !r.busy);
  const [register, setRegister] = useState('');
  const [cash, setCash] = useState('');
  const selected = register || free[0]?.id || '';
  const lc = home.last_closed;

  const open = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseAmount(cash || '0');
    if (!selected || Number.isNaN(amount) || amount < 0) return flash(false, t('cash.invalidAmount'));
    setBusy(true);
    try {
      await rpc('open_shift', { p_register: selected, p_opening_cash: amount });
      await onDone();
    } catch (err) {
      flash(false, cashError((err as Error).message, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      {lc && (
        <p className={`rounded-xl border p-3 text-sm font-semibold ${lc.status === 'closed_ok' ? okBox : errBox}`}>
          {lc.status === 'closed_ok'
            ? t('cash.lastClosedOk')
            : t('cash.lastClosedDiff', { amount: money(Number(lc.difference), lc.currency, lang) })}
        </p>
      )}
      <Card>
        <h1 className="text-xl font-extrabold">🔓 {t('cash.openTitle')}</h1>
        <p className={`mt-1 text-sm ${ui.muted}`}>{t('cash.openHint')}</p>

        {home.registers.length === 0 ? (
          <p className={`mt-4 text-sm ${ui.muted}`}>{t('cash.noRegisters')}</p>
        ) : (
          <form onSubmit={open} className="mt-5 space-y-4">
            <div>
              <label className={ui.label}>{t('cash.register')}</label>
              <div className="grid gap-2">
                {home.registers.map((r) => (
                  <label
                    key={r.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${
                      r.busy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                    } ${selected === r.id ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-slate-300 dark:border-slate-700'}`}
                  >
                    <input
                      type="radio"
                      name="register"
                      disabled={r.busy}
                      checked={selected === r.id}
                      onChange={() => setRegister(r.id)}
                    />
                    <span className="flex-1 font-semibold">{r.name} · {r.branch}</span>
                    {r.busy && <span className="text-xs font-bold">{t('cash.busy')}</span>}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={ui.label}>{t('cash.openingCash')}</label>
              <input inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" className={ui.input} />
            </div>
            <button type="submit" disabled={busy || !selected} className={`${ui.btnPrimary} w-full`}>
              {busy ? t('common.wait') : t('cash.open')}
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Por cobrar ---------------- */
function QueueTab({
  queue, shiftId, fmt, busy, setBusy, onDone, flash,
}: Common & { queue: QueueRow[]; shiftId: string; fmt: (n: number) => string }) {
  const { t, lang } = useT();
  const [active, setActive] = useState<QueueRow | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [method, setMethod] = useState<Method>('cash');
  const [received, setReceived] = useState('');

  const pick = async (row: QueueRow) => {
    setActive(row);
    setMethod('cash');
    setReceived('');
    setItems([]);
    try { setItems((await rpc<Item[]>('cashier_order_items', { p_order: row.order_id })) ?? []); } catch { /* opcional */ }
  };

  if (queue.length === 0 && !active) {
    return <Card><p className={`text-sm ${ui.muted}`}>{t('cash.queueEmpty')}</p></Card>;
  }

  const balance = active ? Number(active.balance) : 0;
  const got = parseAmount(received);
  const change = method === 'cash' && !Number.isNaN(got) ? got - balance : 0;
  const short = method === 'cash' && received !== '' && (Number.isNaN(got) || got < balance);

  const charge = async () => {
    if (!active || short) return;
    setBusy(true);
    try {
      await rpc('register_payment', {
        p_customer: active.customer_id,
        p_origin: 'pos_counter',
        p_method: method,
        p_amount: balance,
        p_shift: shiftId,
        p_order: active.order_id,
        p_offline_uuid: crypto.randomUUID(),
      });
      flash(true, t('cash.charged'));
      setActive(null);
      await onDone();
    } catch (err) {
      flash(false, cashError((err as Error).message, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <ul className={`space-y-2 lg:col-span-3 ${active ? 'max-lg:hidden' : ''}`}>
        {queue.map((q) => (
          <li key={q.order_id}>
            <button
              type="button"
              onClick={() => pick(q)}
              className={`flex w-full items-center gap-3 rounded-2xl p-4 text-left transition cursor-pointer ${ui.card} ${
                active?.order_id === q.order_id ? 'ring-2 ring-blue-500' : 'hover:border-blue-400'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{q.customer_name}</p>
                <p className={`truncate text-xs ${ui.muted}`}>
                  {shortTime(q.created_at, lang)} · {t('cash.soldBy', { name: q.vendor_name })}
                </p>
              </div>
              <span className="text-lg font-extrabold">{fmt(q.balance)}</span>
            </button>
          </li>
        ))}
      </ul>

      {active && (
        <Card className="space-y-4 lg:col-span-2 lg:self-start lg:sticky lg:top-24">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-xs font-semibold uppercase tracking-wide ${ui.muted}`}>{t('cash.customer')}</p>
              <p className="truncate text-lg font-bold">{active.customer_name}</p>
            </div>
            <button type="button" onClick={() => setActive(null)} aria-label={t('cash.cancel')} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-300 cursor-pointer dark:border-slate-700">✕</button>
          </div>

          {items.length > 0 && (
            <div>
              <p className={ui.label}>{t('cash.items')}</p>
              <ul className="space-y-1 text-sm">
                {items.map((it, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{Number(it.qty)} × {it.description}</span>
                    <span className="shrink-0 font-semibold">{fmt(it.line_total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-baseline justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
            <span className="font-semibold">{t('cash.toCharge')}</span>
            <span className="text-2xl font-extrabold">{fmt(balance)}</span>
          </div>

          <div>
            <p className={ui.label}>{t('cash.method')}</p>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`rounded-xl px-2 py-2.5 text-xs font-bold transition cursor-pointer sm:text-sm ${
                    method === m ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {t(`cash.m.${m}` as DictKey)}
                </button>
              ))}
            </div>
          </div>

          {method === 'cash' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={ui.label}>{t('cash.received')}</label>
                <input inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={String(balance)} className={ui.input} />
              </div>
              <div>
                <p className={ui.label}>{t('cash.change')}</p>
                <p className={`py-2.5 text-lg font-extrabold ${change > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                  {fmt(Math.max(0, change))}
                </p>
              </div>
            </div>
          )}
          {short && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{t('cash.notEnough')}</p>}

          <button type="button" onClick={charge} disabled={busy || short} className={`${ui.btnPrimary} w-full py-3 text-base`}>
            {busy ? t('common.wait') : `${t('cash.confirm')} · ${fmt(balance)}`}
          </button>
        </Card>
      )}
    </div>
  );
}

/* ---------------- Cobro de cuotas (cliente que viene a pagar) ---------------- */
type Debtor = { id: string; name: string; doc: string | null; balance: number; overdue: number };
function DebtsTab({
  shiftId, fmt, busy, setBusy, onDone, flash,
}: Common & { shiftId: string; fmt: (n: number) => string }) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [list, setList] = useState<Debtor[]>([]);
  const [sel, setSel] = useState<Debtor | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('cash');

  useEffect(() => {
    if (sel) return;
    const id = setTimeout(() => {
      rpc<Debtor[]>('cashier_find_debtors', { p_search: q }).then((r) => setList(r ?? [])).catch(() => setList([]));
    }, 300);
    return () => clearTimeout(id);
  }, [q, sel]);

  const pick = (d: Debtor) => {
    setSel(d);
    setMethod('cash');
    setAmount(String(Number(d.overdue) > 0 ? Number(d.overdue) : Number(d.balance)));
  };

  const n = parseAmount(amount);
  const invalid = !sel || Number.isNaN(n) || n <= 0 || n > Number(sel.balance);

  const charge = async () => {
    if (!sel || invalid) return;
    setBusy(true);
    try {
      await rpc('register_payment', {
        p_customer: sel.id, p_origin: 'pos_counter', p_method: method, p_amount: n,
        p_shift: shiftId, p_offline_uuid: crypto.randomUUID(),
      });
      flash(true, t('cash.charged'));
      setSel(null);
      setQ('');
      await onDone();
    } catch (err) {
      flash(false, cashError((err as Error).message, t));
    } finally {
      setBusy(false);
    }
  };

  if (sel) {
    return (
      <div className="mx-auto w-full max-w-lg">
        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{sel.name}</p>
              <p className={`text-xs ${ui.muted}`}>{sel.doc ?? ''}</p>
            </div>
            <button type="button" onClick={() => setSel(null)} aria-label={t('cash.cancel')} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-300 cursor-pointer dark:border-slate-700">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <p className={`text-[11px] font-semibold uppercase ${ui.muted}`}>{t('cust.balance')}</p>
              <p className="font-extrabold">{fmt(sel.balance)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <p className={`text-[11px] font-semibold uppercase ${ui.muted}`}>{t('cust.overdue')}</p>
              <p className={`font-extrabold ${Number(sel.overdue) > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{fmt(sel.overdue)}</p>
            </div>
          </div>
          <div>
            <label className={ui.label}>{t('cash.amount')}</label>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${ui.input} text-lg`} />
            {!Number.isNaN(n) && n > Number(sel.balance) && <p className="mt-1 text-sm font-semibold text-red-600 dark:text-red-400">{t('cash.exceeds')}</p>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button key={m} type="button" onClick={() => setMethod(m)}
                className={`rounded-xl px-2 py-2.5 text-xs font-bold transition cursor-pointer sm:text-sm ${method === m ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
                {t(`cash.m.${m}` as DictKey)}
              </button>
            ))}
          </div>
          <button type="button" disabled={busy || invalid} onClick={charge} className={`${ui.btnPrimary} w-full py-3 text-base`}>
            {busy ? t('common.wait') : `${t('cash.confirm')} · ${Number.isNaN(n) ? '' : fmt(n)}`}
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('cash.debtSearch')} className={ui.input} />
      {q.trim().length >= 2 && list.length === 0 && <Card><p className={`text-sm ${ui.muted}`}>{t('cash.noDebtors')}</p></Card>}
      <ul className="space-y-2">
        {list.map((d) => (
          <li key={d.id}>
            <button type="button" onClick={() => pick(d)} className={`flex w-full items-center gap-3 rounded-2xl p-4 text-left transition cursor-pointer hover:border-blue-400 ${ui.card}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{d.name}</p>
                <p className={`text-xs ${ui.muted}`}>{d.doc ?? ''}{Number(d.overdue) > 0 ? ` · ${t('cust.overdue')}: ${fmt(d.overdue)}` : ''}</p>
              </div>
              <span className="text-lg font-extrabold">{fmt(d.balance)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- Rendiciones (conteo ciego) ---------------- */
function SettlementsTab({ list, busy, setBusy, onDone, flash }: Common & { list: Settlement[] }) {
  const { t, lang } = useT();
  const [counts, setCounts] = useState<Record<string, string>>({});

  if (list.length === 0) return <Card><p className={`text-sm ${ui.muted}`}>{t('cash.settlementsEmpty')}</p></Card>;

  const receive = async (id: string) => {
    const amount = parseAmount(counts[id] ?? '');
    if (Number.isNaN(amount) || amount < 0) return flash(false, t('cash.invalidAmount'));
    setBusy(true);
    try {
      await rpc('receive_settlement', { p_settlement: id, p_declared_cash: amount });
      flash(true, t('cash.settlementReceived'));
      await onDone();
    } catch (err) {
      flash(false, cashError((err as Error).message, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className={`text-sm ${ui.muted}`}>{t('cash.settlementHint')}</p>
      {list.map((x) => (
        <Card key={x.settlement_id}>
          <p className="font-bold">🛵 {x.collector_name}</p>
          <p className={`text-xs ${ui.muted}`}>{x.route_name} · {shortTime(x.created_at, lang)}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              inputMode="decimal"
              aria-label={t('cash.counted')}
              placeholder={t('cash.counted')}
              value={counts[x.settlement_id] ?? ''}
              onChange={(e) => setCounts({ ...counts, [x.settlement_id]: e.target.value })}
              className={ui.input}
            />
            <button type="button" disabled={busy} onClick={() => receive(x.settlement_id)} className={`${ui.btnPrimary} shrink-0`}>
              {t('cash.receive')}
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ---------------- Movimientos de caja ---------------- */
function MovementsTab({
  movements, fmt, busy, setBusy, onDone, flash,
}: Common & { movements: NonNullable<Home['shift']>['movements']; fmt: (n: number) => string }) {
  const { t, lang } = useT();
  const [type, setType] = useState<MovType>('expense');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseAmount(amount);
    if (Number.isNaN(n) || n <= 0) return flash(false, t('cash.invalidAmount'));
    setBusy(true);
    try {
      await rpc('add_cash_movement', { p_type: type, p_amount: n, p_description: reason });
      flash(true, t('cash.movementSaved'));
      setAmount('');
      setReason('');
      await onDone();
    } catch (err) {
      flash(false, cashError((err as Error).message, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <form onSubmit={save} className="space-y-3">
          <div>
            <p className={ui.label}>{t('cash.movType')}</p>
            <div className="grid grid-cols-2 gap-2">
              {MOV_TYPES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setType(m)}
                  className={`rounded-xl px-2 py-2.5 text-sm font-semibold transition cursor-pointer ${
                    type === m ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {t(`cash.mov.${m}` as DictKey)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={ui.label}>{t('cash.amount')}</label>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={ui.input} />
          </div>
          <div>
            <label className={ui.label}>{t('cash.reason')}</label>
            <input required value={reason} onChange={(e) => setReason(e.target.value)} className={ui.input} />
          </div>
          <button type="submit" disabled={busy} className={`${ui.btnPrimary} w-full`}>
            {busy ? t('common.wait') : t('cash.addMovement')}
          </button>
        </form>
      </Card>

      <Card className="!p-0 overflow-hidden">
        {movements.length === 0 ? (
          <p className={`p-5 text-sm ${ui.muted}`}>{t('cash.movementsEmpty')}</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {movements.map((m) => {
              const out = m.type === 'expense' || m.type === 'withdrawal';
              return (
                <li key={m.id} className="flex items-center gap-3 p-4">
                  <span className={`w-12 shrink-0 text-xs ${ui.muted}`}>{shortTime(m.at, lang)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{m.description}</p>
                    <p className={`text-xs ${ui.muted}`}>{t(`cash.mov.${m.type}` as DictKey)}</p>
                  </div>
                  <span className={`font-bold ${out ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {out ? '−' : '+'}{fmt(m.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Cierre ciego ---------------- */
function CloseTab({
  shiftId, fmt, busy, setBusy, onDone, flash,
}: Common & { shiftId: string; fmt: (n: number) => string }) {
  const { t } = useT();
  const [declared, setDeclared] = useState('');
  const [confirming, setConfirming] = useState(false);
  const n = parseAmount(declared);
  const valid = declared !== '' && !Number.isNaN(n) && n >= 0;

  const close = async () => {
    setBusy(true);
    try {
      const status = await rpc<'closed_ok' | 'discrepancy'>('close_shift', { p_shift: shiftId, p_declared_cash: n });
      flash(status === 'closed_ok', status === 'closed_ok' ? t('cash.closedOk') : t('cash.closedDiff'));
      setConfirming(false);
      await onDone();
    } catch (err) {
      flash(false, cashError((err as Error).message, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg">
      <Card className="space-y-4">
        <p className={`text-sm ${ui.muted}`}>{t('cash.closeHint')}</p>
        <div>
          <label className={ui.label}>{t('cash.counted')}</label>
          <input
            inputMode="decimal"
            value={declared}
            onChange={(e) => { setDeclared(e.target.value); setConfirming(false); }}
            className={`${ui.input} text-lg`}
          />
        </div>
        {!confirming ? (
          <button type="button" disabled={!valid || busy} onClick={() => setConfirming(true)} className={`${ui.btnPrimary} w-full`}>
            🔒 {t('cash.closeBtn')}
          </button>
        ) : (
          <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-sm font-semibold">{t('cash.closeConfirm', { amount: fmt(n) })}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirming(false)} className={ui.btnGhost}>{t('cash.cancel')}</button>
              <button type="button" disabled={busy} onClick={close} className={ui.btnPrimary}>
                {busy ? t('common.wait') : t('cash.closeBtn')}
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
