import type { MetadataRoute } from 'next';

const SITE = 'https://www.veltrixsystem.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/dashboard/', '/pagar', '/restablecer'] }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
