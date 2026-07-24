import type { MetadataRoute } from "next";

// Web app manifest: lets users install Tasking as an app (Chrome/Edge
// "Install app"). Installed, OS notifications show the Tasking name and logo
// instead of the browser's branding.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tasking",
    short_name: "Tasking",
    description: "Team collaboration - chat, task boards and notifications.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f1a",
    theme_color: "#0b0f1a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
