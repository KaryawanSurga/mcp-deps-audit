import { readManifests, type DepKind, type Ecosystem } from "./ecosystems.js";
import { readLockVersions } from "./lockfile.js";
import { type OsvResult, queryOsv } from "./osv.js";
import { type FetchLike, majorOf, mapLimit, packageInfo } from "./registry.js";

export interface ReportEntry {
  name: string;
  ecosystem: Ecosystem;
  kind: DepKind;
  range: string;
  version?: string;
  latest?: string;
  license?: string;
  deprecated?: boolean;
  majorsBehind: number | null;
  error?: string;
}

export interface DependencyReportResult {
  entries: ReportEntry[];
  fetched: number;
  skipped: number;
  warnings: string[];
}

export interface ReportOptions {
  fetchImpl?: FetchLike;
  limit?: number;
  timeoutMs?: number;
  concurrency?: number;
}

export async function dependencyReport(root: string, options: ReportOptions = {}): Promise<DependencyReportResult> {
  const manifest = await readManifests(root);
  const lock = await readLockVersions(root);
  const limit = options.limit ?? 50;
  const deps = manifest.deps.slice(0, limit);
  const skipped = Math.max(0, manifest.deps.length - deps.length);

  const entries = await mapLimit(deps, options.concurrency ?? 6, async (dep): Promise<ReportEntry> => {
    const version = lock.get(dep.name);
    const info = await packageInfo(dep.name, dep.ecosystem, options.fetchImpl, options.timeoutMs);
    const entry: ReportEntry = {
      name: dep.name,
      ecosystem: dep.ecosystem,
      kind: dep.kind,
      range: dep.range,
      majorsBehind: null,
    };
    if (version !== undefined) {
      entry.version = version;
    }
    if (info.latest !== undefined) {
      entry.latest = info.latest;
    }
    if (info.license !== undefined) {
      entry.license = info.license;
    }
    if (info.deprecated === true) {
      entry.deprecated = true;
    }
    if (info.error !== undefined) {
      entry.error = info.error;
    } else if (version !== undefined && info.latest !== undefined) {
      const currentMajor = majorOf(version);
      const latestMajor = majorOf(info.latest);
      entry.majorsBehind =
        currentMajor !== null && latestMajor !== null && latestMajor > currentMajor ? latestMajor - currentMajor : 0;
    }
    return entry;
  });

  return { entries, fetched: entries.filter((entry) => entry.error === undefined).length, skipped, warnings: manifest.warnings };
}

export interface VulnerableResult {
  results: OsvResult[];
  queried: number;
  skipped: number;
  warnings: string[];
  errors: string[];
}

export interface VulnerableOptions {
  fetchImpl?: FetchLike;
  limit?: number;
  timeoutMs?: number;
}

export async function vulnerableDeps(root: string, options: VulnerableOptions = {}): Promise<VulnerableResult> {
  const manifest = await readManifests(root);
  const lock = await readLockVersions(root);
  const limit = options.limit ?? 100;
  const deps = manifest.deps.slice(0, limit);
  const skipped = Math.max(0, manifest.deps.length - deps.length);

  const results: OsvResult[] = [];
  const errors: string[] = [];

  for (const ecosystem of ["npm", "pypi"] as const) {
    const queries = deps
      .filter((dep) => dep.ecosystem === ecosystem)
      .map((dep) => {
        const version = lock.get(dep.name);
        return version !== undefined ? { package: dep.name, version } : { package: dep.name };
      });
    if (queries.length === 0) {
      continue;
    }
    try {
      const batch = await queryOsv(queries, ecosystem, options.fetchImpl, options.timeoutMs);
      results.push(...batch);
    } catch (error) {
      errors.push(`OSV query failed for ${ecosystem}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { results, queried: deps.length, skipped, warnings: manifest.warnings, errors };
}
