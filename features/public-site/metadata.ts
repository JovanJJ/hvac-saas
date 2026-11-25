import type { Metadata } from "next";

// Public origin is a build input for canonical/social metadata; recheck it at the release gate.
export function publicMetadata(title: string, description: string, path: "/" | "/demo"): Metadata {
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_ORIGIN!),
    title: { absolute: `${title} | teren.` },
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website", locale: "sr_RS", siteName: "teren.", title, description, url: path,
      images: [{ url: "/social/teren-preview.png", width: 1200, height: 630, alt: "teren. · Servisni nalog na telefonu. PDF izveštaj za klijenta." }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/social/teren-preview.png"] },
  };
}
