import { describe, expect, it } from "vitest";
import {
  canonicalName,
  parsePyprojectDependencies,
  parseRequirementsText,
  readManifests,
  type ManifestReport,
} from "../src/core/ecosystems.js";
import { cleanup, makeSampleApp, makeTempDir } from "./helpers/fixture.js";

function emptyReport(): ManifestReport {
  return { root: ".", ecosystems: [], deps: [], scripts: "", warnings: [] };
}

describe("readManifests", () => {
  it("parses npm and pip manifests together", async () => {
    const root = await makeSampleApp();
    try {
      const report = await readManifests(root);
      const byName = new Map(report.deps.map((dep) => [`${dep.ecosystem}:${dep.name}`, dep]));
      expect(byName.get("npm:used-lib")?.kind).toBe("prod");
      expect(byName.get("npm:used-lib")?.range).toBe("^1.2.0");
      expect(byName.get("npm:typescript")?.kind).toBe("dev");
      expect(byName.get("pypi:requests")?.range).toBe("==2.31.0");
      expect(byName.get("pypi:unused-py")?.range).toBe(">=1.0");
      expect(report.ecosystems).toEqual(["npm", "pypi"]);
      expect(report.scripts).toContain("vitest run");
    } finally {
      await cleanup(root);
    }
  });

  it("fails when no manifest exists", async () => {
    const root = await makeTempDir();
    try {
      await expect(readManifests(root)).rejects.toThrow("No package.json");
    } finally {
      await cleanup(root);
    }
  });
});

describe("parseRequirementsText", () => {
  it("handles versions, extras, comments, and skips options", () => {
    const report = emptyReport();
    parseRequirementsText(
      [
        "# deps",
        "requests[socks]==2.31.0",
        "flask>=3.0  # web",
        "-r other.txt",
        "-e ./local",
        "https://example.com/pkg.whl",
        "not valid !!!",
      ].join("\n"),
      "requirements.txt",
      report,
    );
    const names = report.deps.map((dep) => dep.name);
    expect(names).toEqual(["requests", "flask"]);
    expect(report.deps[0]?.range).toBe("==2.31.0");
    expect(report.deps[1]?.range).toBe(">=3.0");
    expect(report.warnings.some((warning) => warning.includes("skipped URL"))).toBe(true);
    expect(report.warnings.some((warning) => warning.includes("could not parse"))).toBe(true);
  });
});

describe("parsePyprojectDependencies", () => {
  it("extracts the [project] dependencies array", () => {
    const report = emptyReport();
    const parsed = parsePyprojectDependencies(
      [
        "[project]",
        'name = "demo"',
        "dependencies = [",
        '  "httpx>=0.27",',
        "  'rich',",
        "]",
      ].join("\n"),
      "pyproject.toml",
      report,
    );
    expect(parsed).toBe(true);
    expect(report.deps.map((dep) => dep.name)).toEqual(["httpx", "rich"]);
    expect(report.deps[0]?.range).toBe(">=0.27");
  });

  it("returns false without a [project] table", () => {
    const report = emptyReport();
    expect(parsePyprojectDependencies("[tool.poetry]\nname = 'x'", "pyproject.toml", report)).toBe(false);
  });
});

describe("canonicalName", () => {
  it("normalizes npm and PyPI names", () => {
    expect(canonicalName("npm", "React")).toBe("react");
    expect(canonicalName("pypi", "Python_DateUtil")).toBe("python-dateutil");
  });
});
