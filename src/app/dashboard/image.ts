/**
 * Comprime una foto en el mismo teléfono antes de subirla:
 * lado mayor 1600 px, WebP (o JPEG si el navegador no sabe WebP), calidad 0.8.
 * Una foto de 4–5 MB queda en ~150–300 KB y se sigue leyendo nítida.
 */
export const MAX_UPLOAD_BYTES = 800_000; // los buckets aceptan 1 MB: se deja margen

export async function compressImage(file: File, maxSide = 1600, quality = 0.8, maxBytes = MAX_UPLOAD_BYTES): Promise<Blob> {
  let bitmap: ImageBitmap | HTMLImageElement;
  try { bitmap = await loadImage(file); } catch { throw new Error('PHOTO_UNREADABLE'); }
  let side = maxSide;
  let q = quality;
  let best: Blob | null = null;
  // Si la foto es muy detallada y pesa demasiado, se baja la calidad y luego el tamaño hasta que quepa
  for (let i = 0; i < 8; i++) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('PHOTO_UNREADABLE');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // WebP; si el navegador no lo sabe (Safari), JPEG
    let blob = await toBlob(canvas, 'image/webp', q);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', q);
    if (!blob) throw new Error('PHOTO_UNREADABLE');
    best = blob;
    if (blob.size <= maxBytes) return blob;
    if (q > 0.55) q -= 0.1; else { side = Math.round(side * 0.8); q = 0.6; }
  }
  if (best && best.size <= 1_000_000) return best;
  throw new Error('PHOTO_TOO_BIG');
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      // respeta la orientación de la foto del celular
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch { /* se intenta con <img> */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

export function extFor(blob: Blob) {
  return blob.type === 'image/webp' ? 'webp' : 'jpg';
}

/** Enlace público de una foto de la tienda (bucket público "store-images") */
export function storeImageUrl(path: string | null | undefined) {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return `${base}/storage/v1/object/public/store-images/${path}`;
}
