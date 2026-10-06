import { fileURLToPath } from "node:url"
import { defineConfig } from "vite-plus"

export default defineConfig({
  run: {
    cache: {
      scripts: true,
    },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
    exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
  },
  pack: {
    entry: ["src/main.ts"],
    platform: "node",
    target: "es2023",
    format: "esm",
    outDir: "dist",
    sourcemap: true,
    dts: true,
    // OpenAPI's fromTypes loader requires declarations with a .d.ts extension.
    outExtensions: () => ({ js: ".mjs", dts: ".d.ts" }),
    clean: true,
    deps: {
      // tsdown <0.23 compatibility: resolve external dependency subpaths.
      // Remove to preserve subpath imports as written (the new default).
      // https://tsdown.dev/options/dependencies#deps-resolvedepsubpath
      resolveDepSubpath: true,
      onlyBundle: ["@sinclair/typebox", "undici-types"],
    },
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    printWidth: 120,
    tabWidth: 2,
    useTabs: false,
    semi: false,
    singleQuote: false,
    quoteProps: "as-needed",
    jsxSingleQuote: false,
    trailingComma: "es5",
    bracketSpacing: true,
    bracketSameLine: false,
    arrowParens: "always",
    endOfLine: "lf",
    experimentalSortPackageJson: true,
    experimentalSortImports: {
      order: "asc",
      ignoreCase: true,
      newlinesBetween: true,
      sortSideEffects: true,
      customGroups: [
        {
          groupName: "types",
          elementNamePattern: ["@/types/"],
        },
        {
          groupName: "libs",
          elementNamePattern: ["@/libs/"],
        },
        {
          groupName: "models",
          elementNamePattern: ["@/models/"],
        },
        {
          groupName: "plugins",
          elementNamePattern: ["@/plugins/"],
        },
        {
          groupName: "modules",
          elementNamePattern: ["@/modules/"],
        },
        {
          groupName: "utils",
          elementNamePattern: ["@/utils/"],
        },
      ],
      groups: [
        "type-import",
        ["value-builtin", "value-external"],
        "type-internal",
        "value-internal",
        ["type-parent", "type-sibling", "type-index"],
        ["value-parent", "value-sibling", "value-index"],
        ["types", "libs", "models", "plugins"],
        ["modules", "utils"],
        ["parent", "sibling", "index"],
        "unknown",
      ],
    },
  },
})
