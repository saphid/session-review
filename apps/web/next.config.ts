import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Worktree root — used to pin Next's lockfile inference and to teach webpack
// how to resolve the `@core/*` path alias. Without these, running this app
// from a `.claude/worktrees/...` checkout makes Next drift up to a sibling
// repo (the outer `package-lock.json`) and `@core/db.js` etc. fail to resolve
// at runtime even though the TypeScript layer is happy.
const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(here, "../..");
const coreDir = path.resolve(here, "../../src");

interface WebpackResolveLike {
  alias?: Record<string, string>;
  extensionAlias?: Record<string, readonly string[]>;
}

interface WebpackConfigLike {
  resolve?: WebpackResolveLike;
}

const config: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: workspaceRoot,
  webpack: (cfg: WebpackConfigLike) => {
    const resolve: WebpackResolveLike = cfg.resolve ?? {};
    resolve.alias = { ...(resolve.alias ?? {}), "@core": coreDir };
    // The @core/* imports use `.js` suffixes for ESM correctness on the CLI
    // side, but the actual files are TypeScript. Tell webpack to try `.ts` /
    // `.tsx` when resolving a `.js` request.
    resolve.extensionAlias = {
      ...(resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    cfg.resolve = resolve;
    return cfg;
  },
};

export default config;
