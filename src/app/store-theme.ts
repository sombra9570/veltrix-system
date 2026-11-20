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
