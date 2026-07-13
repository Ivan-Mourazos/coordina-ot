import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Nativos de Node: fuera del bundle de Server Components (require normal).
  serverExternalPackages: ["better-sqlite3", "mssql"],
};

export default nextConfig;
