import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Единый дизайн (аудит 20.09.2026): браузерные confirm/prompt/alert — серые
  // и не в теме сайта. Вместо них askConfirm/askText (components/ui/dialog-host)
  // и toast из sonner.
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    ignores: ["components/ui/dialog-host.tsx"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "confirm", message: "Используйте askConfirm() из components/ui/dialog-host." },
        { name: "prompt", message: "Используйте askText() из components/ui/dialog-host." },
        { name: "alert", message: "Используйте toast из sonner." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "window", property: "confirm", message: "Используйте askConfirm() из components/ui/dialog-host." },
        { object: "window", property: "prompt", message: "Используйте askText() из components/ui/dialog-host." },
        { object: "window", property: "alert", message: "Используйте toast из sonner." },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "playwright-report/**",
    "test-results/**",
    "tests/e2e/**",
    "mobile/**",
    "next-env.d.ts",
    // Вендорные и сгенерированные файлы: чужой минифицированный код и
    // сборки стенда правилам проекта не подчиняются.
    "public/pdf.worker.min.mjs",
    "app/generated/**",
    ".tmp-harness/**",
  ]),
]);

export default eslintConfig;
