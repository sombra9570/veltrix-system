// Código del artículo, solo para el personal (nunca se envía al cliente). Si el permiso está apagado no llega y no se dibuja.
export function SkuTag({ sku }: { sku?: string | null }) {
  if (!sku) return null;
  return <span className="ms-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 align-middle font-mono text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{sku}</span>;
}
