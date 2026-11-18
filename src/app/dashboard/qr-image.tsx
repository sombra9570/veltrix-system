'use client';
import { useEffect, useState } from 'react';

/** QR generado por el propio sistema (sin servicios externos). Sirve para mesas, tiendas, enlaces de pago, etc. */
export function QrImage({ value, size = 480, alt = 'QR', className = '' }: { value: string; size?: number; alt?: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    import('qrcode')
      .then((Q) => Q.toDataURL(value, { width: size, margin: 2, errorCorrectionLevel: 'M' }))
      .then((u) => { if (alive) setSrc(u); })
      .catch(() => { if (alive) setSrc(null); });
    return () => { alive = false; };
  }, [value, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={alt} className={className} /> : <span className={`block aspect-square animate-pulse rounded bg-slate-200 dark:bg-slate-800 ${className}`} aria-label={alt} />;
}

/** Descarga el QR como imagen PNG lista para imprimir, con un rótulo debajo (por ejemplo "Mesa 3"). */
export async function downloadQr(value: string, label: string, filename: string) {
  const Q = await import('qrcode');
  const qr = await Q.toDataURL(value, { width: 800, margin: 2, errorCorrectionLevel: 'M' });
  const img = new Image();
  await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error('qr')); img.src = qr; });
  const pad = 110;
  const c = document.createElement('canvas');
  c.width = 800; c.height = 800 + pad;
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, 800, 800);
  g.fillStyle = '#0f172a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 54px system-ui, sans-serif';
  g.fillText(label.slice(0, 28), 400, 800 + pad / 2 - 2);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `${filename.replace(/[^\w-]+/g, '_')}.png`;
  document.body.appendChild(a); a.click(); a.remove();
}
