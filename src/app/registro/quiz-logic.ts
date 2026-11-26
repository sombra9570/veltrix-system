// Lógica del test de registro (sin pantalla): grupos de rubros que trabajan juntos, preguntas y recomendaciones.
import { BUSINESS_CATEGORIES, suggestedModules, suggestedRoles, type BusinessCategory, type ModuleCode, type TeamRole } from '../business-catalog';

export type Sells = 'products' | 'services' | 'both' | 'unsure';
export type Unsure = 'unsure';
export type Tri = 'yes' | 'no' | 'unsure';

/** Grupos de rubros que pueden convivir en UN mismo negocio (mismo personal y forma de trabajar). */
export const GROUPS = ['gastronomy', 'commerce', 'distribution', 'workshop', 'care', 'lending', 'lodging', 'transport'] as const;
export type Group = (typeof GROUPS)[number];

const GROUPS_OF: Record<string, Group[]> = {
  restaurant: ['gastronomy'], fast_food: ['gastronomy'], bakery: ['gastronomy', 'commerce'],
  grocery: ['commerce'], hardware: ['commerce'], pharmacy: ['commerce'], clothing: ['commerce'], tech: ['commerce'],
  stationery: ['commerce'], agro: ['commerce'], auto_parts: ['commerce', 'workshop'], credit_sales: ['commerce', 'lending'],
  wholesale: ['distribution', 'commerce'],
  mechanic: ['workshop'], tech_repair: ['workshop'], laundry: ['workshop'],
  beauty: ['care'], health: ['care'], gym: ['care'], education: ['care'],
  microfinance: ['lending'], collections: ['lending'],
  lodging: ['lodging', 'gastronomy'], transport: ['transport', 'distribution'],
};
/** Grupo bajo el que se muestra cada rubro en pantalla (el primero de su lista). */
export const primaryGroup = (id: string): Group => (GROUPS_OF[id] ?? ['commerce'])[0];
export const groupsOf = (id: string): Group[] => GROUPS_OF[id] ?? ['commerce'];

/** Rubro exclusivo: no se combina con ningún otro. */
export const STREET = 'collections';
/** Cobranza en calle y microfinanzas son un solo rubro; microfinanzas ya no se ofrece por separado. */
export const isStreet = (id: string) => id === 'collections' || id === 'microfinance';

/** ¿Se puede sumar `id` a lo ya elegido en el mismo negocio? Solo si existe un grupo que los reúne a todos. */
export function canJoin(selected: string[], id: string): boolean {
  if (selected.includes(id)) return true;
  // Cobranza en calle es exclusiva: no se combina con ningún otro rubro.
  if (selected.some(isStreet) || isStreet(id)) return false;
  const all = [...selected, id];
  return GROUPS.some((g) => all.every((x) => groupsOf(x).includes(g)));
}

/** Rubros visibles según lo que vende (productos / servicios / ambos / no sé = todos). */
export function categoriesFor(sells: Sells | null): BusinessCategory[] {
  const all = BUSINESS_CATEGORIES.filter((c) => c.id !== 'microfinance');
  if (sells === 'products') return all.filter((c) => c.kind === 'products' || groupsOf(c.id).includes('commerce'));
  if (sells === 'services') return all.filter((c) => c.kind === 'services');
  return all;
}

/** "¿Qué haces en un día normal?": ayuda a quien no sabe elegir su rubro. */
export const ACTIVITIES: { id: string; group: Group }[] = [
  { id: 'sell', group: 'commerce' }, { id: 'food', group: 'gastronomy' }, { id: 'repair', group: 'workshop' },
  { id: 'route', group: 'distribution' }, { id: 'loans', group: 'lending' }, { id: 'care', group: 'care' },
  { id: 'stay', group: 'lodging' }, { id: 'move', group: 'transport' },
];

export type Specifics = { tables: Tri | null; delivery: Tri | null; credit: Tri | null };

export function modulesFor(cats: string[], sp: Specifics): ModuleCode[] {
  const set = new Set<ModuleCode>(suggestedModules(cats));
  if (sp.credit === 'yes') set.add('field_collection');
  return [...set];
}

export function rolesFor(cats: string[], sp: Specifics): TeamRole[] {
  const r = new Set<TeamRole>(suggestedRoles(cats));
  if (sp.tables === 'no') r.delete('waiter');
  if (sp.delivery === 'no') r.delete('delivery');
  if (sp.delivery === 'yes') r.add('delivery');
  if (sp.credit === 'yes') r.add('collector');
  // Solo los cargos que el rubro ofrece según la matriz
  const allowed = new Set<TeamRole>(suggestedRoles(cats));
  return [...r].filter((x) => allowed.has(x));
}

export const hasRestaurant = (cats: string[]) => suggestedModules(cats).includes('restaurant');
export const hasSales = (cats: string[]) => { const m = suggestedModules(cats); return m.includes('retail') || m.includes('distribution'); };

/** Con 3 o más respuestas "no estoy seguro" el cliente se registra para que lo atendamos, no para crear empresa. */
export const UNSURE_LIMIT = 3;

export function kindFor(sells: Sells | null, cats: string[]): 'products' | 'services' | 'mixed' {
  if (sells === 'products' || sells === 'services') return sells;
  const kinds = new Set(cats.map((id) => BUSINESS_CATEGORIES.find((c) => c.id === id)?.kind).filter(Boolean));
  return kinds.size === 1 ? ([...kinds][0] as 'products' | 'services') : 'mixed';
}
