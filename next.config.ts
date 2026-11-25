import type { NextConfig } from "next";
import { configuredAppOrigin } from "./lib/app-origin";
import { resolve } from "node:path";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  const previewAlias: Record<string, string> =
    phase === PHASE_DEVELOPMENT_SERVER
      ? {}
      : {
          "@/features/visit-preview/visit-preview":
            "./features/visit-preview/unavailable.tsx",
        };
  return {
    output: "standalone",
    // Inline the public origin identically in prerendered and streamed metadata.
    env: { NEXT_PUBLIC_SITE_ORIGIN: configuredAppOrigin(process.env) },
    async headers() {
      return [
        {
          source: "/sw.js",
          headers: [
            { key: "Cache-Control", value: "no-store" },
            { key: "Service-Worker-Allowed", value: "/" },
            {
              key: "Content-Type",
              value: "application/javascript; charset=utf-8",
            },
            { key: "X-Content-Type-Options", value: "nosniff" },
          ],
        },
        {
          source: "/offline/:path*",
          headers: [
            { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "no-referrer" },
            {
              key: "Content-Security-Policy",
              value:
                "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
            },
          ],
        },
      ];
    },
    logging: {
      serverFunctions: false,
      incomingRequests: {
        ignore: [
          /\/auth\/(confirm|callback)/,
          /\/invite\//,
          /\/r\//,
          /\/(sign-in|sign-up)/,
        ],
      },
    },
    experimental: {
      agentFeedback: true,
    },
    cacheComponents: true,
    partialPrefetching: true,
    webpack(config, { dev }) {
      if (!dev) {
        config.resolve.alias = {
          ...config.resolve.alias,
          "@/features/visit-preview/visit-preview": resolve(
            "features/visit-preview/unavailable.tsx",
          ),
          [resolve("features/visit-preview/visit-preview.tsx")]: resolve(
            "features/visit-preview/unavailable.tsx",
          ),
        };
      }
      return config;
    },
    turbopack: {
      // Exclude the fixture and its client graph from production output.
      resolveAlias: previewAlias,
    },
  };
}
