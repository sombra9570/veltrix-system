// Envía correos desde el dominio de Veltrix (nunca desde el correo personal de nadie).
// Corre SOLO en el servidor. Usa Resend: RESEND_API_KEY y EMAIL_FROM en Vercel.
//   EMAIL_FROM     ej. "Veltrix <hola@veltrixsystem.app>"
//   EMAIL_REPLY_TO ej. "soporte@veltrixsystem.app" (opcional: a dónde llegan las respuestas)
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const resendKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? 'Veltrix <hola@veltrixsystem.app>';
const replyTo = process.env.EMAIL_REPLY_TO;

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Correo con la marca Veltrix, simple y legible en cualquier teléfono */
function layout(subject: string, text: string) {
  const body = esc(text).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#020617;padding:18px 24px;font-size:20px;font-weight:800;color:#ffffff">Veltrix <span style="color:#3b82f6">System</span></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">
<h1 style="margin:0 0 16px;font-size:20px">${esc(subject)}</h1>${body}
</td></tr>
<tr><td style="padding:16px 24px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0">Veltrix System · veltrixsystem.app</td></tr>
</table></td></tr></table></body></html>`;
}

export async function POST(request: Request) {
  if (!resendKey) return fail(503, 'EMAIL_NOT_CONFIGURED');
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'Sesión no válida');

  let body: { to?: string; subject?: string; text?: string };
  try { body = await request.json(); } catch { return fail(400, 'Datos inválidos'); }
  const to = (body.to ?? '').trim().toLowerCase();
  const subject = (body.subject ?? '').trim().slice(0, 150);
  const text = (body.text ?? '').trim().slice(0, 5000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || !text) return fail(400, 'Faltan datos del correo');

  // Por ahora solo el superadmin escribe a los clientes de la plataforma
  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: isAdmin } = await asUser.rpc('is_platform_admin');
  if (!isAdmin) return fail(403, 'Sin permiso');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [to], subject, text, html: layout(subject, text),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) return fail(502, 'EMAIL_SEND_FAILED');
  return Response.json({ ok: true });
}
