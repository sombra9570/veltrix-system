/* Operaciones de crédito anotadas sin señal: préstamo en calle y venta a plazos.
 * Cada una lleva su identificador: si el envío se repite, el servidor devuelve la misma operación (no duplica). */
export type LoanOp = {
  kind: 'loan'; id: string; at: string; route: string; customer: string;
  principal: number; interest: number | null; count: number; every: number; first: string; notes: string | null; total: number;
};
export type SaleOp = {
  kind: 'credit_sale'; id: string; at: string; route: string; customer: string;
  items: { product_id: string; qty: number }[]; count: number; every: number; first: string; notes: string | null; total: number;
};
export type CreditOp = LoanOp | SaleOp;

const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* lleno */ } };
/** Último catálogo y modo de venta vistos en la ruta, para seguir trabajando sin señal */
export const readProducts = <T,>(route: string) => read<T[]>(`vx_col_products_${route}`, []);
export const cacheProducts = (route: string, v: unknown) => write(`vx_col_products_${route}`, v);
export const readSaleMode = (route: string) => read<{ mode: 'loan' | 'merch'; can: boolean } | null>(`vx_col_salemode_${route}`, null);
export const cacheSaleMode = (route: string, v: unknown) => write(`vx_col_salemode_${route}`, v);

/** Código del servidor → clave de texto (las mismas que usan los formularios) */
export function creditErrorKey(m: string): string | null {
  const map: [string, string][] = [
    ['LOAN_INTEREST_LOCKED', 'loan.e.interest'], ['LOAN_NO_PERMISSION', 'loan.e.perm'], ['LOAN_MAX_CUSTOMERS', 'loan.e.maxCustomers'],
    ['LOAN_OTHER_ROUTE', 'loan.e.otherRoute'], ['LOAN_ROUTE_MAX_AMOUNT', 'loan.e.maxAmount'], ['LOAN_ROUTE_MAX_CARDS', 'loan.e.maxCards'],
    ['LOAN_NEEDS_PHOTO', 'loan.e.photo'], ['LOAN_NEEDS_ID', 'loan.e.id'], ['SALE_NO_PERMISSION', 'sale.e.perm'],
  ];
  return map.find(([c]) => m.includes(c))?.[1] ?? null;
}
