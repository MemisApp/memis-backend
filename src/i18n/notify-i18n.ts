import en from './notifications/en.json';
import ru from './notifications/ru.json';
import zh from './notifications/zh.json';
import de from './notifications/de.json';
import fr from './notifications/fr.json';
import es from './notifications/es.json';
import ja from './notifications/ja.json';
import ko from './notifications/ko.json';

export type NotifyLanguage =
  | 'en'
  | 'ru'
  | 'zh'
  | 'de'
  | 'fr'
  | 'es'
  | 'ja'
  | 'ko';

type Tree = { [key: string]: string | Tree };

const RESOURCES: Partial<Record<NotifyLanguage, Tree>> = {
  en: en as Tree,
  ru: ru as Tree,
  zh: zh as Tree,
  de: de as Tree,
  fr: fr as Tree,
  es: es as Tree,
  ja: ja as Tree,
  ko: ko as Tree,
};

const DEFAULT: NotifyLanguage = 'en';

function normalizeLanguage(value?: string | null): NotifyLanguage {
  const v = (value || '').toLowerCase();
  return (
    ['en', 'ru', 'zh', 'de', 'fr', 'es', 'ja', 'ko'] as const
  ).includes(v as NotifyLanguage)
    ? (v as NotifyLanguage)
    : DEFAULT;
}

function lookup(tree: Tree | undefined, path: string[]): string | undefined {
  let node: string | Tree | undefined = tree;
  for (const seg of path) {
    if (node == null || typeof node === 'string') return undefined;
    node = node[seg];
  }
  return typeof node === 'string' ? node : undefined;
}

export function tNotify(
  language: string | null | undefined,
  key: string,
  params?: Record<string, string | number>,
): string {
  const lang = normalizeLanguage(language);
  const path = key.split('.');
  const value =
    lookup(RESOURCES[lang], path) ?? lookup(RESOURCES[DEFAULT], path) ?? key;
  if (!params) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (_m, name) =>
    params[name] != null ? String(params[name]) : '',
  );
}
