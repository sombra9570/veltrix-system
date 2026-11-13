import { NextResponse } from 'next/server';

// Tipo de Cambio Oficial (TCO) del Banco Central de Bolivia.
// Desde el 29-jun-2026 el TCO es flexible y se publica a diario; las facturas en moneda
// extranjera deben registrar el TCO vigente a la fecha de la transacción.
const BCB_URL = 'https://www.bcb.gob.bo/librerias/indicadores/otras/anteriores.php';

const MONTHS: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10',
  noviembre: '11', diciembre: '12',
};

function parseRate(html: string): number | null {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const start = text.search(/Tipo de Cambio Oficial/i);
  const zone = start >= 0 ? text.slice(start, start + 600) : text;
  const m = zone.match(/USD\s+(\d{1,3}[.,]\d{1,4})/);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return n > 1 && n < 1000 ? n : null;
}

function parseDate(html: string): string | null {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const m = text.match(/COTIZACIONES DEL (\d{1,2}) DE ([A-ZÁÉÍÓÚ]+) DE (\d{4})/i);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  return month ? `${m[3]}-${month}-${m[1].padStart(2, '0')}` : null;
}

export async function GET() {
  try {
    const res = await fetch(BCB_URL, { cache: 'no-store', headers: { 'User-Agent': 'VeltrixSystem/1.0' } });
    if (!res.ok) throw new Error(`BCB respondió ${res.status}`);
    const html = await res.text();
    const rate = parseRate(html);
    if (!rate) throw new Error('No se encontró el TCO en la página del BCB');
    return NextResponse.json(
      { currency: 'BOB', rate, date: parseDate(html), source: 'BCB · Tipo de Cambio Oficial' },
      { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error al consultar el BCB' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
