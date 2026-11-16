// Catálogo de tipos de negocio y rubros de Veltrix.
// Los textos visibles salen de i18n (claves kind.* / cat.* / mod.*); los label aquí son solo referencia.
import type { DictKey } from './i18n/es';
// Cada rubro sugiere los módulos que la empresa va a usar (códigos de la tabla org_modules).

export type BusinessKind = 'products' | 'services' | 'mixed';

export type ModuleCode =
  | 'retail' | 'inventory' | 'purchasing' | 'finance' | 'restaurant'
  | 'workshop' | 'field_collection' | 'distribution' | 'hr';

export type BusinessCategory = {
  id: string;
  label: string;
  icon: string;
  kind: 'products' | 'services';
  modules: ModuleCode[];
};

export const BUSINESS_KINDS: { id: BusinessKind; label: string; icon: string; desc: string }[] = [
  { id: 'products', label: 'Productos', icon: '📦', desc: 'Vendo mercadería: tiendas, distribuidoras, farmacias…' },
  { id: 'services', label: 'Servicios', icon: '🛠️', desc: 'Vendo mi trabajo o atención: restaurantes, talleres, préstamos…' },
  { id: 'mixed',    label: 'Mixto',     icon: '🔀', desc: 'Vendo productos y también presto servicios' },
];

export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  // ---------- Productos ----------
  { id: 'grocery',      label: 'Tienda / Abarrotes / Minimarket', icon: '🛒', kind: 'products', modules: ['retail', 'inventory', 'purchasing'] },
  { id: 'hardware',     label: 'Ferretería / Materiales',         icon: '🔩', kind: 'products', modules: ['retail', 'inventory', 'purchasing'] },
  { id: 'pharmacy',     label: 'Farmacia',                        icon: '💊', kind: 'products', modules: ['retail', 'inventory', 'purchasing'] },
  { id: 'clothing',     label: 'Ropa / Calzado / Accesorios',     icon: '👕', kind: 'products', modules: ['retail', 'inventory', 'purchasing'] },
  { id: 'tech',         label: 'Celulares / Tecnología',          icon: '📱', kind: 'products', modules: ['retail', 'inventory', 'purchasing'] },
  { id: 'auto_parts',   label: 'Repuestos / Autopartes',          icon: '⚙️', kind: 'products', modules: ['retail', 'inventory', 'purchasing'] },
  { id: 'bakery',       label: 'Panadería / Pastelería',          icon: '🥖', kind: 'products', modules: ['retail', 'inventory', 'purchasing'] },
  { id: 'stationery',   label: 'Librería / Bazar / Regalos',      icon: '📚', kind: 'products', modules: ['retail', 'inventory', 'purchasing'] },
  { id: 'agro',         label: 'Agropecuaria / Veterinaria',      icon: '🌾', kind: 'products', modules: ['retail', 'inventory', 'purchasing'] },
  { id: 'wholesale',    label: 'Distribuidora mayorista / Rutas', icon: '🚚', kind: 'products', modules: ['distribution', 'inventory', 'purchasing', 'field_collection'] },
  { id: 'credit_sales', label: 'Venta a crédito / Electrodomésticos', icon: '🧾', kind: 'products', modules: ['retail', 'inventory', 'field_collection'] },
  // ---------- Servicios ----------
  { id: 'restaurant',   label: 'Restaurante / Cafetería',         icon: '🍽️', kind: 'services', modules: ['restaurant', 'inventory', 'purchasing'] },
  { id: 'fast_food',    label: 'Comida rápida / Delivery',        icon: '🍔', kind: 'services', modules: ['restaurant', 'inventory', 'purchasing'] },
  { id: 'mechanic',     label: 'Taller mecánico',                 icon: '🔧', kind: 'services', modules: ['workshop', 'inventory', 'purchasing'] },
  { id: 'tech_repair',  label: 'Servicio técnico (celulares, PC)', icon: '🧰', kind: 'services', modules: ['workshop', 'inventory'] },
  { id: 'beauty',       label: 'Salón de belleza / Barbería / Spa', icon: '💇', kind: 'services', modules: ['workshop', 'retail'] },
  { id: 'health',       label: 'Clínica / Consultorio / Fisioterapia', icon: '🩺', kind: 'services', modules: ['workshop', 'retail'] },
  { id: 'gym',          label: 'Gimnasio / Academia deportiva',   icon: '🏋️', kind: 'services', modules: ['retail', 'field_collection'] },
  { id: 'education',    label: 'Educación / Cursos / Academia',   icon: '🎓', kind: 'services', modules: ['retail', 'field_collection'] },
  { id: 'laundry',      label: 'Lavandería / Tintorería',         icon: '🧺', kind: 'services', modules: ['workshop', 'retail'] },
  { id: 'lodging',      label: 'Hotel / Hospedaje',               icon: '🏨', kind: 'services', modules: ['retail', 'restaurant'] },
  { id: 'transport',    label: 'Transporte / Mensajería',         icon: '🚐', kind: 'services', modules: ['distribution', 'field_collection'] },
  { id: 'microfinance', label: 'Préstamos / Microfinanzas',       icon: '💵', kind: 'services', modules: ['field_collection', 'finance'] },
  { id: 'collections',  label: 'Cobranza en calle',               icon: '🛵', kind: 'services', modules: ['field_collection', 'finance'] },
];

