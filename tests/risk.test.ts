import { describe, expect, it } from "vitest";
import { renderReport, renderVulnerable } from "../src/core/render.js";
import { dependencyReport, vulnerableDeps } from "../src/core/risk.js";
import type { FetchLike } from "../src/core/registry.js";
import { cleanup, makeSampleApp, stubFetch } from "./helpers/fixture.js";

const REGISTRY_ROUTES = {
  "https://registry.npmjs.org/used-lib/latest": { body: { version: "1.5.0", license: "MIT" } },
  "https://registry.npmjs.org/unused-lib/latest": { body: { version: "2.0.0", license: "Apache-2.0" } },
  "https://registry.npmjs.org/typescript/latest": { body: { version: "5.6.0", license: "Apache-2.0" } },
  "https://registry.npmjs.org/vitest/latest": { body: { version: "5.0.3", license: "MIT" } },
  "https://pypi.org/pypi/requests/json": { body: { info: { version: "2.32.0", license: "Apache-2.0" } } },
  "https://pypi.org/pypi/unused-py/json": { body: { info: { version: "1.1.0", license: "MIT" } } },
};

describe("dependencyReport", () => {
  it("checks every dependency against its registry", async () => {
    const root = await makeSampleApp();
    const { fetchImpl } = stubFetch(REGISTRY_ROUTES);
    try {
      const result = await dependencyReport(root, { fetchImpl });
      expect(result.entries).toHaveLength(6);
      expect(result.fetched).toBe(6);
      const used = result.entries.find((entry) => entry.name === "used-lib");
      expect(used).toMatchObject({ latest: "1.5.0", version: "1.2.3", license: "MIT", majorsBehind: 0 });
      const unused = result.entries.find((entry) => entry.name === "unused-lib");
      expect(unused?.majorsBehind).toBe(2);
      const requests = result.entries.find((entry) => entry.name === "requests");
      expect(requests?.latest).toBe("2.32.0");

      const rendered = renderReport(result);
      expect(rendered.text).toContain("used-lib");
      expect(rendered.text).toContain("[2 major(s) behind]");
    } finally {
      await cleanup(root);
    }
  });

  it("respects the limit and reports failures", async () => {
    const root = await makeSampleApp();
    const { fetchImpl } = stubFetch({
      "https://registry.npmjs.org/used-lib/latest": { body: { version: "1.5.0" } },
    });
    try {
      const limited = await dependencyReport(root, { fetchImpl, limit: 2 });
      expect(limited.entries).toHaveLength(2);
      expect(limited.skipped).toBe(4);

      const failing = limited.entries.find((entry) => entry.name === "unused-lib");
      expect(failing?.error).toContain("not found");
      expect(renderReport(limited).text).toContain("??");
    } finally {
      await cleanup(root);
    }
  });
});

describe("vulnerableDeps", () => {
  it("queries OSV with lockfile versions", async () => {
    const root = await makeSampleApp();
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push(url);
      if (url !== "https://api.osv.dev/v1/querybatch") {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      const payload = JSON.parse(init?.body ?? "{}") as {
        queries: Array<{ package: { name: string; ecosystem: string }; version?: string }>;
      };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: payload.queries.map((query) =>
            query.package.name === "used-lib"
              ? {
                  vulns: [
                    {
                      id: "GHSA-test-1234",
                      summary: "Prototype pollution in used-lib",
                      aliases: ["CVE-2026-0001"],
                      database_specific: { severity: "HIGH" },
                    },
                  ],
                }
              : {},
          ),
        }),
      };
    };
    try {
      const result = await vulnerableDeps(root, { fetchImpl });
      expect(result.errors).toEqual([]);
      expect(result.queried).toBe(6);
      expect(calls).toEqual(["https://api.osv.dev/v1/querybatch", "https://api.osv.dev/v1/querybatch"]);
      const affected = result.results.filter((entry) => entry.vulns.length > 0);
      expect(affected).toHaveLength(1);
      expect(affected[0]?.package).toBe("used-lib");
      expect(affected[0]?.version).toBe("1.2.3");

      const rendered = renderVulnerable(result);
      expect(rendered).toContain("GHSA-test-1234");
      expect(rendered).toContain("[HIGH]");
    } finally {
      await cleanup(root);
    }
  });

  it("reports OSV failures without throwing", async () => {
    const root = await makeSampleApp();
    const fetchImpl: FetchLike = async () => {
      throw new Error("network down");
    };
    try {
      const result = await vulnerableDeps(root, { fetchImpl });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(renderVulnerable(result)).toContain("Errors:");
    } finally {
      await cleanup(root);
    }
  });
});
