'use client';
import { useEffect, useRef } from 'react';
import { supabase, rpc } from '../../lib/supabase';
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
  const { lang, setLanguage } = useLanguage();
  const current = useRef(lang);
  const synced = useRef<string | null>(null); // idioma guardado en la cuenta (null = sin sesión)

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  // Al entrar: se aplica el idioma de la cuenta (o el de su sucursal) en cualquier dispositivo
  useEffect(() => {
    const pull = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { synced.current = null; return; }
      try {
        const l = await rpc<string | null>('my_lang');
        if (l && l in DICTS) {
          synced.current = l;
          if (l !== current.current) setLanguage(l as LangCode);
        } else synced.current = current.current;
      } catch { synced.current = current.current; }
    };
    pull();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') pull();
      if (event === 'SIGNED_OUT') synced.current = null;
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si la persona cambia de idioma, queda guardado en su cuenta
  useEffect(() => {
    current.current = lang;
    if (synced.current && synced.current !== lang) {
      synced.current = lang;
      rpc('set_my_lang', { p_lang: lang }).catch(() => {});
    }
  }, [lang]);
  return null;
}
