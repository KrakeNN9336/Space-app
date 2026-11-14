import type { Lang } from "@field-shift/shared";
import en from "./en.json";
import uk from "./uk.json";

export type MessageKey = keyof typeof en;

const dictionaries: Record<Lang, Record<string, string>> = { en, uk };

/** Returns the text for `key` in `lang`, falling back to English, then to the key itself. */
export function translate(lang: Lang, key: MessageKey, vars: Record<string, string | number> = {}): string {
  const template = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}
