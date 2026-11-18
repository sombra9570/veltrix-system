import { Suspense } from 'react';
import type { Metadata } from 'next';
import { TableMenu } from './table-menu';

type Props = { params: Promise<{ token: string }> };

// Cada mesa tiene su propio enlace: no se indexa en buscadores
export const metadata: Metadata = { title: 'Pedido desde tu mesa', robots: { index: false, follow: false } };

async function Content({ params }: Props) {
  const { token } = await params;
  return <TableMenu token={token} />;
}

export default function TablePage({ params }: Props) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-slate-50 dark:bg-slate-950" />}>
      <Content params={params} />
    </Suspense>
  );
}
