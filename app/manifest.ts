import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/today",
    name: "Teren — HVAC servis",
    short_name: "Teren",
    description: "Preuzete servisne posete dostupne i bez veze.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    lang: "sr-Latn",
    background_color: "#f4f6f3",
    theme_color: "#165d4c",
    icons: [
      { src: "/offline/v1/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/offline/v1/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
