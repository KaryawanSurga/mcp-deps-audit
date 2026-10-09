import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Read exact dependency versions from package-lock.json (lockfile v2/v3
 * "packages" layout). Returns canonical npm names mapped to versions.
 */
export async function readLockVersions(root: string): Promise<Map<string, string>> {
  const versions = new Map<string, string>();
  let text: string;
  try {
    text = await readFile(path.join(root, "package-lock.json"), "utf8");
  } catch {
    return versions;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return versions;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return versions;
  }
  const packages = (parsed as Record<string, unknown>)["packages"];
  if (packages === null || typeof packages !== "object" || Array.isArray(packages)) {
    return versions;
  }
  for (const [key, value] of Object.entries(packages as Record<string, unknown>)) {
    if (key.length === 0 || value === null || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const index = key.lastIndexOf("node_modules/");
    if (index === -1) {
      continue;
    }
    const name = key.slice(index + "node_modules/".length);
    const version = (value as Record<string, unknown>)["version"];
    if (typeof version === "string" && !versions.has(name)) {
      versions.set(name.toLowerCase(), version);
    }
  }
  return versions;
}
