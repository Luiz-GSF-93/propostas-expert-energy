import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination:
          "https://cuddly-parakeet-974r47g7v9r4h97xp-4000.app.github.dev/api/:path*",
      },
    ];
  },
};

export default nextConfig;
