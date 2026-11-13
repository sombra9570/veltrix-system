'use client';
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    setThemeState(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  const setTheme = (t: Theme) => {
    document.documentElement.classList.toggle('dark', t === 'dark');
    try { localStorage.setItem('veltrix_theme', t); } catch {}
    setThemeState(t);
  };

  return { theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-label="Cambiar tema"
      className="h-9 w-9 grid place-items-center rounded-lg border border-slate-300 bg-white text-base hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500 transition cursor-pointer"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
