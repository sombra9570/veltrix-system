/* ------------------------------------------------------------------
 * Ventas sin internet: se guardan en el teléfono y se envían solas.
 * Cada venta lleva un identificador propio: si la señal falla justo al confirmar
 * y se reintenta, el servidor devuelve la misma venta (nunca duplica).
 * Una venta que el servidor rechaza (sin stock, descuento sobre el tope...) NO se pierde:
 * queda en "rechazadas" hasta que la persona la reintente o la descarte.
 * ------------------------------------------------------------------ */
export type PendingSale = {
  id: string; branchId: string;
  items: { product_id: string; qty: number }[];
  notes: string; discount: number; at: string;
  total: number; currency: string;
  lines: { name: string; qty: number }[];
};
export type RejectedSale = PendingSale & { reason: string };

const k = (user: string, what: string) => `vx_sales_${what}_${user}`;
function read<T>(key: string, d: T): T { try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? d; } catch { return d; } }
function write(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* almacenamiento lleno */ } }

export const loadPending = (user: string) => read<PendingSale[]>(k(user, 'queue'), []);
export const savePending = (user: string, v: PendingSale[]) => write(k(user, 'queue'), v);
export const loadRejected = (user: string) => read<RejectedSale[]>(k(user, 'rejected'), []);
export const saveRejected = (user: string, v: RejectedSale[]) => write(k(user, 'rejected'), v);

// Lo último que se vio: el punto de venta abre y vende aunque no haya señal
export const readCatalog = <T,>(branchId: string) => read<T[]>(`vx_pos_catalog_${branchId}`, []);
export const cacheCatalog = (branchId: string, v: unknown) => write(`vx_pos_catalog_${branchId}`, v);
export const readBranches = <T,>(user: string) => read<T[]>(`vx_pos_branches_${user}`, []);
export const cacheBranches = (user: string, v: unknown) => write(`vx_pos_branches_${user}`, v);

/** Falla de señal o del servidor (se reintenta), distinta de un rechazo de negocio (stock, tope, permiso) */
export const isNetworkError = (msg: string) =>
  (typeof navigator !== 'undefined' && !navigator.onLine) ||
  /fetch|network|timeout|timed out|abort|failed|load failed|502|503|504|gateway|upstream/i.test(msg);
