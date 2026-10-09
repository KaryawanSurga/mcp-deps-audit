import { describe, expect, it } from "vitest";
import { majorOf, mapLimit, npmPackageInfo, pypiPackageInfo } from "../src/core/registry.js";
import { stubFetch } from "./helpers/fixture.js";

describe("npmPackageInfo", () => {
  it("parses version, license, and deprecation", async () => {
    const { fetchImpl } = stubFetch({
      "https://registry.npmjs.org/used-lib/latest": {
        body: { version: "1.5.0", license: "MIT" },
      },
      "https://registry.npmjs.org/gone-lib/latest": {
        body: { version: "0.1.0", deprecated: "use something else" },
      },
    });
    const info = await npmPackageInfo("used-lib", fetchImpl);
    expect(info).toMatchObject({ latest: "1.5.0", license: "MIT" });
    expect(info.deprecated).toBeUndefined();

    const deprecated = await npmPackageInfo("gone-lib", fetchImpl);
    expect(deprecated.deprecated).toBe(true);
  });

  it("reports missing packages honestly", async () => {
    const { fetchImpl } = stubFetch({});
    const info = await npmPackageInfo("nope", fetchImpl);
    expect(info.error).toContain("not found");
    expect(info.latest).toBeUndefined();
  });
});

describe("pypiPackageInfo", () => {
  it("parses info fields and license classifiers", async () => {
    const { fetchImpl } = stubFetch({
      "https://pypi.org/pypi/requests/json": {
        body: { info: { version: "2.32.0", license: "Apache-2.0" } },
      },
      "https://pypi.org/pypi/unused-py/json": {
        body: {
          info: { version: "1.1.0", license: "", classifiers: ["License :: OSI Approved :: MIT License"] },
        },
      },
    });
    expect((await pypiPackageInfo("requests", fetchImpl)).latest).toBe("2.32.0");
    const classifier = await pypiPackageInfo("unused-py", fetchImpl);
    expect(classifier.license).toBe("OSI Approved :: MIT License");
  });

  it("flags yanked releases", async () => {
    const { fetchImpl } = stubFetch({
      "https://pypi.org/pypi/bad/json": { body: { info: { version: "1.0.0", yanked: true } } },
    });
    expect((await pypiPackageInfo("bad", fetchImpl)).deprecated).toBe(true);
  });
});

describe("mapLimit", () => {
  it("preserves order with bounded concurrency", async () => {
    const results = await mapLimit([1, 2, 3, 4, 5], 2, async (value) => {
      await new Promise((resolve) => setTimeout(resolve, (6 - value) * 5));
      return value * 2;
    });
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });
});

describe("majorOf", () => {
  it("extracts major versions from ranges and versions", () => {
    expect(majorOf("^1.2.0")).toBe(1);
    expect(majorOf(">=2.0 <3")).toBe(2);
    expect(majorOf("2.32.0")).toBe(2);
    expect(majorOf("latest")).toBeNull();
  });
});
