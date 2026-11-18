// Menú de cada rol: una sola fuente. Un rol propio suma al suyo las pantallas de los roles que cubre.
import type { NavItem } from './shell';

export const ROLE_NAV = {
  vendor: [
  { href: '/dashboard/vendor', icon: '🛒', label: 'nav.pos' },
  { href: '/dashboard/vendor/ventas', icon: '🧾', label: 'nav.mySales' },
  { href: '/dashboard/vendor/clientes', icon: '🤝', label: 'nav.customers' },
  { href: '/dashboard/vendor/mensajes', icon: '💬', label: 'nav.messages' },
] as NavItem[],
  kitchen: [
  { href: '/dashboard/kitchen', icon: '🔥', label: 'nav.kitchen' },
  { href: '/dashboard/kitchen/mensajes', icon: '💬', label: 'nav.messages' },
] as NavItem[],
  supervisor: [
  // Lo que ve depende del rubro de la empresa: cobranza, restaurante, taller o tienda
  { href: '/dashboard/supervisor', icon: '🛵', label: 'sup.navRoutes', module: 'field_collection' },
  { href: '/dashboard/supervisor/prestamos', icon: '💸', label: 'nav.loans', module: 'field_collection' },
  { href: '/dashboard/supervisor/mesas', icon: '🍽️', label: 'nav.tables', module: 'restaurant' },
  { href: '/dashboard/supervisor/cocina', icon: '🔥', label: 'nav.kitchen', module: 'restaurant' },
  { href: '/dashboard/supervisor/taller', icon: '🔧', label: 'nav.workshop', module: 'workshop' },
  { href: '/dashboard/supervisor/ventas', icon: '🧾', label: 'nav.sales' },
  { href: '/dashboard/supervisor/caja', icon: '💵', label: 'nav.cash' },
  { href: '/dashboard/supervisor/inventario', icon: '📦', label: 'nav.inventory' },
  { href: '/dashboard/supervisor/despacho', icon: '🚚', label: 'nav.dispatch', module: 'retail' },
  { href: '/dashboard/supervisor/clientes', icon: '🤝', label: 'nav.customers' },
  { href: '/dashboard/supervisor/reportes', icon: '📈', label: 'nav.reports' },
  { href: '/dashboard/supervisor/mensajes', icon: '💬', label: 'nav.messages' },
] as NavItem[],
  collector: [
  { href: '/dashboard/collector', icon: '🛵', label: 'nav.route' },
  { href: '/dashboard/collector/mensajes', icon: '💬', label: 'nav.messages' },
] as NavItem[],
  storekeeper: [
  { href: '/dashboard/storekeeper', icon: '📦', label: 'nav.inventory' },
  { href: '/dashboard/storekeeper/despacho', icon: '🚚', label: 'nav.dispatch', module: 'retail' },
  { href: '/dashboard/storekeeper/productos', icon: '🏷️', label: 'nav.products' },
  { href: '/dashboard/storekeeper/tienda', icon: '📋', label: 'nav.store' },
  { href: '/dashboard/storekeeper/mensajes', icon: '💬', label: 'nav.messages' },
] as NavItem[],
  waiter: [
  { href: '/dashboard/waiter', icon: '🍽️', label: 'nav.tables' },
  { href: '/dashboard/waiter/mensajes', icon: '💬', label: 'nav.messages' },
] as NavItem[],
  accountant: [
  { href: '/dashboard/accountant', icon: '📈', label: 'nav.reports' },
  { href: '/dashboard/accountant/ventas', icon: '🧾', label: 'nav.sales' },
  { href: '/dashboard/accountant/inventario', icon: '📦', label: 'nav.inventory' },
  { href: '/dashboard/accountant/clientes', icon: '🤝', label: 'nav.customers' },
  { href: '/dashboard/accountant/mensajes', icon: '💬', label: 'nav.messages' },
] as NavItem[],
  cashier: [
  { href: '/dashboard/cashier', icon: '💵', label: 'nav.cash' },
  { href: '/dashboard/cashier/vender', icon: '🛒', label: 'nav.pos' },
  { href: '/dashboard/cashier/ventas', icon: '🧾', label: 'nav.mySales' },
  { href: '/dashboard/cashier/mensajes', icon: '💬', label: 'nav.messages' },
] as NavItem[],
  technician: [
  { href: '/dashboard/workshop', icon: '🔧', label: 'nav.workshop' },
  { href: '/dashboard/workshop/mensajes', icon: '💬', label: 'nav.messages' },
] as NavItem[],
} as const;
