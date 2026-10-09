import { readManifests, type DeclaredDep, type Ecosystem, type ManifestReport } from "./ecosystems.js";
import { collectBareImports } from "./imports.js";
import { importCandidates, isTooling } from "./stdlib.js";

export interface UnusedResult {
  unused: DeclaredDep[];
  checked: number;
  warnings: string[];
}

export interface UnusedOptions {
  tooling?: boolean;
}

export async function unusedDeps(root: string, options: UnusedOptions = {}): Promise<UnusedResult> {
  const report = await readManifests(root);
  const { imports } = await collectBareImports(root, report.ecosystems);

  const imported = new Map<Ecosystem, Set<string>>();
  for (const hit of imports) {
    const set = imported.get(hit.ecosystem) ?? new Set<string>();
    set.add(hit.package.toLowerCase());
    imported.set(hit.ecosystem, set);
  }

  const unused: DeclaredDep[] = [];
  let checked = 0;
  for (const dep of report.deps) {
    if (dep.kind === "peer") {
      continue;
    }
    if (options.tooling !== false) {
      if (isTooling(dep.name, dep.ecosystem)) {
        continue;
      }
      if (dep.ecosystem === "npm" && report.scripts.toLowerCase().includes(dep.name)) {
        continue;
      }
    }
    checked += 1;
    const candidates = importCandidates(dep.name, dep.ecosystem);
    const used = candidates.some((candidate) => imported.get(dep.ecosystem)?.has(candidate.toLowerCase()) === true);
    if (!used) {
      unused.push(dep);
    }
  }

  return { unused, checked, warnings: report.warnings };
}

export interface MissingDep {
  package: string;
  ecosystem: Ecosystem;
  importers: string[];
}

export interface MissingResult {
  missing: MissingDep[];
  warnings: string[];
}

export async function missingDeps(root: string): Promise<MissingResult> {
  const report = await readManifests(root);
  const { imports } = await collectBareImports(root, report.ecosystems);

  const declared = new Map<Ecosystem, Set<string>>();
  for (const dep of report.deps) {
    const set = declared.get(dep.ecosystem) ?? new Set<string>();
    for (const candidate of importCandidates(dep.name, dep.ecosystem)) {
      set.add(candidate.toLowerCase());
    }
    declared.set(dep.ecosystem, set);
  }

  const grouped = new Map<string, MissingDep>();
  for (const hit of imports) {
    if (declared.get(hit.ecosystem)?.has(hit.package.toLowerCase()) === true) {
      continue;
    }
    if (declared.get(hit.ecosystem)?.has(hit.package.toLowerCase().replace(/-/g, "_")) === true) {
      continue;
    }
    const key = `${hit.ecosystem}:${hit.package.toLowerCase()}`;
    const existing = grouped.get(key);
    if (existing === undefined) {
      grouped.set(key, { package: hit.package, ecosystem: hit.ecosystem, importers: [hit.file] });
    } else if (!existing.importers.includes(hit.file) && existing.importers.length < 10) {
      existing.importers.push(hit.file);
    }
  }

  const missing = [...grouped.values()].sort(
    (left, right) =>
      left.ecosystem.localeCompare(right.ecosystem) || left.package.localeCompare(right.package),
  );
  return { missing, warnings: report.warnings };
}

export async function manifestSummary(root: string): Promise<ManifestReport> {
  return readManifests(root);
}
