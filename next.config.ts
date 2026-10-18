import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Game covers come from IGDB's image CDN.
    remotePatterns: [new URL("https://images.igdb.com/igdb/image/upload/**")],
  },
};

export default nextConfig;
