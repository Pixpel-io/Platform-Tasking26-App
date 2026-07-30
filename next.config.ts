import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Client-side page cache (Slack-style instant room switching): a chat you
    // visited in the last 30s re-opens instantly from cache while realtime
    // reconciles anything missed. Fully-prefetched pages (sidebar links use
    // prefetch={true}) stay warm for a long time - workspace switches should
    // feel instant even after a couple of minutes idle.
    staleTimes: {
      dynamic: 120,
      static: 600,
    },
  },
};

export default nextConfig;
