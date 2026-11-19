import type { ReactNode } from 'react';

export type TileIcon = 'pin' | 'clock' | 'users' | 'userPlus' | 'wallet' | 'receipt' | 'refresh' | 'sliders';

const P: Record<TileIcon, ReactNode> = {
  pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0116 0z" /><circle cx="12" cy="10" r="3" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  users: <><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></>,
  userPlus: <><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>,
  wallet: <><path d="M20 12V8H6a2 2 0 010-4h12v4" /><path d="M4 6v12a2 2 0 002 2h14v-4" /><path d="M18 12a2 2 0 000 4h4v-4z" /></>,
  receipt: <><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" /><path d="M16 8h-6a2 2 0 100 4h4a2 2 0 010 4H8M12 6v2m0 8v2" /></>,
  refresh: <><path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16M8 16H3v5" /></>,
  sliders: <><path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></>,
};

export function Icon({ name }: { name: TileIcon }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[name]}
    </svg>
  );
}

const TONE = {
  blue: 'bg-blue-600 text-white shadow-sm hover:bg-blue-700',
  amber: 'bg-amber-600 text-white shadow-sm hover:bg-amber-700',
  plain: 'border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
} as const;

/** Botón grande de la pantalla principal: icono arriba a la izquierda, nombre abajo, esquinas redondeadas */
export function MenuTile({ icon, label, tone, onClick, disabled }: {
  icon: TileIcon; label: string; tone: keyof typeof TONE; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`flex aspect-[5/4] min-w-0 flex-col justify-between rounded-3xl p-4 text-left transition active:scale-[0.98] cursor-pointer disabled:opacity-50 ${TONE[tone]}`}>
      <span className={`grid h-12 w-12 place-items-center rounded-2xl ${tone === 'plain' ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300' : 'bg-white/20'}`}>
        <Icon name={icon} />
      </span>
      <span className="break-words text-base font-bold leading-tight">{label}</span>
    </button>
  );
}
