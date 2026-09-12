import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root — otherwise a stray package-lock.json in the home
  // directory makes Next mis-infer it and break file tracing on Vercel.
  outputFileTracingRoot: path.join(__dirname),
  // Make sure the skill file ships with the serverless bundle on Vercel.
  outputFileTracingIncludes: {
    "/api/chat": ["./skills/**/*"],
    "/api/skill": ["./skills/**/*"],
  },
};

export default nextConfig;

