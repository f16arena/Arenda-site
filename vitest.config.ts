import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// ADR: Vitest покрывает геометрическое ядро (core/**) и чистые сборщики документа
// (lib/builder/**) — чистый TS без Babylon/Next. Алиас "@" → корень, как в tsconfig.

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["core/**/*.test.ts", "lib/builder/**/*.test.ts"],
    environment: "node",
  },
})
