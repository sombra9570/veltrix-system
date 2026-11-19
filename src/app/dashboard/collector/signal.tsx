'use client';
import { useT } from '../../i18n';

export type SignalState = 'ok' | 'off' | 'pending';

/**
 * Antenita de sincronización (como la señal wifi):
 *  verde = todo subido · amarillo = sin internet · rojo = hay datos sin subir.
 * Al tocarla sube lo pendiente: mientras sube muestra un circulito girando y luego vuelve a su color.
 */
export function SignalButton({ state, pending, syncing, onClick }: {
  state: SignalState; pending: number; syncing: boolean; onClick: () => void;
}) {
  const { t } = useT();
  const color = state === 'ok' ? 'text-emerald-500' : state === 'off' ? 'text-amber-500' : 'text-red-500';
  const label = syncing ? t('cx.sig.sync') : state === 'ok' ? t('cx.sig.ok') : state === 'off' ? t('cx.sig.off') : t('cx.sig.pending', { n: pending });
  return (
    <button type="button" onClick={onClick} disabled={syncing} aria-label={label} title={label}
      className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-300 cursor-pointer dark:border-slate-700 ${color}`}>
      {syncing ? (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="animate-spin">
          <circle cx="12" cy="12" r="9" opacity="0.25" />
          <path d="M12 3a9 9 0 0 1 9 9" />
          <path d="M12 15V9M9.5 11.5 12 9l2.5 2.5" strokeWidth="2" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 8.8a15 15 0 0 1 20 0" />
          <path d="M5 12.5a10 10 0 0 1 14 0" />
          <path d="M8.5 16.2a5 5 0 0 1 7 0" />
          <circle cx="12" cy="19.5" r="1" fill="currentColor" />
          {state === 'off' && <path d="M3 3l18 18" />}
        </svg>
      )}
      {pending > 0 && !syncing && (
        <span className="absolute -end-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{pending}</span>
      )}
    </button>
  );
}
