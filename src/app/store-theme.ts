// Paletas de la tienda virtual. Cada tienda elige una para su vitrina pública y un fondo para su panel de productos.
export const STORE_THEMES: Record<string, { a: string; h: string; bg: string; bgd: string }> = {
  ocean: { a: '#2563eb', h: '#3b82f6', bg: '#f1f5f9', bgd: '#020617' },
  emerald: { a: '#059669', h: '#10b981', bg: '#ecfdf5', bgd: '#04130d' },
  violet: { a: '#7c3aed', h: '#8b5cf6', bg: '#f5f3ff', bgd: '#0d0820' },
  rose: { a: '#e11d48', h: '#f43f5e', bg: '#fff1f2', bgd: '#1a050a' },
  amber: { a: '#d97706', h: '#f59e0b', bg: '#fffbeb', bgd: '#160d02' },
  teal: { a: '#0d9488', h: '#14b8a6', bg: '#f0fdfa', bgd: '#021311' },
  orange: { a: '#ea580c', h: '#f97316', bg: '#fff7ed', bgd: '#170a02' },
  graphite: { a: '#1e293b', h: '#475569', bg: '#f8fafc', bgd: '#020617' },
};
export const ADMIN_BGS: Record<string, { l: string; d: string }> = {
  none: { l: 'transparent', d: 'transparent' },
  gray: { l: '#f1f5f9', d: '#0b1220' },
  cream: { l: '#fdf8ee', d: '#1a1610' },
  sky: { l: '#e0f2fe', d: '#07202f' },
  mint: { l: '#dcfce7', d: '#06231a' },
  lavender: { l: '#ede9fe', d: '#16112e' },
  blush: { l: '#fce7f3', d: '#2a0f1d' },
  sand: { l: '#f5ead7', d: '#241b0e' },
};

// Colores libres (#rrggbb) además de las paletas rápidas
const HEX = /^#[0-9a-fA-F]{6}$/;
const mix = (hex: string, withHex: string, pct: number) => {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(withHex.slice(i, i + 2), 16));
  return '#' + a.map((v, i) => Math.round(v * (1 - pct) + b[i] * pct).toString(16).padStart(2, '0')).join('');
};
export function resolveTheme(v?: string | null) {
  if (v && HEX.test(v)) return { a: v, h: mix(v, '#ffffff', 0.18), bg: mix(v, '#ffffff', 0.93), bgd: mix(v, '#000000', 0.93) };
  return STORE_THEMES[v ?? 'ocean'] ?? STORE_THEMES.ocean;
}
export function resolveAdminBg(v?: string | null) {
  if (v && HEX.test(v)) return { l: mix(v, '#ffffff', 0.82), d: mix(v, '#000000', 0.88) };
  return ADMIN_BGS[v ?? 'none'] ?? ADMIN_BGS.none;
}
// Cuadro cromático: 8 tonos × 5 intensidades
export const COLOR_GRID: string[][] = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'].map((c) =>
  [mix(c, '#000000', 0.45), mix(c, '#000000', 0.22), c, mix(c, '#ffffff', 0.3), mix(c, '#ffffff', 0.6)]);