// Todas las empresas llevan finanzas y personal
const BASE_MODULES: ModuleCode[] = ['finance', 'hr'];

export function categoriesForKind(kind: BusinessKind | null): BusinessCategory[] {
  if (!kind) return [];
  if (kind === 'mixed') return BUSINESS_CATEGORIES;
  return BUSINESS_CATEGORIES.filter((c) => c.kind === kind);
}

export function suggestedModules(categoryIds: string[]): ModuleCode[] {
  const set = new Set<ModuleCode>(BASE_MODULES);
  for (const id of categoryIds) {
    BUSINESS_CATEGORIES.find((c) => c.id === id)?.modules.forEach((m) => set.add(m));
  }
  return [...set];
}

export const MODULE_LABELS: Record<ModuleCode, string> = {
  retail: 'Punto de venta',
  inventory: 'Inventario',
  purchasing: 'Compras y proveedores',
  finance: 'Finanzas',
  restaurant: 'Restaurante (mesas y cocina)',
  workshop: 'Órdenes de trabajo',
  field_collection: 'Créditos y cobranza en calle',
  distribution: 'Distribución y rutas',
  hr: 'Personal y asistencia',
};

// Claves de traducción
export const kindKey = (id: BusinessKind) => `kind.${id}` as DictKey;
export const kindDescKey = (id: BusinessKind) => `kind.${id}.desc` as DictKey;
export const catKey = (id: string) => `cat.${id}` as DictKey;
export const modKey = (m: ModuleCode) => `mod.${m}` as DictKey;

// Cargos que suelen hacer falta según los módulos del rubro (se muestran marcados y el cliente los ajusta)
export const TEAM_ROLES = ['cashier', 'vendor', 'waiter', 'kitchen', 'collector', 'supervisor', 'storekeeper', 'accountant', 'technician'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export function suggestedRoles(categoryIds: string[]): TeamRole[] {
  const mods = new Set<ModuleCode>();
  for (const id of categoryIds) BUSINESS_CATEGORIES.find((c) => c.id === id)?.modules.forEach((m) => mods.add(m));
  const r = new Set<TeamRole>();
  if (mods.has('retail') || mods.has('distribution')) { r.add('vendor'); r.add('cashier'); }
  if (mods.has('restaurant')) { r.add('waiter'); r.add('kitchen'); r.add('cashier'); }
  if (mods.has('workshop')) { r.add('technician'); r.add('cashier'); }
  if (mods.has('inventory')) r.add('storekeeper');
  if (mods.has('field_collection')) { r.add('collector'); r.add('supervisor'); }
  return TEAM_ROLES.filter((x) => r.has(x));
}

// Tamaños del equipo (personas que trabajan con el dueño) y de sucursales: el tope sirve para recomendar el plan
export const TEAM_SIZES = [{ id: 's0', max: 0 }, { id: 's1', max: 3 }, { id: 's2', max: 7 }, { id: 's3', max: 14 }, { id: 's4', max: 49 }, { id: 's5', max: 90 }] as const;
export const BRANCH_SIZES = [{ id: 'b1', max: 1 }, { id: 'b2', max: 2 }, { id: 'b3', max: 10 }, { id: 'b4', max: 25 }] as const;

export type PublicPlan = { code: string; name: string; price_usd: number; max_branches: number; max_users: number; max_storage_mb: number };
/** El plan más barato que alcanza para el dueño + su equipo y sus sucursales */
export function recommendPlan(plans: PublicPlan[], teamMax: number, branchMax: number): PublicPlan | null {
  const sorted = [...plans].sort((a, b) => Number(a.price_usd) - Number(b.price_usd));
  return sorted.find((p) => p.max_users >= teamMax + 1 && p.max_branches >= branchMax) ?? sorted[sorted.length - 1] ?? null;
}
