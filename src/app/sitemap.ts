import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://taskinglife.io";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/landing-page`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/landing-page/privacy`, lastModified, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/landing-page/terms`, lastModified, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/download`, lastModified, changeFrequency: "monthly", priority: 0.5 },
  ];
}
