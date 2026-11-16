import { money } from './format';
import type { DictKey } from '../i18n/es';

export type T = (k: DictKey, v?: Record<string, string | number>) => string;
export type Receipt = {
  id: string; at: string; status: string; condition: string; currency: string; total: number; tip: number | null;
  notes: string | null; paid: boolean;
  company: { name: string; tax_id: string | null } | null;
  branch: { name: string; address: string | null; timezone: string } | null;
  customer: string | null; vendor: string | null;
  items: { description: string; qty: number; price: number; total: number }[];
  installments: { number: number; due: string; amount: number }[];
};

const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export const shortId = (id: string) => id.slice(0, 8).toUpperCase();

function when(r: Receipt, lang: string) {
  try { return new Date(r.at).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short', timeZone: r.branch?.timezone }); }
  catch { return r.at.slice(0, 16).replace('T', ' '); }
}
const qty = (n: number) => String(Number(n));

/** Texto plano del comprobante (para WhatsApp o el portapapeles) */
export function receiptText(r: Receipt, t: T, lang: string): string {
  const m = (n: number) => money(Number(n), r.currency, lang);
  const L: string[] = [];
  L.push(`*${r.company?.name ?? ''}*`);
  if (r.company?.tax_id) L.push(`NIT/ID: ${r.company.tax_id}`);
  if (r.branch) L.push([r.branch.name, r.branch.address].filter(Boolean).join(' · '));
  L.push(`${t('rc.no')} ${shortId(r.id)} · ${when(r, lang)}`);
  if (r.status === 'cancelled') L.push(`⚠️ ${t('rc.voided')}`);
  if (r.customer) L.push(`${t('rc.customer')}: ${r.customer}`);
  L.push('');
  for (const i of r.items) L.push(`${qty(i.qty)} × ${i.description} — ${m(i.total)}`);
  if (r.tip && Number(r.tip) > 0) L.push(`${t('rc.tip')}: ${m(r.tip)}`);
  L.push('');
  L.push(`*${t('rc.total')}: ${m(r.total)}*`);
  if (r.condition === 'credit') {
    L.push(`📅 ${t('rc.credit')}`);
    for (const c of r.installments) L.push(`  ${c.number}. ${c.due} — ${m(c.amount)}`);
  }
  if (r.vendor) L.push(`${t('rc.vendor')}: ${r.vendor}`);
  L.push('');
  L.push(t('rc.thanks'));
  return L.join('\n');
}

/** Ticket de 80 mm listo para imprimir (también sale bien en hoja A4) */
export function receiptHtml(r: Receipt, t: T, lang: string): string {
  const m = (n: number) => money(Number(n), r.currency, lang);
  const rows = r.items.map((i) =>
    `<tr><td>${esc(qty(i.qty))} × ${esc(i.description)}</td><td class="r">${esc(m(i.total))}</td></tr>`).join('');
  const inst = r.condition === 'credit' && r.installments.length
    ? `<p class="c">📅 ${esc(t('rc.credit'))}</p><table>${r.installments.map((c) =>
      `<tr><td>${c.number}. ${esc(c.due)}</td><td class="r">${esc(m(c.amount))}</td></tr>`).join('')}</table>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t('rc.title'))} ${shortId(r.id)}</title>
<style>@page{size:80mm auto;margin:4mm}*{box-sizing:border-box}body{font:12px/1.35 system-ui,sans-serif;margin:0;color:#000;width:72mm}
h1{font-size:15px;margin:0 0 2px;text-align:center}p{margin:2px 0}.c{text-align:center}.r{text-align:right;white-space:nowrap;padding-left:6px}
table{width:100%;border-collapse:collapse}td{padding:2px 0;vertical-align:top}hr{border:0;border-top:1px dashed #000;margin:6px 0}
.tot td{font-size:15px;font-weight:700;padding-top:4px}.v{font-size:16px;font-weight:700;text-align:center;border:2px solid #000;margin:6px 0;padding:3px}.s{font-size:10px;text-align:center}</style></head><body>
<h1>${esc(r.company?.name ?? '')}</h1>
${r.company?.tax_id ? `<p class="c">NIT/ID: ${esc(r.company.tax_id)}</p>` : ''}
${r.branch ? `<p class="c">${esc([r.branch.name, r.branch.address].filter(Boolean).join(' · '))}</p>` : ''}
<hr><p>${esc(t('rc.no'))} <b>${shortId(r.id)}</b></p><p>${esc(when(r, lang))}</p>
${r.customer ? `<p>${esc(t('rc.customer'))}: ${esc(r.customer)}</p>` : ''}
${r.status === 'cancelled' ? `<div class="v">${esc(t('rc.voided'))}</div>` : ''}
<hr><table>${rows}</table>
${r.tip && Number(r.tip) > 0 ? `<table><tr><td>${esc(t('rc.tip'))}</td><td class="r">${esc(m(r.tip))}</td></tr></table>` : ''}
<hr><table class="tot"><tr><td>${esc(t('rc.total'))}</td><td class="r">${esc(m(r.total))}</td></tr></table>
${inst}
${r.vendor ? `<p>${esc(t('rc.vendor'))}: ${esc(r.vendor)}</p>` : ''}
<hr><p class="c">${esc(t('rc.thanks'))}</p><p class="s">${esc(t('rc.notFiscal'))}</p></body></html>`;
}

/** Imprime sin abrir ventanas nuevas (no lo bloquea el navegador) */
export function printReceipt(r: Receipt, t: T, lang: string) {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentDocument;
  const w = f.contentWindow;
  if (!d || !w) { f.remove(); return; }
  d.open(); d.write(receiptHtml(r, t, lang)); d.close();
  setTimeout(() => { w.focus(); w.print(); setTimeout(() => f.remove(), 60_000); }, 300);
}
