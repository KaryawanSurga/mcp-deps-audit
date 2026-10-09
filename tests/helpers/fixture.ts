import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FetchLike } from "../../src/core/registry.js";

export async function makeTempDir(prefix = "deps-audit-"): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

export async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export async function writeFixtureFile(root: string, relative: string, content: string): Promise<void> {
  const full = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

export async function makeSampleApp(): Promise<string> {
  const root = await makeTempDir();
  await writeFixtureFile(
    root,
    "package.json",
    JSON.stringify(
      {
        name: "fixture-app",
        version: "1.0.0",
        dependencies: { "used-lib": "^1.2.0", "unused-lib": "^0.9.0" },
        devDependencies: { typescript: "^5.0.0", vitest: "^5.0.0" },
        scripts: { build: "tsc", test: "vitest run" },
      },
      null,
      2,
    ),
  );
  await writeFixtureFile(
    root,
    "package-lock.json",
    JSON.stringify(
      {
        name: "fixture-app",
        lockfileVersion: 3,
        packages: {
          "": { name: "fixture-app" },
          "node_modules/used-lib": { version: "1.2.3" },
          "node_modules/unused-lib": { version: "0.9.1" },
        },
      },
      null,
      2,
    ),
  );
  await writeFixtureFile(
    root,
    "src/app.ts",
    `import { used } from "used-lib";
import missing from "missing-lib";
import path from "node:path";
import { local } from "./local.js";

export const value = used + missing + path.sep + local;
`,
  );
  await writeFixtureFile(root, "src/local.ts", "export const local = 1;\n");
  await writeFixtureFile(
    root,
    "requirements.txt",
    `requests==2.31.0
unused-py>=1.0  # trailing comment
-r other.txt
# a comment
`,
  );
  await writeFixtureFile(
    root,
    "app.py",
    `import requests
from flask import Flask

print(Flask, requests)
`,
  );
  await writeFixtureFile(root, "node_modules/ignored.js", "require('whatever');\n");
  await writeFixtureFile(root, "dist/ignored.js", "require('whatever');\n");
  return root;
}

export interface StubRoute {
  status?: number;
  body?: unknown;
}

export function stubFetch(routes: Record<string, StubRoute>): { fetchImpl: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    calls.push(url);
    const route = routes[url];
    if (route === undefined) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    const status = route.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => route.body ?? {} };
  };
  return { fetchImpl, calls };
}
