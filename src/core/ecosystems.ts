import { readFile } from "node:fs/promises";
import path from "node:path";

export type Ecosystem = "npm" | "pypi";
export type DepKind = "prod" | "dev" | "optional" | "peer";

export interface DeclaredDep {
  name: string;
  range: string;
  ecosystem: Ecosystem;
  kind: DepKind;
}

export interface ManifestReport {
  root: string;
  ecosystems: Ecosystem[];
  deps: DeclaredDep[];
  scripts: string;
  warnings: string[];
}

export function canonicalName(ecosystem: Ecosystem, name: string): string {
  if (ecosystem === "npm") {
    return name.trim().toLowerCase();
  }
  return name.trim().toLowerCase().replace(/_/g, "-");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readNpmDeps(root: string, pkg: Record<string, unknown>, report: ManifestReport): void {
  const sections: Array<[string, DepKind]> = [
    ["dependencies", "prod"],
    ["devDependencies", "dev"],
    ["optionalDependencies", "optional"],
    ["peerDependencies", "peer"],
  ];
  for (const [field, kind] of sections) {
    const section = pkg[field];
    if (!isRecord(section)) {
      continue;
    }
    for (const [name, range] of Object.entries(section)) {
      if (typeof range === "string") {
        report.deps.push({ name: canonicalName("npm", name), range, ecosystem: "npm", kind });
      }
    }
  }
  const scripts = pkg["scripts"];
  if (isRecord(scripts)) {
    report.scripts = Object.values(scripts)
      .filter((value): value is string => typeof value === "string")
      .join("\n");
  }
  report.ecosystems.push("npm");
}

const REQUIREMENT_OPTIONS = ["-r", "--requirement", "-c", "--constraint", "-e", "--editable", "-i", "--index-url", "--extra-index-url", "--find-links", "--hash", "--no-"];
const REQUIREMENT_RE = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(.*)$/;

export function parseRequirementsText(text: string, source: string, report: ManifestReport): void {
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    if (REQUIREMENT_OPTIONS.some((option) => line.startsWith(option))) {
      continue;
    }
    if (line.includes("://") || line.startsWith(".") || line.startsWith("/")) {
      report.warnings.push(`${source}: skipped URL or path requirement "${line}"`);
      continue;
    }
    const withoutComment = (line.split("#")[0] ?? "").trim();
    const match = REQUIREMENT_RE.exec(withoutComment);
    if (match === null || match[1] === undefined) {
      report.warnings.push(`${source}: could not parse "${line}"`);
      continue;
    }
    const range = (match[2] ?? "").trim();
    if (range.length > 0 && !/^[<>=!~^]/.test(range)) {
      report.warnings.push(`${source}: could not parse "${line}"`);
      continue;
    }
    report.deps.push({
      name: canonicalName("pypi", match[1]),
      range,
      ecosystem: "pypi",
      kind: "prod",
    });
  }
}

/** Extract the string entries of `[project] dependencies = [ ... ]` from pyproject.toml. */
export function parsePyprojectDependencies(text: string, source: string, report: ManifestReport): boolean {
  const projectMatch = /^\s*\[project\]/m.exec(text);
  if (projectMatch === null) {
    return false;
  }
  const after = text.slice(projectMatch.index);
  const arrayMatch = /dependencies\s*=\s*\[([\s\S]*?)\]/.exec(after);
  if (arrayMatch === null || arrayMatch[1] === undefined) {
    return false;
  }
  const entries = arrayMatch[1].match(/"([^"]+)"|'([^']+)'/g) ?? [];
  let found = false;
  for (const quoted of entries) {
    const value = quoted.slice(1, -1);
    const match = REQUIREMENT_RE.exec(value.trim());
    if (match !== null && match[1] !== undefined) {
      report.deps.push({
        name: canonicalName("pypi", match[1]),
        range: (match[2] ?? "").trim(),
        ecosystem: "pypi",
        kind: "prod",
      });
      found = true;
    }
  }
  if (!found) {
    report.warnings.push(`${source}: [project] dependencies found but empty or unparsable`);
  }
  return true;
}

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

export async function readManifests(root: string): Promise<ManifestReport> {
  const report: ManifestReport = { root: path.resolve(root), ecosystems: [], deps: [], scripts: "", warnings: [] };

  const packageText = await readIfExists(path.join(root, "package.json"));
  if (packageText !== null) {
    try {
      const pkg: unknown = JSON.parse(packageText);
      if (isRecord(pkg)) {
        readNpmDeps(root, pkg, report);
      }
    } catch {
      report.warnings.push("package.json is not valid JSON");
    }
  }

  const requirementsText = await readIfExists(path.join(root, "requirements.txt"));
  if (requirementsText !== null) {
    parseRequirementsText(requirementsText, "requirements.txt", report);
    report.ecosystems.push("pypi");
  }

  const pyprojectText = await readIfExists(path.join(root, "pyproject.toml"));
  if (pyprojectText !== null) {
    const parsed = parsePyprojectDependencies(pyprojectText, "pyproject.toml", report);
    if (!parsed && requirementsText === null) {
      report.warnings.push("pyproject.toml has no [project] dependencies table (poetry layout is not supported yet)");
    }
    if (!report.ecosystems.includes("pypi")) {
      report.ecosystems.push("pypi");
    }
  }

  const seen = new Set<string>();
  report.deps = report.deps.filter((dep) => {
    const key = `${dep.ecosystem}:${dep.name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  if (report.deps.length === 0 && report.ecosystems.length === 0) {
    throw new Error(`No package.json, requirements.txt, or pyproject.toml under ${report.root}`);
  }

  return report;
}
