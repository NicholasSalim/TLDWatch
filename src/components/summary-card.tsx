"use client";

import { useEffect, useRef, useState } from "react";
import { narrationScript } from "@/core/narration";
import {
  baseLanguage,
  textLanguageOf,
  type Length,
  type Summary,
  type SummaryLanguage,
} from "@/core/summary";
import { fetchSummary } from "@/lib/summary-client";
import { useAutoplay } from "@/lib/autoplay";
import { namesOf, type LanguageNames } from "@/lib/language-names";
import { useMe } from "@/lib/me";
import { NarrationPlayer } from "@/components/narration-player";
import { SummaryView, type LanguageProblem } from "@/components/summary-view";

// The other languages on offer, fetched once per page and shared by every card.
let languagesRequest: Promise<string[]> | null = null;
function loadSummaryLanguages(): Promise<string[]> {
  languagesRequest ??= fetch("/api/summary-languages")
    .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
    .catch(() => []);
  return languagesRequest;
}

/**
 * A Summary with its own Length and language switches. Every language is
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
  /** Another language was asked for but couldn't be made, so this is English. */
  translationFailed?: boolean;
  /** Pass from the server when it renders the card, so both sides name the language alike. */
  languageNames?: LanguageNames;
  /** Opened from a share link: tell the server, so it lands in a Member's History. */
  recordOpen?: boolean;
}) {
  const [length, setLength] = useState<Length>(initialLength);
  const me = useMe();
  const [configured, setConfigured] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadSummaryLanguages().then((codes) => !cancelled && setConfigured(codes));
    return () => {
      cancelled = true;
    };
  }, []);

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
  // Why the language chosen isn't showing: null when it is.
  const [problem, setProblem] = useState<LanguageProblem | null>(
    translationFailed ? "failed" : null,
  );
  // Languages being fetched now, so a second click doesn't fetch again.
  const fetching = useRef(new Set<SummaryLanguage>());
  const [loading, setLoading] = useState<SummaryLanguage | null>(null);
  // The language chosen most recently, for answers that arrive late.
  const chosen = useRef(language);

  const changeLanguage = async (next: SummaryLanguage) => {
    chosen.current = next;
    setLanguage(next);
    setProblem(null);
    if (versions[next] || fetching.current.has(next)) return;

    fetching.current.add(next);
    setLoading(next);
    const result = await fetchSummary(`https://youtu.be/${initial.videoId}`, next);
    fetching.current.delete(next);
    setLoading((current) => (current === next ? null : current));

    if (result.status === "ready" && !result.translationFailed) {
      // Usually the language asked for; an English video's "original" is its English Summary.
      setVersions((v) => ({ ...v, [next]: result.summary }));
      return;
    }
    if (result.status === "ready") {
      // Translation failed: what came back is the English Summary.
      setVersions((v) => ({ ...v, english: result.summary }));
    }
    // Only explain if they still want this language.
    if (chosen.current === next) {
      setProblem(
        result.status === "rejected" && result.reason === "language-members-only"
          ? "members-only"
          : result.status === "rejected" && result.reason === "language-not-offered"
            ? "not-offered"
            : "failed",
      );
    }
  };

  // Until the chosen language arrives, keep showing the one already here; if it
  // can't be had, show English, as the note says.
  const shown = problem
    ? (versions.english ?? initial)
    : (versions[language] ?? versions.english ?? initial);

  // Narration reads exactly what's on screen. Autoplay happens once per Summary.
  const [autoplay] = useAutoplay();
  const [autoplayed, setAutoplayed] = useState(false);
  const spokenNames = languageNames ?? namesOf(shown.spokenLanguage);
  const narrationLanguage = textLanguageOf(shown);
  const nameOf = (lang: SummaryLanguage) =>
    lang === "original" ? spokenNames.english : lang === "english" ? "English" : namesOf(lang).english;

  // The video's own language is already the "original" choice, so it isn't listed again.
  const others = configured
    .filter((code) => code !== baseLanguage(initial.spokenLanguage))
    .map((code) => {
      const names = namesOf(code);
      return { code, label: names.native === names.english ? names.english : `${names.native} (${names.english})` };
    });

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
          languageName={nameOf(shown.language)}
          autoStart={autoplay && !autoplayed}
          onAutoStart={() => setAutoplayed(true)}
        />
      }
      languageControl={{
        value: language,
        onChange: changeLanguage,
        status: loading === language && !problem ? "translating" : "idle",
        problem,
        others,
        // Unknown until it's known who's signed in: neither offered nor "Members only" yet.
        othersAccess: me === null ? "unknown" : me.member ? "members" : "guests",
        languageName: nameOf(language),
      }}
    />
  );
}
