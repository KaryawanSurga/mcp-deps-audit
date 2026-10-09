import { describe, expect, it } from "vitest";
import { main, type CliIo } from "../src/cli.js";
import { cleanup, makeSampleApp, makeTempDir, writeFixtureFile } from "./helpers/fixture.js";

function makeIo(): { io: CliIo; out: () => string; err: () => string } {
  let out = "";
  let err = "";
  return {
    io: {
      stdout: (text) => {
        out += `${text}\n`;
      },
      stderr: (text) => {
        err += `${text}\n`;
      },
      color: false,
    },
    out: () => out,
    err: () => err,
  };
}

describe("cli", () => {
  it("prints help and version", async () => {
    const version = makeIo();
    expect(await main(["--version"], version.io)).toBe(0);
    expect(version.out()).toContain("0.1.0");

    const help = makeIo();
    expect(await main([], help.io)).toBe(0);
    expect(help.out()).toContain("Usage:");
    expect(help.out()).toContain("vulns");
  });

  it("lists declared dependencies as json", async () => {
    const root = await makeSampleApp();
    try {
      const { io, out } = makeIo();
      expect(await main(["list", root, "--json"], io)).toBe(0);
      const payload = JSON.parse(out()) as { deps: Array<{ name: string }>; ecosystems: string[] };
      expect(payload.deps.map((dep) => dep.name)).toContain("used-lib");
      expect(payload.ecosystems).toEqual(["npm", "pypi"]);
    } finally {
      await cleanup(root);
    }
  });

  it("reports unused and missing dependencies", async () => {
    const root = await makeSampleApp();
    try {
      const unused = makeIo();
      expect(await main(["unused", root, "--json"], unused.io)).toBe(0);
      const unusedPayload = JSON.parse(unused.out()) as { unused: Array<{ name: string }> };
      expect(unusedPayload.unused.map((dep) => dep.name)).toContain("unused-lib");

      const missing = makeIo();
      expect(await main(["missing", root, "--json"], missing.io)).toBe(0);
      const missingPayload = JSON.parse(missing.out()) as { missing: Array<{ package: string }> };
      expect(missingPayload.missing.map((dep) => dep.package)).toContain("missing-lib");
    } finally {
      await cleanup(root);
    }
  });

  it("handles empty dependency sets without network calls", async () => {
    const root = await makeTempDir();
    try {
      await writeFixtureFile(
        root,
        "package.json",
        JSON.stringify({ name: "empty-app", dependencies: {}, devDependencies: {} }),
      );
      const report = makeIo();
      expect(await main(["report", root], report.io)).toBe(0);
      expect(report.out()).toContain("0/0 resolved");

      const vulns = makeIo();
      expect(await main(["vulns", root], vulns.io)).toBe(0);
      expect(vulns.out()).toContain("No known vulnerabilities for 0");
    } finally {
      await cleanup(root);
    }
  });

  it("fails with actionable messages", async () => {
    const empty = await makeTempDir();
    try {
      const noManifest = makeIo();
      expect(await main(["list", empty], noManifest.io)).toBe(1);
      expect(noManifest.err()).toContain("No package.json");

      const unknown = makeIo();
      expect(await main(["bogus"], unknown.io)).toBe(2);
      expect(unknown.err()).toContain("Unknown command");

      const badLimit = makeIo();
      expect(await main(["report", empty, "--limit", "zero"], badLimit.io)).toBe(1);
      expect(badLimit.err()).toContain("--limit must be a positive integer");
    } finally {
      await cleanup(empty);
    }
  });
});
