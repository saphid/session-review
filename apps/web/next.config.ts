import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

interface MinimalWebpackConfig {
  resolve?: {
    alias?: Record<string, string | string[]>;
    extensionAlias?: Record<string, string[]>;
  };
}

const config: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to the repo root rather than letting Next pick a
  // parent because of a sibling lockfile.
  outputFileTracingRoot: repoRoot,
  // The data layer in `src/` is shared with the CLI, which writes ESM
  // imports with `.js` extensions (e.g. `from "@core/db.js"`). Webpack
  // sees the literal `.js` and looks for a `.js` file that does not exist —
  // the source is `.ts`. Two settings fix this:
  //   1. `resolve.alias` mirrors the tsconfig `@core/*` path so the alias
  //      points at `src/`.
  //   2. `resolve.extensionAlias` tells webpack that `.js` imports may
  //      resolve to `.ts`/`.tsx` source files (NodeNext convention).
  webpack(webpackConfig: MinimalWebpackConfig) {
    webpackConfig.resolve = webpackConfig.resolve ?? {};
    webpackConfig.resolve.alias = {
      ...(webpackConfig.resolve.alias ?? {}),
      "@core": path.join(repoRoot, "src"),
    };
    webpackConfig.resolve.extensionAlias = {
      ...(webpackConfig.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return webpackConfig;
  },
};

export default config;
