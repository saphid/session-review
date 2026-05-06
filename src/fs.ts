import { readdir } from "node:fs/promises";
import path from "node:path";

export async function* walkFiles(root: string, suffixes: readonly string[]): AsyncIterable<string> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name)) continue;
      yield* walkFiles(fullPath, suffixes);
    } else if (entry.isFile() && suffixes.includes(path.extname(entry.name).toLowerCase())) {
      yield fullPath;
    }
  }
}

function shouldSkipDirectory(name: string): boolean {
  return ["node_modules", ".git", "target", "dist", "build", "checkpoints"].includes(name);
}

export function homePath(...parts: string[]): string {
  const home = process.env.HOME;
  if (!home) throw new Error("HOME is not set");
  return path.join(home, ...parts);
}
