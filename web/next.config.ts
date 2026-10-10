import type { NextConfig } from "next";

const API_URL = process.env.SENTINEL_API_URL ?? "http://127.0.0.1:8765";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // The /api proxy defaults to a 30 s timeout. Local models can take minutes to load and
    // answer (connection test, arena battles), so allow as long as the backend does.
    proxyTimeout: 15 * 60_000,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The browser talks to /api/*; Next proxies it to the FastAPI backend.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
