// Borrado automático de empresas suspendidas que cumplieron el plazo sin renovar (sin clave: el plazo es la autorización).
// Lo llama el cron de Vercel una vez al día con CRON_SECRET. Si el borrado automático está APAGADO, no borra nada.
// Máximo 3 empresas por corrida y nunca piloto ni empresas de un superadmin (lo decide la base).
import { createClient } from '@supabase/supabase-js';
import { listAll, removeFiles, buckets } from '../../../../lib/purge-files';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const cronSecret = process.env.CRON_SECRET;
const MAX_PER_RUN = 3;

export async function GET(request: Request) {
  if (!url || !serviceKey || !cronSecret) return Response.json({ error: 'Falta configuración' }, { status: 500 });
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) return Response.json({ error: 'No autorizado' }, { status: 401 });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: cfg } = await admin.rpc('auto_purge_settings_get');
  if (!(cfg as { enabled?: boolean } | null)?.enabled) return Response.json({ enabled: false, deleted: [] });

  const { data: due } = await admin.rpc('auto_purge_candidates', { p_all: false });
  const deleted: string[] = [];
  for (const c of ((due ?? []) as { org_id: string; name: string }[]).slice(0, MAX_PER_RUN)) {
    const { error } = await admin.rpc('auto_purge_org', { p_org: c.org_id });
    if (error) { await admin.from('purge_log').insert({ org_id: c.org_id, org_name: c.name, action: 'auto', ok: false, detail: error.message.slice(0, 500) }); continue; }
    const failed: string[] = [];
    for (const b of await buckets(admin)) {
      try { await removeFiles(admin, b, await listAll(admin, b, c.org_id)); } catch (e) { failed.push(`${b}: ${(e as Error).message}`); }
    }
    if (failed.length) await admin.from('purge_log').insert({ org_id: c.org_id, org_name: c.name, action: 'auto_files', ok: false, detail: failed.join('; ').slice(0, 500) });
    deleted.push(c.name);
  }
  return Response.json({ enabled: true, deleted });
}
