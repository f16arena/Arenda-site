import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
    // Server Actions с загрузкой файлов: скрин лендинга и внешний договор (PDF до 10 МБ).
    // Дефолт Next — 1 МБ. Ставим 12 МБ (10 МБ файл + overhead multipart), иначе крупный
    // PDF падал с «An unexpected response was received from the server».
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  // Security headers, применяются ко всем routes.
  // CSP — отдельная задача: требует whitelist для Next.js inline-скриптов и Sentry.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            // 2 года HSTS, включая поддомены, регистрация в preload-list.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Запрет встраивания в iframe — защита от clickjacking.
          { key: "X-Frame-Options", value: "DENY" },
          // Запрет MIME-sniffing.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Реферер: оставляем origin при кросс-сайт переходах.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Отключаем чувствительные API по умолчанию.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ]
  },
};

const sentryWrapped = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: !!process.env.SENTRY_AUTH_TOKEN,
});

export default withBundleAnalyzer(sentryWrapped);
