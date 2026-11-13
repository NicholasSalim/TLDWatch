"use client";

import { useRef, useState } from "react";
import type { Length, Summary, SummaryLanguage } from "@/core/summary";
import { fetchSummary } from "@/lib/summary-client";
import type { LanguageNames } from "@/lib/language-names";
import { SummaryView } from "@/components/summary-view";

/**
 * A Summary with its own Length and language switches. Both languages are
 * kept once loaded, so switching back is instant.
 */
export function SummaryCard({
  initial,
  initialLength = "medium",
  translationFailed = false,
  languageNames,
}: {
  initial: Summary;
  initialLength?: Length;
  /** The original language was asked for but couldn't be made, so this is English. */
  translationFailed?: boolean;
  /** Pass from the server when it renders the card, so both sides name the language alike. */
  languageNames?: LanguageNames;
}) {
  const [length, setLength] = useState<Length>(initialLength);
  const [language, setLanguage] = useState<SummaryLanguage>(
    translationFailed ? "original" : initial.language,
  );
  const [versions, setVersions] = useState<Partial<Record<SummaryLanguage, Summary>>>({
    [initial.language]: initial,
  });
  const [failed, setFailed] = useState(translationFailed);
  // Languages being fetched now, so a second click doesn't fetch again.
  const fetching = useRef(new Set<SummaryLanguage>());
  const [loading, setLoading] = useState<SummaryLanguage | null>(null);
  // The language chosen most recently, for answers that arrive late.
  const chosen = useRef(language);

  const changeLanguage = async (next: SummaryLanguage) => {
    chosen.current = next;
    setLanguage(next);
    setFailed(false);
    if (versions[next] || fetching.current.has(next)) return;

    fetching.current.add(next);
    setLoading(next);
    const result = await fetchSummary(`https://youtu.be/${initial.videoId}`, next);
    fetching.current.delete(next);
    setLoading((current) => (current === next ? null : current));

    if (result.status === "ready" && result.summary.language === next) {
      setVersions((v) => ({ ...v, [next]: result.summary }));
    } else if (result.status === "ready" && !result.translationFailed) {
      // An English video's "original" is its English Summary.
      setVersions((v) => ({ ...v, [next]: result.summary }));
    } else if (chosen.current === next) {
      // Only show the failure if they still want this language.
      setFailed(true);
    }
  };

  // Until the chosen language arrives, keep showing the one already here.
  const shown = versions[language] ?? versions.english ?? initial;

  return (
    <SummaryView
      summary={shown}
      length={length}
      onLengthChange={setLength}
      languageNames={languageNames}
      languageControl={{
        value: language,
        onChange: changeLanguage,
        status: failed ? "failed" : loading === language ? "translating" : "idle",
      }}
    />
  );
}
