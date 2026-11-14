'use client';
/** Indicador de carga: nunca una pantalla vacía sin señales */
export function Spinner() {
  return <span aria-label="…" className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-500" />;
}

/** Sin acceso a este panel: mensaje claro y botón para salir (en vez de pantalla en blanco) */
export function NoAccess({ text, button, onLogout }: { text: string; button: string; onLogout: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-6 text-center dark:bg-slate-950">
      <div>
        <p className="font-bold">{text}</p>
        <button type="button" onClick={onLogout} className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white cursor-pointer">{button}</button>
      </div>
    </div>
  );
}
