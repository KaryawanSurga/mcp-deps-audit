import type { Ecosystem } from "./ecosystems.js";

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export type FetchLike = (
  url: string,
  init?: { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<FetchResponseLike>;

export const defaultFetch: FetchLike = (url, init) => fetch(url, init);

export interface RegistryInfo {
  name: string;
  ecosystem: Ecosystem;
  latest?: string;
  license?: string;
  deprecated?: boolean;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function fetchJson(
  fetchImpl: FetchLike,
  url: string,
  timeoutMs: number,
  init?: { method?: string; body?: string; headers?: Record<string, string> },
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      return { status: response.status, body: undefined };
    }
    return { status: response.status, body: await response.json() };
  } finally {
    clearTimeout(timer);
  }
}

export async function npmPackageInfo(
  name: string,
  fetchImpl: FetchLike = defaultFetch,
  timeoutMs = 8000,
): Promise<RegistryInfo> {
  const info: RegistryInfo = { name, ecosystem: "npm" };
  try {
    const { status, body } = await fetchJson(
      fetchImpl,
      `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`,
      timeoutMs,
    );
    if (status === 404) {
      info.error = "not found on the npm registry";
      return info;
    }
    if (status !== 200 || !isRecord(body)) {
      info.error = `npm registry returned status ${status}`;
      return info;
    }
    if (typeof body["version"] === "string") {
      info.latest = body["version"];
    }
    if (typeof body["license"] === "string") {
      info.license = body["license"];
    } else if (isRecord(body["license"]) && typeof body["license"]["type"] === "string") {
      info.license = body["license"]["type"];
    }
    if (typeof body["deprecated"] === "string") {
      info.deprecated = true;
    }
    return info;
  } catch (error) {
    info.error = error instanceof Error ? error.message : String(error);
    return info;
  }
}

export async function pypiPackageInfo(
  name: string,
  fetchImpl: FetchLike = defaultFetch,
  timeoutMs = 8000,
): Promise<RegistryInfo> {
  const info: RegistryInfo = { name, ecosystem: "pypi" };
  try {
    const { status, body } = await fetchJson(
      fetchImpl,
      `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
      timeoutMs,
    );
    if (status === 404) {
      info.error = "not found on PyPI";
      return info;
    }
    if (status !== 200 || !isRecord(body)) {
      info.error = `PyPI returned status ${status}`;
      return info;
    }
    const meta = body["info"];
    if (!isRecord(meta)) {
      info.error = "PyPI payload had no info object";
      return info;
    }
    if (typeof meta["version"] === "string") {
      info.latest = meta["version"];
    }
    if (typeof meta["license"] === "string" && meta["license"].trim().length > 0) {
      info.license = meta["license"].trim();
    } else if (Array.isArray(meta["classifiers"])) {
      const licenseClassifier = meta["classifiers"].find(
        (entry): entry is string => typeof entry === "string" && entry.startsWith("License ::") ,
      );
      if (licenseClassifier !== undefined) {
        info.license = licenseClassifier.replace(/^License ::\s*/, "");
      }
    }
    if (meta["yanked"] === true) {
      info.deprecated = true;
    }
    return info;
  } catch (error) {
    info.error = error instanceof Error ? error.message : String(error);
    return info;
  }
}

export function packageInfo(
  name: string,
  ecosystem: Ecosystem,
  fetchImpl: FetchLike = defaultFetch,
  timeoutMs = 8000,
): Promise<RegistryInfo> {
  return ecosystem === "npm" ? npmPackageInfo(name, fetchImpl, timeoutMs) : pypiPackageInfo(name, fetchImpl, timeoutMs);
}

/** Run async tasks with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) {
        continue;
      }
      results[index] = await task(item, index);
    }
  });
  await Promise.all(workers);
  return results;
}

export function majorOf(version: string): number | null {
  const match = /(\d+)/.exec(version.replace(/^[^0-9]*/, ""));
  if (match === null || match[1] === undefined) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}
