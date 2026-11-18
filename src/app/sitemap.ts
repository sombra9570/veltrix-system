import type { MetadataRoute } from 'next';

const SITE = 'https://www.veltrixsystem.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ['', '/registro', '/ingresar', '/terminos', '/privacidad', '/reembolsos'];
  return pages.map((p) => ({ url: `${SITE}${p}`, changeFrequency: p === '' ? 'weekly' : 'monthly', priority: p === '' ? 1 : 0.5 }));
}
