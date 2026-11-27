'use client';
import { useEffect, useRef } from 'react';

/**
 * Botón "atrás" del teléfono para pantallas internas que no son páginas (menú → lista → cliente…).
 * `depth` = cuántos niveles hay abiertos (0 = pantalla principal). Mientras depth > 0 se mantiene una entrada
 * en el historial; al presionar atrás se llama a `goBack` (que sube un nivel) y se vuelve a armar si queda algún nivel.
 * En la pantalla principal (depth 0) atrás/salir funciona como siempre: sale de la página o de la app.
 */
export function useBackButton(depth: number, goBack: () => void) {
  const fn = useRef(goBack);
  fn.current = goBack;
  const has = useRef(false);

  useEffect(() => {
    const onPop = () => {
      if (!has.current) return;
      has.current = false;
      fn.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (depth > 0 && !has.current) {
      window.history.pushState(window.history.state, '');
      has.current = true;
    } else if (depth === 0 && has.current) {
      has.current = false; // la entrada se retira sin disparar goBack
      window.history.back();
    }
  }, [depth]);
}
