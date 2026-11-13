"use client";

import { useEffect, useRef, useState } from "react";
import { narrationScript } from "@/core/narration";
import type { Length, Summary, SummaryLanguage } from "@/core/summary";
import { fetchSummary } from "@/lib/summary-client";
import { useAutoplay } from "@/lib/autoplay";
import { namesOf, type LanguageNames } from "@/lib/language-names";
import { NarrationPlayer } from "@/components/narration-player";
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
  recordOpen = false,
}: {
  initial: Summary;
  initialLength?: Length;
  /** The original language was asked for but couldn't be made, so this is English. */
  translationFailed?: boolean;
  /** Pass from the server when it renders the card, so both sides name the language alike. */
  languageNames?: LanguageNames;
  /** Opened from a share link: tell the server, so it lands in a Member's History. */
  recordOpen?: boolean;
}) {
  const [length, setLength] = useState<Length>(initialLength);

  // Requests made from the homepage record themselves; a share link doesn't.
  useEffect(() => {
    if (!recordOpen) return;
    fetch("/api/history/opened", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId: initial.videoId, language: initial.language }),
    }).catch(() => {});
  }, [recordOpen, initial.videoId, initial.language]);
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

  // Narration reads exactly what's on screen. Autoplay happens once per Summary.
  const [autoplay] = useAutoplay();
  const [autoplayed, setAutoplayed] = useState(false);
  const spokenNames = languageNames ?? namesOf(shown.spokenLanguage);
  const narrationLanguage = shown.language === "original" ? shown.spokenLanguage : "en";

  return (
    <SummaryView
      summary={shown}
      length={length}
      onLengthChange={setLength}
      languageNames={languageNames}
      narration={
        <NarrationPlayer
          key={`${length}:${shown.language}`}
          videoId={shown.videoId}
          language={shown.language}
          length={length}
          chunks={narrationScript(shown.lengths[length])}
          languageCode={narrationLanguage}
          languageName={shown.language === "original" ? spokenNames.english : "English"}
          autoStart={autoplay && !autoplayed}
          onAutoStart={() => setAutoplayed(true)}
        />
      }
      languageControl={{
        value: language,
        onChange: changeLanguage,
        status: failed ? "failed" : loading === language ? "translating" : "idle",
      }}
    />
  );
}
