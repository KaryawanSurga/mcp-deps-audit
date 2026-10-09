import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import { cleanup, makeSampleApp, makeTempDir } from "./helpers/fixture.js";

interface TextBlock {
  type: string;
  text?: string;
}

function firstText(result: { content: unknown[] }): string {
  const block = result.content.find((entry) => (entry as TextBlock).type === "text") as TextBlock | undefined;
  return block?.text ?? "";
}

async function connectClient(): Promise<Client> {
  const mcp = buildServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "deps-audit-test", version: "0.0.0" });
  await mcp.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

describe("deps audit mcp server", () => {
  it("advertises its tools", async () => {
    const client = await connectClient();
    try {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        "dependency_report",
        "list_deps",
        "missing_deps",
        "unused_deps",
        "vulnerable_deps",
      ]);
      for (const tool of tools) {
        expect(tool.description ?? "").not.toBe("");
      }
    } finally {
      await client.close();
    }
  });

  it("lists declared dependencies", async () => {
    const root = await makeSampleApp();
    const client = await connectClient();
    try {
      const result = await client.callTool({ name: "list_deps", arguments: { path: root } });
      const text = firstText(result as { content: unknown[] });
      expect(text).toContain("used-lib");
      expect(text).toContain("prod");
      expect(text).toContain("pypi");
    } finally {
      await client.close();
      await cleanup(root);
    }
  });

  it("finds unused and missing dependencies", async () => {
    const root = await makeSampleApp();
    const client = await connectClient();
    try {
      const unused = await client.callTool({ name: "unused_deps", arguments: { path: root } });
      expect(firstText(unused as { content: unknown[] })).toContain("unused-lib");

      const missing = await client.callTool({ name: "missing_deps", arguments: { path: root } });
      const text = firstText(missing as { content: unknown[] });
      expect(text).toContain("missing-lib");
      expect(text).toContain("flask");
    } finally {
      await client.close();
      await cleanup(root);
    }
  });

  it("returns actionable errors", async () => {
    const root = await makeTempDir();
    const client = await connectClient();
    try {
      const failure = await client.callTool({ name: "list_deps", arguments: { path: root } });
      expect((failure as { isError?: boolean }).isError).toBe(true);
      expect(firstText(failure as { content: unknown[] })).toContain("list_deps failed");
    } finally {
      await client.close();
      await cleanup(root);
    }
  });
});
