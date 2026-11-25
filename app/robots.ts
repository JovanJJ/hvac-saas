import type { MetadataRoute } from "next";

// Explicit public allowlist. This is crawler guidance; authorization stays in the DAL/handlers.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/", allow: ["/$", "/demo$", "/demo?", "/primeri/", "/social/", "/_next/static/", "/favicon.ico"] } };
}
