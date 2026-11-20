// Borrado definitivo de una empresa (solo superadmin, solo en el servidor).
// Pasos: 1) pedir el borrado y ver el resumen, 2) escribir el nombre exacto, la clave de borrado (10-12 caracteres) y la palabra BORRAR.
// La clave NO está en la base ni en ninguna pantalla: es la variable secreta PURGE_KEY del servidor (10-12 caracteres). 5 fallos seguidos bloquean 30 minutos; cada intento queda en purge_log.
// Borra la base (admin_purge_org), los archivos de todos los almacenamientos y las cuentas de acceso del personal.
import { createClient } from '@supabase/supabase-js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { listAll, removeFiles, buckets } from '../../../../lib/purge-files';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status: number, error: string, extra: Record<string, unknown> = {}) { return Response.json({ error, ...extra }, { status }); }

type Body = { action?: string; enabled?: boolean; org?: string; request?: string; name?: string; key?: string; phrase?: string };

export async function POST(request: Request) {
  if (!url || !anonKey || !serviceKey) return fail(500, 'Faltan las claves de Supabase');
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'Sesión no válida');
  let body: Body;
  try { body = await request.json(); } catch { return fail(400, 'Datos inválidos'); }

  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: isAdmin } = await asUser.rpc('is_platform_admin');
  const { data: me } = await asUser.auth.getUser(token);
  const actor = me?.user?.id;
  if (!isAdmin || !actor) return fail(403, 'Solo el superadmin puede borrar empresas');
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const log = (org: string | null, name: string | null, action: string, ok: boolean, detail = '') =>
    admin.rpc('purge_log_add', { p_actor: actor, p_org: org, p_name: name, p_action: action, p_ok: ok, p_detail: detail });

  // Revisa la clave contra la variable secreta del servidor (con bloqueo por intentos)
  const sha = (x: string) => createHash('sha256').update(x).digest();
  const checkKey = async (key: string | undefined, action: string, org: string | null, name: string | null) => {
    const secret = process.env.PURGE_KEY ?? '';
    if (secret.length < 10 || secret.length > 12) { await log(org, name, action, false, 'clave no configurada en el servidor'); return fail(503, 'KEY_NOT_SET'); }
    const { data: lock } = await admin.rpc('purge_lock_state', { p_actor: actor });
    const ls = lock as { locked?: boolean; locked_until?: string } | null;
    if (ls?.locked) { await log(org, name, action, false, 'bloqueado'); return fail(423, 'KEY_LOCKED', { locked_until: ls.locked_until ?? null }); }
    const ok = timingSafeEqual(sha(key ?? ''), sha(secret));
    const { data: att } = await admin.rpc('purge_attempt', { p_actor: actor, p_ok: ok });
    if (!ok) { await log(org, name, action, false, 'clave incorrecta'); return fail(403, 'KEY_WRONG', { left: (att as { left?: number } | null)?.left ?? 0 }); }
    return null;
  };

  switch (body.action) {
    case 'start': {
      if (!body.org || !UUID.test(body.org)) return fail(400, 'Empresa inválida');
      const { data, error } = await admin.rpc('purge_start', { p_actor: actor, p_org: body.org });
      if (error) return fail(400, error.message);
      let files = 0;
      try { for (const b of await buckets(admin)) files += (await listAll(admin, b, body.org)).length; } catch { /* solo informativo */ }
      await log(body.org, (data as { name: string }).name, 'start', true);
      return Response.json({ ...(data as object), files });
    }
    case 'run': {
      if (!body.request || !UUID.test(body.request)) return fail(400, 'Solicitud inválida');
      if (body.phrase !== 'BORRAR') return fail(400, 'PHRASE');
      const bad = await checkKey(body.key, 'run', null, body.name ?? null);
      if (bad) return bad;
      const { data: grant, error: gErr } = await admin.rpc('purge_consume', { p_actor: actor, p_request: body.request, p_name: body.name ?? '' });
      if (gErr) {
        await log(null, body.name ?? null, 'run', false, gErr.message);
        return fail(400, gErr.message.includes('MISMATCH') ? 'NAME_MISMATCH' : gErr.message.includes('TOO_FAST') ? 'TOO_FAST' : 'REQUEST_INVALID');
      }
      const { org, name } = grant as { org: string; name: string };
      // 1) base de datos y cuentas de acceso del personal; 2) archivos de todos los almacenamientos
      const { data: res, error: pErr } = await admin.rpc('admin_purge_org', { p_org: org, p_confirm: name, p_actor: actor });
      if (pErr) { await log(org, name, 'run', false, pErr.message); return fail(400, pErr.message.includes('propia') ? 'OWN_ORG' : `DB: ${pErr.message}`); }
      let removed = 0; const failed: string[] = [];
      for (const b of await buckets(admin)) {
        try { const list = await listAll(admin, b, org); await removeFiles(admin, b, list); removed += list.length; }
        catch (e) { failed.push(`${b}: ${(e as Error).message}`); }
      }
      await log(org, name, 'run', failed.length === 0, `registros ${(res as { rows: number }).rows}, archivos ${removed}${failed.length ? `, fallaron: ${failed.join('; ')}` : ''}`);
      return Response.json({ ...(res as object), files_removed: removed, files_failed: failed });
    }
    case 'sweep': {
      // Archivos de empresas que ya no existen (restos de borrados anteriores)
      const bad = await checkKey(body.key, 'sweep', null, null);
      if (bad) return bad;
      const { data: orgs } = await admin.from('organizations').select('id');
      const alive = new Set((orgs ?? []).map((o: { id: string }) => o.id));
      let removed = 0; const failed: string[] = [];
      for (const b of await buckets(admin)) {
        const { data: top } = await admin.storage.from(b).list('', { limit: 1000 });
        for (const it of top ?? []) {
          if (it.id || !UUID.test(it.name) || alive.has(it.name)) continue;
          try { const list = await listAll(admin, b, it.name); await removeFiles(admin, b, list); removed += list.length; }
          catch (e) { failed.push(`${b}/${it.name}: ${(e as Error).message}`); }
        }
      }
      await log(null, null, 'sweep', failed.length === 0, `archivos ${removed}${failed.length ? `, fallaron: ${failed.join('; ')}` : ''}`);
      return Response.json({ files_removed: removed, files_failed: failed });
    }
    case 'auto_status': {
      const { data: cfg } = await admin.rpc('auto_purge_settings_get');
      const { data: list } = await admin.rpc('auto_purge_candidates', { p_all: true });
      return Response.json({ ...(cfg as object), list: list ?? [] });
    }
    case 'auto_set': {
      const bad = await checkKey(body.key, 'auto_set', null, null);
      if (bad) return bad;
      const { error } = await admin.rpc('auto_purge_settings_set', { p_actor: actor, p_enabled: !!body.enabled });
      if (error) return fail(400, error.message);
      return Response.json({ ok: true });
    }
    default:
      return fail(400, 'Acción inválida');
  }
}
