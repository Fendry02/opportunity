import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // better-sqlite3 est un module natif : il ne doit jamais être bundlé.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
