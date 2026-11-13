import { Suspense } from 'react';
import type { Metadata } from 'next';
import { StoreView } from './store-view';

type Props = { params: Promise<{ slug: string }> };

type PublicStore = { name: string; description: string | null; logo: string | null; products: { photo: string | null }[] } | null;

// Datos mínimos para la vista previa al compartir el enlace (WhatsApp, Facebook…)
async function fetchStore(slug: string): Promise<PublicStore> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/public_store`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: slug }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicStore;
  } catch {
    return null;
  }
}

const img = (path: string | null | undefined) =>
  path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/store-images/${path}` : undefined;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const s = await fetchStore(slug);
  if (!s) return { title: 'Veltrix', robots: { index: false } };
  const image = img(s.logo) ?? img(s.products.find((p) => p.photo)?.photo);
  const description = s.description ?? `${s.name} · Veltrix`;
  return {
    title: s.name,
    description,
    openGraph: { title: s.name, description, type: 'website', images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: s.name, description, images: image ? [image] : undefined },
  };
}

async function Content({ params }: Props) {
  const { slug } = await params;
  return <StoreView slug={slug} />;
}

export default function StorePage({ params }: Props) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-slate-50 dark:bg-slate-950" />}>
      <Content params={params} />
    </Suspense>
  );
}
