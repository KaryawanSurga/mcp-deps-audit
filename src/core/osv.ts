import type { Ecosystem } from "./ecosystems.js";
import { type FetchLike, defaultFetch } from "./registry.js";

export interface OsvQuery {
  package: string;
  version?: string;
}

export interface OsvVulnerability {
  id: string;
  summary?: string;
  severity?: string;
  aliases: string[];
}

export interface OsvResult {
  package: string;
  version?: string;
  vulns: OsvVulnerability[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ecosystemName(ecosystem: Ecosystem): string {
  return ecosystem === "npm" ? "npm" : "PyPI";
}

function parseVuln(value: unknown): OsvVulnerability | null {
  if (!isRecord(value) || typeof value["id"] !== "string") {
    return null;
  }
  const vuln: OsvVulnerability = { id: value["id"], aliases: [] };
  if (typeof value["summary"] === "string") {
    vuln.summary = value["summary"];
  }
  const database = value["database_specific"];
  if (isRecord(database) && typeof database["severity"] === "string") {
    vuln.severity = database["severity"];
  }
  if (Array.isArray(value["aliases"])) {
    vuln.aliases = value["aliases"].filter((entry): entry is string => typeof entry === "string");
  }
  return vuln;
}

/**
 * Query the OSV.dev batch API for vulnerabilities affecting the given
 * packages. When a version is omitted OSV answers for the whole package.
 */
export async function queryOsv(
  queries: OsvQuery[],
  ecosystem: Ecosystem,
  fetchImpl: FetchLike = defaultFetch,
  timeoutMs = 15000,
): Promise<OsvResult[]> {
  if (queries.length === 0) {
    return [];
  }
  const payload = {
    queries: queries.map((query) => {
      const packagePart: Record<string, string> = { name: query.package, ecosystem: ecosystemName(ecosystem) };
      const entry: Record<string, unknown> = { package: packagePart };
      if (query.version !== undefined && query.version.length > 0) {
        entry["version"] = query.version;
      }
      return entry;
    }),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let body: unknown;
  try {
    const response = await fetchImpl("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`OSV returned status ${response.status}`);
    }
    body = await response.json();
  } finally {
    clearTimeout(timer);
  }

  const results = isRecord(body) && Array.isArray(body["results"]) ? (body["results"] as unknown[]) : null;
  if (results === null) {
    throw new Error("OSV payload had no results array");
  }

  return queries.map((query, index) => {
    const result: OsvResult = { package: query.package, vulns: [] };
    if (query.version !== undefined) {
      result.version = query.version;
    }
    const raw = results[index];
    if (isRecord(raw) && Array.isArray(raw["vulns"])) {
      result.vulns = raw["vulns"]
        .map((vuln) => parseVuln(vuln))
        .filter((vuln): vuln is OsvVulnerability => vuln !== null);
    }
    return result;
  });
}
