'use client';
import { useEffect } from 'react';
import { useLanguage, LangCode } from '../language-selector';
import es, { DictKey } from './es';
import en from './en';
import pt from './pt';
import it from './it';
import fr from './fr';
import de from './de';
import zh from './zh';
import ja from './ja';
import ru from './ru';
import ar from './ar';
import ko from './ko';
import hi from './hi';

// Cada idioma debe tener TODAS las claves del español; si falta una, TypeScript no deja publicar.
export type Dict = Record<DictKey, string>;

const DICTS: Record<LangCode, Dict> = { es, en, pt, it, fr, de, zh, ja, ru, ar, ko, hi };

export type TFunction = (key: DictKey, vars?: Record<string, string | number>) => string;

export function translate(lang: LangCode, key: DictKey, vars?: Record<string, string | number>): string {
  let text = (DICTS[lang] ?? es)[key] ?? es[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

export function useT() {
  const { lang } = useLanguage();
  const t: TFunction = (key, vars) => translate(lang, key, vars);
  return { t, lang };
}

/** Nombre del país en el idioma elegido (lo traduce el navegador). */
export function countryName(lang: LangCode, code: string, fallback: string): string {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Mantiene <html lang> y la dirección del texto (árabe = derecha a izquierda) al día. */
export function LangSync() {
  const { lang } = useLanguage();
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);
  return null;
}
