import type { MetadataRoute } from "next";
import { SITE_URL, LOCAL_PAGES } from "./lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/reserve`, changeFrequency: "daily", priority: 0.9 },
    ...LOCAL_PAGES.map((p) => ({
      url: `${SITE_URL}/${p.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
