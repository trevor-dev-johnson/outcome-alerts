import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/:key([A-Za-z0-9-]{8,128})\\.txt",
        destination: "/indexnow-key/:key",
      },
    ];
  },
};

export default nextConfig;
