import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://taskinglife.io";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/landing-page", "/landing-page/privacy", "/landing-page/terms", "/download"],
      disallow: ["/api/", "/admin", "/dm", "/invite/", "/onboarding", "/qr", "/w/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
