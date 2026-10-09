import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { manifestSummary, missingDeps, unusedDeps } from "./core/audit.js";
import { renderManifest, renderMissing, renderReport, renderUnused, renderVulnerable } from "./core/render.js";
import { dependencyReport, vulnerableDeps } from "./core/risk.js";

export const SERVER_NAME = "mcp-deps-audit";
export const SERVER_VERSION = "0.1.0";

export const listDepsSchema = {
  path: z.string().optional().describe("Project root (default: current directory)"),
};

export const unusedDepsSchema = {
  path: z.string().optional().describe("Project root (default: current directory)"),
};

export const missingDepsSchema = {
  path: z.string().optional().describe("Project root (default: current directory)"),
};

export const dependencyReportSchema = {
  path: z.string().optional().describe("Project root (default: current directory)"),
  limit: z.number().int().min(1).max(300).optional().describe("Maximum dependencies to look up (default 50)"),
};

export const vulnerableDepsSchema = {
  path: z.string().optional().describe("Project root (default: current directory)"),
  limit: z.number().int().min(1).max(300).optional().describe("Maximum dependencies to query (default 100)"),
};

function rootOf(pathValue: string | undefined): string {
  return pathValue !== undefined && pathValue.length > 0 ? pathValue : ".";
}

function errorText(tool: string, error: unknown): { isError: true; content: Array<{ type: "text"; text: string }> } {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text", text: `${tool} failed: ${message}` }] };
}

export function buildServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "list_deps",
    {
      title: "List dependencies",
      description:
        "List declared dependencies from package.json, requirements.txt, and pyproject.toml with their ecosystem, kind " +
        "(prod/dev/optional/peer), and version range. Local only.",
      inputSchema: listDepsSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path }) => {
      try {
        const report = await manifestSummary(rootOf(path));
        return { content: [{ type: "text", text: renderManifest(report) }] };
      } catch (error) {
        return errorText("list_deps", error);
      }
    },
  );

  server.registerTool(
    "unused_deps",
    {
      title: "Unused dependencies",
      description:
        "Find declared dependencies that no source file imports and no package script mentions. Tooling packages " +
        "(typescript, eslint, pytest, @types/*, ...) are excluded automatically.",
      inputSchema: unusedDepsSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path }) => {
      try {
        const result = await unusedDeps(rootOf(path));
        return { content: [{ type: "text", text: renderUnused(result) }] };
      } catch (error) {
        return errorText("unused_deps", error);
      }
    },
  );

  server.registerTool(
    "missing_deps",
    {
      title: "Missing dependencies",
      description:
        "Find bare imports that are not declared in any manifest and are not standard-library modules — the packages " +
        "your project uses but forgot to declare.",
      inputSchema: missingDepsSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path }) => {
      try {
        const result = await missingDeps(rootOf(path));
        return { content: [{ type: "text", text: renderMissing(result) }] };
      } catch (error) {
        return errorText("missing_deps", error);
      }
    },
  );

  server.registerTool(
    "dependency_report",
    {
      title: "Dependency report",
      description:
        "Check declared dependencies against their registries (npm, PyPI): latest version, how many majors behind the " +
        "installed version (from package-lock.json when present), license, and deprecation. Uses the network.",
      inputSchema: dependencyReportSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ path, limit }) => {
      try {
        const options: { limit?: number } = {};
        if (limit !== undefined) {
          options.limit = limit;
        }
        const result = await dependencyReport(rootOf(path), options);
        const rendered = renderReport(result);
        const footer = `\n\n_~${rendered.tokens} tokens${rendered.truncated ? ", truncated to budget" : ""}_`;
        return { content: [{ type: "text", text: `${rendered.text}${footer}` }] };
      } catch (error) {
        return errorText("dependency_report", error);
      }
    },
  );

  server.registerTool(
    "vulnerable_deps",
    {
      title: "Vulnerable dependencies",
      description:
        "Query OSV.dev for known vulnerabilities affecting declared dependencies, version-pinned from package-lock.json " +
        "when available. Uses the network.",
      inputSchema: vulnerableDepsSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ path, limit }) => {
      try {
        const options: { limit?: number } = {};
        if (limit !== undefined) {
          options.limit = limit;
        }
        const result = await vulnerableDeps(rootOf(path), options);
        return { content: [{ type: "text", text: renderVulnerable(result) }] };
      } catch (error) {
        return errorText("vulnerable_deps", error);
      }
    },
  );

  return server;
}
