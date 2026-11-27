// Qué módulo necesita cada rol y cada permiso: lo que el negocio no tiene activo no se muestra
const ROLE_MODULE: Record<string, string> = { collector: 'field_collection', waiter: 'restaurant', kitchen: 'restaurant', technician: 'workshop', storekeeper: 'inventory' };

export function roleAvailable(role: string, modules: string[]): boolean {
  const m = ROLE_MODULE[role];
  return !m || modules.length === 0 || modules.includes(m);
}

export function keyAvailable(key: string, modules: string[]): boolean {
  if (modules.length === 0) return true;
  if (/^(loans|routes|collector|payments\.record)/.test(key)) return modules.includes('field_collection');
  // Retiros de caja: solo en rubros con caja (en microfinanzas y cobranza en calle todo egreso es un gasto)
  if (key === 'cash.withdraw') return modules.some((m) => ['retail', 'distribution', 'restaurant', 'workshop'].includes(m));
  if (/^tables\./.test(key)) return modules.includes('restaurant');
  if (/^workshop\./.test(key)) return modules.includes('workshop');
  if (/^(inv|products)\./.test(key) && key !== 'products.see_code') return modules.includes('inventory');
  return true;
}
