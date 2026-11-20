// Archivos de una empresa en todos los almacenamientos (la API de Storage es la única forma permitida de borrarlos). Solo servidor.
import type { SupabaseClient } from '@supabase/supabase-js';

// Todos los archivos (recursivo) bajo una carpeta de un almacenamiento
export async function listAll(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string) => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.storage.from(bucket).list(dir, { limit: 1000, offset });
      if (error || !data || data.length === 0) return;
      for (const it of data) {
        const path = dir ? `${dir}/${it.name}` : it.name;
        if (it.id) out.push(path); else await walk(path);
      }
      if (data.length < 1000) return;
    }
  };
  await walk(prefix);
  return out;
}

export async function removeFiles(admin: SupabaseClient, bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
}

export async function buckets(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin.storage.listBuckets();
  return (data ?? []).map((b) => b.id);
}

