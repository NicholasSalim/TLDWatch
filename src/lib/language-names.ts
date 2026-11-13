/** A spoken language's name in English ("Korean") and in itself ("한국어"). */
export type LanguageNames = { english: string; native: string };

/**
 * Names a language with this runtime's own data. Plain module, so the server
 * can name it for a page it renders and pass the names down.
 */
export function namesOf(code: string): LanguageNames {
  return { english: languageName(code, "en"), native: languageName(code, code) };
}

function languageName(code: string, inLanguage: string): string {
  try {
    return new Intl.DisplayNames([inLanguage], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
