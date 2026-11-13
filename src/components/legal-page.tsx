import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

/** The shared frame of the Terms and Privacy pages: readable prose, links to each other. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="backdrop relative isolate flex min-h-dvh flex-col overflow-hidden">
      <header className="mx-auto flex w-full max-w-5xl items-center px-5 pt-6 sm:px-8">
        <Wordmark />
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-10 pb-24 sm:px-8">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-mist">{title}</h1>
        <p className="mt-2 text-sm text-haze">Last updated {updated}</p>
        <div className="mt-8 space-y-4 text-pretty text-[15px] leading-relaxed text-mist/90 [&_a]:text-lumen [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-10 [&_h2]:font-heading [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-mist [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
          {children}
        </div>
        <p className="mt-12 text-sm text-haze">
          <Link href="/" className="underline underline-offset-2 hover:text-mist">
            TLDWatch
          </Link>
          {" · "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-mist">
            Terms
          </Link>
          {" · "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-mist">
            Privacy
          </Link>
        </p>
      </main>
    </div>
  );
}

/** How to reach the operator, if CONTACT_EMAIL is set. */
export function Contact() {
  const email = process.env.CONTACT_EMAIL;
  return email ? (
    <p>
      Questions or requests: <a href={`mailto:${email}`}>{email}</a>.
    </p>
  ) : null;
}
