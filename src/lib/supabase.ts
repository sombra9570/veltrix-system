'use client';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('Veltrix: faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local');
}

// Tiempo máximo por consulta: si la red queda colgada, falla y la pantalla avisa (nunca espera para siempre).
// Las subidas de fotos tienen más margen por las señales lentas.
const timedFetch: typeof fetch = (input, init) => {
  const ms = String(input instanceof Request ? input.url : input).includes('/storage/') ? 90_000 : 25_000;
  const timeout = AbortSignal.timeout(ms);
  const signal = init?.signal && 'any' in AbortSignal ? AbortSignal.any([init.signal, timeout]) : (init?.signal ?? timeout);
  return fetch(input, { ...init, signal });
};

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true },
  global: { fetch: timedFetch },
});

/** Llama a una función de la base de datos (RPC) y devuelve el error en texto claro. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    // Falla de red o del servidor (no un error de negocio como "sin permiso"): avisar a la pantalla
    const code = (error as { code?: string }).code ?? '';
    if (!code || /^(5|PGRST0|08)/.test(code) || /fetch|network|timeout/i.test(error.message)) {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('veltrix:net-error'));
    }
    throw new Error(error.message);
  }
  return data as T;
}
