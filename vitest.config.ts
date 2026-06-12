import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// ADR: Vitest покрывает геометрическое ядро (core/**) — чистый TS без Babylon/Next.
// Алиас "@" → корень репозитория, как в tsconfig.

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["core/**/*.test.ts"],
    environment: "node",
  },
})
