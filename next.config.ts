import type { NextConfig } from "next";
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
    turbopack: {
      // Exclude the fixture and its client graph from production output.
      resolveAlias: previewAlias,
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
  };
}
