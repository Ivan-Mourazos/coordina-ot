import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".claude/**",
    // Lo copia scripts/copiar-worker.mjs desde pdfjs-dist en cada dev/build:
    // es código de pdf.js, no nuestro, y lintarlo solo da ruido.
    "public/pdf.worker.mjs",
  ]),
]);

export default eslintConfig;
