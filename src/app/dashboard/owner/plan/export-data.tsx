'use client';
import { useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT } from '../../../i18n';

// Tablas que se exportan (las reglas de seguridad ya limitan a los datos de esta organización)
const TABLES = ['customers', 'products', 'orders', 'order_items', 'installments', 'payments', 'expenses',
  'suppliers', 'purchases', 'work_orders'] as const;
const PAGE = 1000;

/** CSV compatible con Excel (BOM, separador coma, comillas cuando hace falta) */
function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const cols = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set<string>()));
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
}

// ---- ZIP sin compresión (método "store"): suficiente para CSV y no necesita librerías ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const name = enc.encode(f.name); const crc = crc32(f.data); const size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  }
  const cSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' });
}

/** Descarga todos los datos del negocio en un .zip con un CSV por tabla (se abre en Excel o Google Sheets) */
export function ExportData() {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [err, setErr] = useState(false);

  const run = async () => {
    setBusy(true); setErr(false);
    try {
      const enc = new TextEncoder();
      const files: { name: string; data: Uint8Array }[] = [];
      for (const table of TABLES) {
        const rows: Record<string, unknown>[] = [];
        for (let from = 0; ; from += PAGE) {
          setProgress(t('exp.progress', { table, n: rows.length }));
          const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: true }).range(from, from + PAGE - 1);
          if (error) throw new Error(error.message);
          rows.push(...((data ?? []) as Record<string, unknown>[]));
          if (!data || data.length < PAGE) break;
        }
        files.push({ name: `${table}.csv`, data: enc.encode(toCsv(rows)) });
      }
      const url = URL.createObjectURL(zip(files));
      const a = document.createElement('a');
      a.href = url; a.download = `veltrix-datos-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setProgress(t('exp.done'));
    } catch { setErr(true); setProgress(''); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <h2 className="font-bold">📥 {t('exp.title')}</h2>
      <p className={`mt-1 text-sm ${ui.muted}`}>{t('exp.text')}</p>
      <button type="button" disabled={busy} onClick={run} className={`${ui.btnGhost} mt-3 max-sm:w-full`}>{busy ? t('common.wait') : t('exp.btn')}</button>
      {progress && <p className={`mt-2 text-xs ${ui.muted}`}>{progress}</p>}
      {err && <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">{t('exp.error')}</p>}
    </Card>
  );
}
