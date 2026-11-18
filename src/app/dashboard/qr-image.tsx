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
