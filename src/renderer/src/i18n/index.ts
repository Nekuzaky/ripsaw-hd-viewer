import type { Locale } from '@shared/settings';
import { en, type TranslationKey } from './en';
import { fr } from './fr';

const dictionaries: Record<Exclude<Locale, 'auto'>, Record<TranslationKey, string>> = { en, fr };

let active: Record<TranslationKey, string> = en;

export function setLocale(locale: Locale): void {
  const resolved =
    locale === 'auto' ? (navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en') : locale;
  active = dictionaries[resolved];
  document.documentElement.lang = resolved;
}

export function t(key: TranslationKey, params: Record<string, string | number> = {}): string {
  return active[key].replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? ''));
}

export type { TranslationKey };
