import path from "node:path";
import { defineConfig } from "vitest/config";

// El proyecto usa el alias "@/*" -> "src/*" (ver tsconfig.json). Next.js lo
// resuelve solo al compilar la app; vitest corre sobre Vite y no lee
// tsconfig "paths" por sí solo, así que hace falta declararlo aquí para que
// los tests puedan importar directamente route handlers de src/app/api/**
// (que usan "@/lib/...") sin duplicar imports relativos.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
