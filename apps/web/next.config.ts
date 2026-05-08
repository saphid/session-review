import path from "node:path";
import type { NextConfig } from "next";

// Pin Next's workspace root to this worktree so multi-lockfile setups
// (we sit beneath `~/Personal/Projects/session-review/`) don't confuse
// the file-tracer and compiler.
const tracingRoot = path.resolve(__dirname, "..", "..");
const coreSrc = path.resolve(__dirname, "..", "..", "src");

const config: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: tracingRoot,
  // Webpack does not resolve TypeScript path aliases when the alias
  // value contains a `.js` extension that maps to a `.ts` source file
  // (`src/db.ts` exposed as `@core/db.js`). Wire the alias explicitly
  // so server components and route handlers can reach `@core/db.js`
  // even though the on-disk file is `db.ts`. See `tsconfig.json`
  // `paths` and `apps/web/tsconfig.json` `paths`.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@core": coreSrc,
    };
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default config;
