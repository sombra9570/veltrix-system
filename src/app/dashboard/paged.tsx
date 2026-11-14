'use client';
import { useEffect, useState } from 'react';
import { useT } from '../i18n';

/** Muestra de a `size` filas y agrega más al tocar "Ver más": la pantalla dibuja solo lo que se ve. */
export function usePaged<T>(list: T[], size = 30, resetKey?: unknown) {
  const [n, setN] = useState(size);
  useEffect(() => { setN(size); }, [resetKey, size]);
  return { visible: list.slice(0, n), hasMore: list.length > n, rest: Math.max(0, list.length - n), more: () => setN((x) => x + size) };
}

export function ShowMore({ rest, onClick }: { rest: number; onClick: () => void }) {
  const { t } = useT();
  if (rest <= 0) return null;
  return (
    <button type="button" onClick={onClick}
      className="w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-semibold text-slate-600 cursor-pointer hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900">
      {t('common.showMore', { n: rest })}
    </button>
  );
}
