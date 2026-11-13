import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { DeleteAccountDialog } from "@/components/delete-account-dialog";
import { SignInDialog } from "@/components/sign-in-dialog";
import { UploadDialog } from "@/components/upload-dialog";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TLDWatch: TL;DW for YouTube",
  description:
    "Paste a YouTube link. Read the summary, or listen to it, in about a minute.",
};

export const viewport: Viewport = {
  themeColor: "#0e1330",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${instrument.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <SignInDialog />
        <UploadDialog />
        <DeleteAccountDialog />
      </body>
    </html>
  );
}
