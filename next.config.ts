import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Client-side page cache (Slack-style instant room switching): a chat you
    // visited in the last 30s re-opens instantly from cache while realtime
    // reconciles anything missed. Fully-prefetched pages (sidebar links use
    // prefetch={true}) stay warm for 3 minutes.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
