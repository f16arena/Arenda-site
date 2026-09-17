import { build } from "esbuild"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
const root = resolve(".")
const stub = (p) => resolve(root, "scripts/builder-harness/stubs", p)
await build({
  entryPoints: ["scripts/builder-harness/entry.tsx"], bundle: true, outfile: ".tmp-harness/out/app.js", format: "esm", splitting: false,
  jsx: "automatic", sourcemap: false, minify: false, target: "es2022", logLevel: "warning",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{
    name: "stubs",
    setup(b) {
      b.onResolve({ filter: /^@\/app\/actions\// }, () => ({ path: stub("actions.ts") }))
      b.onResolve({ filter: /^next\/dynamic$/ }, () => ({ path: stub("dynamic.tsx") }))
      b.onResolve({ filter: /^@\// }, (a) => {
        const base = resolve(root, a.path.slice(2))
        for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
          try { readFileSync(base + ext); return { path: base + ext } } catch {}
        }
        return undefined
      })
    },
  }],
})
const css = await postcss([tailwind({ base: root })]).process(
  `@import "tailwindcss" source(none);\n@source "../components/builder";\n@source "../scripts/builder-harness/entry.tsx";\nhtml,body,#root{height:100%;margin:0}`,
  { from: resolve(root, ".tmp-harness/in.css") },
)
writeFileSync(".tmp-harness/out/app.css", css.css)
writeFileSync(".tmp-harness/out/index.html", `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="app.css"><div id="root" style="position:fixed;inset:0"></div><script type="module" src="app.js"></script>`)
import("node:fs").then((fs) => fs.copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", ".tmp-harness/out/pdf.worker.min.mjs"))
console.log("built")
