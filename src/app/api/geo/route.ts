// País del visitante según su conexión (Vercel lo agrega en cada petición). Sin datos personales ni cookies.
export const runtime = 'edge';

export function GET(req: Request) {
  const country = req.headers.get('x-vercel-ip-country') ?? null;
  return Response.json({ country }, { headers: { 'Cache-Control': 'private, no-store' } });
}
