import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Ecosystem } from "./ecosystems.js";
import { isBuiltin } from "./stdlib.js";

export const DEFAULT_IGNORES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".venv",
  "venv",
  "__pycache__",
  ".cache",
  ".turbo",
  "vendor",
  "target",
]);

export const MAX_READ_BYTES = 1_000_000;

export interface BareImport {
  specifier: string;
  package: string;
  ecosystem: Ecosystem;
  file: string;
  line: number;
}

export interface CollectImportsResult {
  imports: BareImport[];
  filesScanned: number;
}

const JS_RULES = [
  /^\s*import\s[^;]*?\sfrom\s+["']([^"']+)["']/,
  /^\s*import\s+["']([^"']+)["']/,
  /^\s*export\s[^;]*?\sfrom\s+["']([^"']+)["']/,
  /\bimport\(\s*["']([^"']+)["']\s*\)/,
  /\brequire\(\s*["']([^"']+)["']\s*\)/,
];

const PY_RULES: Array<{ regex: RegExp; top: boolean }> = [
  { regex: /^\s*from\s+([.A-Za-z_][\w.]*)\s+import\b/, top: true },
  { regex: /^\s*import\s+([A-Za-z_][\w.]*)/, top: true },
];

function packageFromSpecifier(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.length === 0) {
    return null;
  }
  if (specifier.startsWith("node:")) {
    return null;
  }
  if (specifier.startsWith("@")) {
    const segments = specifier.split("/");
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : specifier;
  }
  return specifier.split("/")[0] ?? specifier;
}

export function extractBareImports(
  text: string,
  file: string,
  ecosystem: Ecosystem,
): Array<{ specifier: string; package: string; file: string; line: number; ecosystem: Ecosystem }> {
  const hits: Array<{ specifier: string; package: string; file: string; line: number; ecosystem: Ecosystem }> = [];
  const lines = text.split(/\r\n|\r|\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (line.length > 500) {
      continue;
    }
    if (ecosystem === "npm") {
      for (const rule of JS_RULES) {
        const match = rule.exec(line);
        if (match !== null && match[1] !== undefined) {
          const packageName = packageFromSpecifier(match[1]);
          if (packageName !== null && !isBuiltin(match[1], "npm")) {
            hits.push({ specifier: match[1], package: packageName, file, line: index + 1, ecosystem });
          }
          break;
        }
      }
    } else {
      for (const rule of PY_RULES) {
        const match = rule.regex.exec(line);
        if (match !== null && match[1] !== undefined) {
          const specifier = match[1];
          if (specifier.startsWith(".")) {
            break;
          }
          const topLevel = specifier.split(".")[0] ?? specifier;
          if (!isBuiltin(topLevel, "pypi")) {
            hits.push({ specifier, package: topLevel, file, line: index + 1, ecosystem });
          }
          break;
        }
      }
    }
  }
  return hits;
}

async function walkSourceFiles(root: string, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (DEFAULT_IGNORES.has(entry.name) || entry.isSymbolicLink()) {
      continue;
    }
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walkSourceFiles(full, out);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (/\.(?:[cm]?[jt]sx?|py)$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

async function readBounded(file: string): Promise<string | null> {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size > MAX_READ_BYTES) {
      return null;
    }
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

export async function collectBareImports(root: string, ecosystems: Ecosystem[]): Promise<CollectImportsResult> {
  const files = await walkSourceFiles(root);
  const imports: BareImport[] = [];
  let filesScanned = 0;
  for (const file of files) {
    const isPython = file.endsWith(".py");
    const ecosystem: Ecosystem = isPython ? "pypi" : "npm";
    if (!ecosystems.includes(ecosystem)) {
      continue;
    }
    const text = await readBounded(file);
    if (text === null) {
      continue;
    }
    filesScanned += 1;
    const relative = path.relative(root, file).split(path.sep).join("/");
    for (const hit of extractBareImports(text, relative, ecosystem)) {
      imports.push({ ...hit, ecosystem });
    }
  }
  return { imports, filesScanned };
}
