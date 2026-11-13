import type { MetadataRoute } from "next";

/**
 * Makes TLDWatch installable, and (on Android, once installed) a target in the
 * Share menu: sharing a YouTube video sends it to /share.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TLDWatch: TL;DW for YouTube",
    short_name: "TLDWatch",
    description: "Paste a YouTube link. Read the summary, or listen to it, in about a minute.",
    // A stable identity for the installed app, whatever start_url becomes.
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0e1330",
    theme_color: "#0e1330",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
