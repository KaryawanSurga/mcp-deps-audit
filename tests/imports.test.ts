import { describe, expect, it } from "vitest";
import { collectBareImports, extractBareImports } from "../src/core/imports.js";
import { importCandidates, isBuiltin, isTooling } from "../src/core/stdlib.js";
import { cleanup, makeSampleApp } from "./helpers/fixture.js";

describe("extractBareImports", () => {
  it("captures npm imports and skips relative and builtin specifiers", () => {
    const text = [
      'import { used } from "used-lib";',
      'import "@scope/pkg/sub/path";',
      'import path from "node:path";',
      'import fs from "fs";',
      'import { local } from "./local.js";',
      'const lazy = await import("lazy-lib");',
      'const req = require("required-lib");',
    ].join("\n");
    const hits = extractBareImports(text, "src/app.ts", "npm");
    const packages = hits.map((hit) => hit.package);
    expect(packages).toEqual(["used-lib", "@scope/pkg", "lazy-lib", "required-lib"]);
    expect(hits.every((hit) => hit.ecosystem === "npm")).toBe(true);
  });

  it("captures python imports and skips relative and stdlib modules", () => {
    const text = [
      "import requests",
      "import os",
      "from flask import Flask",
      "from . import local",
      "from .core import run",
      "from collections import OrderedDict",
    ].join("\n");
    const hits = extractBareImports(text, "app.py", "pypi");
    expect(hits.map((hit) => hit.package)).toEqual(["requests", "flask"]);
  });
});

describe("collectBareImports", () => {
  it("scans the sample app and ignores build directories", async () => {
    const root = await makeSampleApp();
    try {
      const result = await collectBareImports(root, ["npm", "pypi"]);
      const packages = result.imports.map((hit) => hit.package);
      expect(packages).toContain("used-lib");
      expect(packages).toContain("missing-lib");
      expect(packages).toContain("requests");
      expect(packages).toContain("flask");
      expect(packages).not.toContain("whatever");
      expect(result.filesScanned).toBeGreaterThan(1);
    } finally {
      await cleanup(root);
    }
  });
});

describe("stdlib and tooling helpers", () => {
  it("knows builtins", () => {
    expect(isBuiltin("node:fs", "npm")).toBe(true);
    expect(isBuiltin("fs", "npm")).toBe(true);
    expect(isBuiltin("zod", "npm")).toBe(false);
    expect(isBuiltin("os", "pypi")).toBe(true);
    expect(isBuiltin("flask", "pypi")).toBe(false);
  });

  it("knows tooling packages", () => {
    expect(isTooling("typescript", "npm")).toBe(true);
    expect(isTooling("@types/node", "npm")).toBe(true);
    expect(isTooling("pytest", "pypi")).toBe(true);
    expect(isTooling("react", "npm")).toBe(false);
  });

  it("resolves import aliases", () => {
    const candidates = importCandidates("pyyaml", "pypi");
    expect(candidates).toContain("yaml");
    expect(candidates).toContain("pyyaml");
    expect(importCandidates("lodash", "npm")).toEqual(["lodash"]);
  });
});
