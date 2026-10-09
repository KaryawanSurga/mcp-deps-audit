import type { UnusedResult, MissingResult } from "./audit.js";
import type { ManifestReport } from "./ecosystems.js";
import type { DependencyReportResult } from "./risk.js";
import type { VulnerableResult } from "./risk.js";
import { clampToBudget, DEFAULT_BUDGET } from "./tokens.js";

export function renderManifest(report: ManifestReport): string {
  if (report.deps.length === 0) {
    return "No declared dependencies found.";
  }
  const lines: string[] = [`Declared dependencies (${report.deps.length}) under ${report.root}`];
  for (const ecosystem of report.ecosystems) {
    lines.push("");
    lines.push(`${ecosystem}:`);
    for (const dep of report.deps.filter((entry) => entry.ecosystem === ecosystem)) {
      const range = dep.range.length > 0 ? dep.range : "(any)";
      lines.push(`  ${dep.kind.padEnd(8)} ${dep.name}  ${range}`);
    }
  }
  if (report.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of report.warnings) {
      lines.push(`  - ${warning}`);
    }
  }
  return lines.join("\n");
}

export function renderUnused(result: UnusedResult): string {
  if (result.unused.length === 0) {
    return `No unused dependencies (${result.checked} checked).`;
  }
  const lines = result.unused.map((dep) => `  ${dep.ecosystem}  ${dep.name}  ${dep.range || "(any)"}`);
  return [
    `${result.unused.length} possibly unused dependenc${result.unused.length === 1 ? "y" : "ies"} (${result.checked} checked):`,
    ...lines,
    "",
    "Tooling packages (tsc, eslint, pytest, ...) are excluded automatically; verify scripts before removing.",
  ].join("\n");
}

export function renderMissing(result: MissingResult): string {
  if (result.missing.length === 0) {
    return "No missing dependencies: every bare import is declared (or a standard library module).";
  }
  const lines: string[] = [`${result.missing.length} imported package(s) are not declared:`];
  for (const dep of result.missing) {
    lines.push(`  ${dep.ecosystem}  ${dep.package}  (from ${dep.importers.join(", ")})`);
  }
  return lines.join("\n");
}

export function renderReport(
  result: DependencyReportResult,
  budget: number = DEFAULT_BUDGET,
): { text: string; tokens: number; truncated: boolean } {
  const lines: string[] = [
    `Dependency report (${result.fetched}/${result.entries.length} resolved${result.skipped > 0 ? `, ${result.skipped} skipped by limit` : ""})`,
    "",
  ];
  for (const entry of result.entries) {
    if (entry.error !== undefined) {
      lines.push(`  ??  ${entry.name}  ${entry.range || "(any)"}  (${entry.error})`);
      continue;
    }
    const version = entry.version !== undefined ? entry.version : entry.range || "?";
    const behind = entry.majorsBehind !== null && entry.majorsBehind > 0 ? `  [${entry.majorsBehind} major(s) behind]` : "";
    const license = entry.license !== undefined ? `  ${entry.license}` : "";
    const deprecated = entry.deprecated === true ? "  DEPRECATED" : "";
    lines.push(`  ${entry.name}  ${version} -> ${entry.latest ?? "?"}${behind}${license}${deprecated}`);
  }
  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`);
    }
  }
  return clampToBudget(lines.join("\n"), budget);
}

export function renderVulnerable(result: VulnerableResult): string {
  const affected = result.results.filter((entry) => entry.vulns.length > 0);
  const lines: string[] = [];
  if (result.errors.length > 0) {
    lines.push("Errors:");
    for (const error of result.errors) {
      lines.push(`  - ${error}`);
    }
    lines.push("");
  }
  if (affected.length === 0) {
    lines.push(`No known vulnerabilities for ${result.queried} queried package(s).`);
  } else {
    lines.push(`${affected.length} package(s) with known vulnerabilities (${result.queried} queried):`);
    for (const entry of affected) {
      const version = entry.version !== undefined ? `@${entry.version}` : "";
      lines.push("");
      lines.push(`  ${entry.package}${version}:`);
      for (const vuln of entry.vulns.slice(0, 5)) {
        const severity = vuln.severity !== undefined ? ` [${vuln.severity}]` : "";
        const aliases = vuln.aliases.length > 0 ? ` (${vuln.aliases.slice(0, 2).join(", ")})` : "";
        const summary = vuln.summary !== undefined ? ` ${vuln.summary.slice(0, 100)}` : "";
        lines.push(`    ${vuln.id}${severity}${aliases}${summary}`);
      }
    }
    lines.push("");
    lines.push("Source: OSV.dev. Version-pinned queries use package-lock.json where available.");
  }
  return lines.join("\n");
}
