import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const here = path.dirname(fileURLToPath(import.meta.url));
// `apps/web/next.config.ts` → `apps/web/` → repo root.
const repoRoot = path.resolve(here, "..", "..");

// Webpack types aren't a direct dep — describe just the config shape we
// touch. Next 15 hands us the underlying webpack 5 config at runtime.
type WebpackConfigLike = {
  resolve?: {
    alias?: Record<string, string | string[]>;
    extensionAlias?: Record<string, string[]>;
  };
};

const config: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to the actual repo root. Without this, Next.js
  // 15's lockfile-detection auto-picks an ancestor when running inside a
  // git worktree, which then surfaces a noisy warning at boot.
  outputFileTracingRoot: repoRoot,
  webpack(config: WebpackConfigLike) {
    // The `@core/*` and `@/*` aliases are declared in
    // `apps/web/tsconfig.json` but Next 15's webpack resolver does not
    // pick them up reliably when the project is invoked from outside its
    // own directory (which happens both in worktrees and via the root
    // `npm run dev` script). Mirror them here so module resolution is
    // identical regardless of CWD.
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@core": path.resolve(here, "..", "..", "src"),
      "@": here,
    };
    // The shared core modules use TS-style ESM imports (`@core/db.js`)
    // that resolve to the underlying `.ts` source. Webpack treats `.js`
    // and `.ts` as separate worlds by default, so map `.js` → `.ts`/`.tsx`
    // for resolution. Documented in
    // https://webpack.js.org/configuration/resolve/#resolveextensionalias
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default config;
