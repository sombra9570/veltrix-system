'use client';
import type { ReactNode } from 'react';

/** Panel desplegable de una campana de avisos.
 *  En pantallas angostas ocupa todo el ancho bajo la barra superior (nunca se corta ni queda tapado);
 *  desde `sm` se ancla a la campana. Un toque fuera lo cierra. */
export function BellPanel({ open, onClose, children, className = '' }: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  if (!open) return null;
  return (
    <>
      <button type="button" aria-hidden tabIndex={-1} onClick={onClose} className="fixed inset-0 z-40 cursor-default bg-transparent" />
      <div role="dialog"
        className={`fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4.25rem)] z-50 max-h-[calc(100dvh-env(safe-area-inset-top)-5.5rem)] overflow-y-auto overscroll-contain break-words rounded-2xl border p-3 shadow-2xl sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-[22rem] ${className}`}>
        {children}
      </div>
    </>
  );
}
