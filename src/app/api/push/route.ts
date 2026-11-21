// Avisos push (funcionan con la app cerrada) para los pedidos de la tienda.
// Corre SOLO en el servidor. Variables en Vercel (las pone el dueño, nunca van en el código):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ej. mailto:soporte@veltrixsystem.app)
// Genera las claves con:  node scripts/vapid-keys.mjs
// Implementa Web Push (RFC 8030 + VAPID RFC 8292 + cifrado RFC 8291) solo con el módulo crypto de Node.
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export const runtime = 'nodejs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const vapidPublic = process.env.VAPID_PUBLIC_KEY;
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:soporte@veltrixsystem.app';

const b64u = (b: Buffer) => b.toString('base64url');
const fromB64u = (s: string) => Buffer.from(s, 'base64url');

type Sub = { endpoint: string; p256dh: string; auth: string; lang: string; role: string };

// Textos del aviso en los 12 idiomas
const TXT: Record<string, { new: string; msg: string; assigned: string; delivery: string }> = {
  es: { new: 'Nuevo pedido', msg: 'Mensaje del cliente', assigned: 'Pedido asignado a ti', delivery: 'Delivery' },
  en: { new: 'New order', msg: 'Customer message', assigned: 'Order assigned to you', delivery: 'Delivery' },
  pt: { new: 'Novo pedido', msg: 'Mensagem do cliente', assigned: 'Pedido atribuído a você', delivery: 'Entrega' },
  fr: { new: 'Nouvelle commande', msg: 'Message du client', assigned: 'Commande qui vous est assignée', delivery: 'Livraison' },
  it: { new: 'Nuovo ordine', msg: 'Messaggio del cliente', assigned: 'Ordine assegnato a te', delivery: 'Consegna' },
  de: { new: 'Neue Bestellung', msg: 'Nachricht vom Kunden', assigned: 'Dir zugewiesene Bestellung', delivery: 'Lieferung' },
  ru: { new: 'Новый заказ', msg: 'Сообщение от клиента', assigned: 'Заказ назначен вам', delivery: 'Доставка' },
  zh: { new: '新订单', msg: '客户消息', assigned: '已分配给你的订单', delivery: '配送' },
  ja: { new: '新しい注文', msg: 'お客様からのメッセージ', assigned: 'あなたに割り当てられた注文', delivery: '配達' },
  ko: { new: '새 주문', msg: '고객 메시지', assigned: '나에게 배정된 주문', delivery: '배달' },
  ar: { new: 'طلب جديد', msg: 'رسالة من العميل', assigned: 'طلب مُسند إليك', delivery: 'توصيل' },
  hi: { new: 'नया ऑर्डर', msg: 'ग्राहक का संदेश', assigned: 'आपको सौंपा गया ऑर्डर', delivery: 'डिलीवरी' },
};

function vapidHeader(endpoint: string) {
  const pub = fromB64u(vapidPublic!);
  const key = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: vapidPrivate!, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk',
  });
  const head = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapidSubject })));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${vapidPublic}`;
}

/** Cifra el mensaje para el navegador (aes128gcm, RFC 8291) */
function encrypt(payload: string, p256dh: string, auth: string) {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const secret = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, authSecret, keyInfo, 32));
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

async function send(sub: Sub, payload: string) {
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidHeader(sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body: new Uint8Array(encrypt(payload, sub.p256dh, sub.auth)),
    signal: AbortSignal.timeout(10_000),
  });
  return res.status;
}

/** El navegador pide la clave pública para suscribirse (no es secreta) */
export async function GET() {
  if (!vapidPublic || !vapidPrivate) return Response.json({ enabled: false });
  return Response.json({ enabled: true, key: vapidPublic });
}

/**
 * Aviso de un pedido. El texto y los destinatarios los decide la base de datos
 * (quien tiene el permiso de pedidos/asignar, o el trabajador asignado); quien llama solo indica qué pasó.
 * La base valida que el hecho sea real y reciente y no deja repetirlo.
 */
export async function POST(req: Request) {
  if (!vapidPublic || !vapidPrivate || !serviceKey) return Response.json({ sent: 0, reason: 'not_configured' });
  let body: { request?: string; event?: string };
  try { body = await req.json(); } catch { return Response.json({ error: 'bad_json' }, { status: 400 }); }
  const id = String(body.request ?? '');
  const ev = String(body.event ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || !['new', 'msg', 'assigned'].includes(ev)) return Response.json({ error: 'bad_input' }, { status: 400 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc('push_claim', { p_request: id, p_event: ev });
  if (error) return Response.json({ error: 'claim_failed' }, { status: 500 });
  const claim = data as { customer: string; kind: string; subs: Sub[] } | null;
  if (!claim || !claim.subs.length) return Response.json({ sent: 0 });

  let sent = 0;
  await Promise.all(claim.subs.map(async (s) => {
    const tx = TXT[s.lang] ?? TXT[s.lang.slice(0, 2)] ?? TXT.es;
    const title = `🧾 ${tx[ev as 'new' | 'msg' | 'assigned']}`;
    const text = [claim.customer, claim.kind === 'delivery' ? tx.delivery : ''].filter(Boolean).join(' · ');
    const payload = JSON.stringify({ title, body: text, url: `/dashboard/${s.role}/tienda`, tag: `order-${id}` });
    try {
      const st = await send(s, payload);
      if (st === 404 || st === 410) await admin.rpc('push_drop', { p_endpoint: s.endpoint });
      else if (st >= 200 && st < 300) sent++;
    } catch { /* sin conexión con el servicio del navegador */ }
  }));
  return Response.json({ sent });
}
