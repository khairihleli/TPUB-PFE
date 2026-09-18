import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  devIndicators: false,
  images: {
    // Local files from /public only: no remote hosts are allowed.
    remotePatterns: [],
    // Cloudflare Workers has no Next.js image optimizer (no sharp): serve the /public files as they are.
    unoptimized: process.env.ZELQANE_TARGET === "cloudflare",
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
