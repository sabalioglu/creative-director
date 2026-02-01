import type { NextConfig } from "next";

const nextConfig: any = {
  // output: 'export' removed to allow dynamic routes (SSR/Client-side) on Netlify
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
  turbopack: {
    root: "."
  }
};

export default nextConfig;
