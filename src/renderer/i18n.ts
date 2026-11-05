import { translate, translateMessage, type Language, type TextKey } from '../shared/i18n';

// Språket settes av App før hver tegning. Når det endres, tegnes hele appen på nytt.
let current: Language = 'en';
export function setLanguage(lang: Language): void { current = lang; document.documentElement.lang = lang; }
export function getLanguage(): Language { return current; }
export function t(key: TextKey, vars?: Record<string, string | number>): string { return translate(current, key, vars); }
/** Oversetter meldinger fra hovedprosessen. Annen tekst vises som den er. */
export function tm(text: string | undefined | null): string { return text ? translateMessage(current, text) : ''; }
