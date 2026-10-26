import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // keep it out of search engine indexes
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
