import { describe, expect, it } from "vitest";
import { missingDeps, unusedDeps } from "../src/core/audit.js";
import { cleanup, makeSampleApp } from "./helpers/fixture.js";

describe("unusedDeps", () => {
  it("finds declared but never imported packages", async () => {
    const root = await makeSampleApp();
    try {
      const result = await unusedDeps(root);
      const names = result.unused.map((dep) => `${dep.ecosystem}:${dep.name}`);
      expect(names).toContain("npm:unused-lib");
      expect(names).toContain("pypi:unused-py");
      expect(names).not.toContain("npm:used-lib");
      expect(names).not.toContain("npm:typescript");
      expect(names).not.toContain("npm:vitest");
      expect(names).not.toContain("pypi:requests");
      expect(result.checked).toBeGreaterThan(3);
    } finally {
      await cleanup(root);
    }
  });

  it("can include tooling when asked", async () => {
    const root = await makeSampleApp();
    try {
      const strict = await unusedDeps(root, { tooling: false });
      const names = strict.unused.map((dep) => dep.name);
      expect(names).toContain("typescript");
    } finally {
      await cleanup(root);
    }
  });
});

describe("missingDeps", () => {
  it("finds imported packages that are not declared", async () => {
    const root = await makeSampleApp();
    try {
      const result = await missingDeps(root);
      const byKey = new Map(result.missing.map((dep) => [`${dep.ecosystem}:${dep.package}`, dep]));
      expect(byKey.has("npm:missing-lib")).toBe(true);
      expect(byKey.has("pypi:flask")).toBe(true);
      expect(byKey.get("npm:missing-lib")?.importers).toEqual(["src/app.ts"]);
      expect(byKey.has("npm:used-lib")).toBe(false);
      expect(byKey.has("pypi:requests")).toBe(false);
      expect(byKey.has("pypi:os")).toBe(false);
    } finally {
      await cleanup(root);
    }
  });
});
