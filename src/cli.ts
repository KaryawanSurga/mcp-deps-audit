import { parseArgs } from "node:util";
import { manifestSummary, missingDeps, unusedDeps } from "./core/audit.js";
import { renderManifest, renderMissing, renderReport, renderUnused, renderVulnerable } from "./core/render.js";
import { dependencyReport, vulnerableDeps } from "./core/risk.js";
import { DEFAULT_BUDGET } from "./core/tokens.js";
import { buildServer, SERVER_VERSION } from "./server.js";

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  color: boolean;
}

export const HELP = `mcp-deps-audit ${SERVER_VERSION}

Audit project dependencies: unused, missing, outdated, licenses, vulnerabilities.

Usage:
  mcp-deps-audit list [dir] [--json]
  mcp-deps-audit unused [dir] [--json]
  mcp-deps-audit missing [dir] [--json]
  mcp-deps-audit report [dir] [--limit <n>] [--budget <n>] [--json]
  mcp-deps-audit vulns [dir] [--limit <n>] [--json]
  mcp-deps-audit serve
  mcp-deps-audit --help | --version

Commands:
  list      Declared dependencies from package.json, requirements.txt, pyproject.toml
  unused    Declared but never imported (tooling packages excluded)
  missing   Imported but never declared (stdlib excluded)
  report    Registry check: latest version, majors behind, license, deprecation
  vulns     OSV.dev vulnerability query for declared dependencies
  serve     Run as an MCP server exposing the tools

Options:
  --limit <n>    Maximum dependencies to check (report default 50, vulns default 100)
  --budget <n>   Approximate token budget for report output (default ${DEFAULT_BUDGET})
  --json         Machine-readable output
  -h, --help     Show this help
  -v, --version  Print the version

Examples:
  mcp-deps-audit report . --limit 30
  mcp-deps-audit vulns .
  mcp-deps-audit unused
`;

function parsePositiveInt(value: unknown, flag: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string") {
    throw new Error(`${flag} must be a positive integer`);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

export async function main(argv: string[], io: CliIo): Promise<number> {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    options: {
      limit: { type: "string" },
      budget: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  const { values, positionals } = parsed;
  const command = positionals[0];

  if (values["version"] === true) {
    io.stdout(SERVER_VERSION);
    return 0;
  }
  if (values["help"] === true || command === undefined || command === "help") {
    io.stdout(HELP);
    return 0;
  }

  if (command === "serve") {
    const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
    const server = buildServer();
    await server.connect(new StdioServerTransport());
    return 0;
  }

  try {
    if (command === "list") {
      const report = await manifestSummary(positionals[1] ?? ".");
      if (values["json"] === true) {
        io.stdout(JSON.stringify(report, null, 2));
      } else {
        io.stdout(renderManifest(report));
      }
      return 0;
    }

    if (command === "unused") {
      const result = await unusedDeps(positionals[1] ?? ".");
      if (values["json"] === true) {
        io.stdout(JSON.stringify(result, null, 2));
      } else {
        io.stdout(renderUnused(result));
      }
      return 0;
    }

    if (command === "missing") {
      const result = await missingDeps(positionals[1] ?? ".");
      if (values["json"] === true) {
        io.stdout(JSON.stringify(result, null, 2));
      } else {
        io.stdout(renderMissing(result));
      }
      return 0;
    }

    if (command === "report") {
      const limit = parsePositiveInt(values["limit"], "--limit", 50);
      const budget = parsePositiveInt(values["budget"], "--budget", DEFAULT_BUDGET);
      const result = await dependencyReport(positionals[1] ?? ".", { limit });
      if (values["json"] === true) {
        io.stdout(JSON.stringify(result, null, 2));
      } else {
        io.stdout(renderReport(result, budget).text);
      }
      return 0;
    }

    if (command === "vulns") {
      const limit = parsePositiveInt(values["limit"], "--limit", 100);
      const result = await vulnerableDeps(positionals[1] ?? ".", { limit });
      if (values["json"] === true) {
        io.stdout(JSON.stringify(result, null, 2));
      } else {
        io.stdout(renderVulnerable(result));
      }
      return 0;
    }
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }

  io.stderr(`Unknown command: ${command}`);
  io.stderr("Run mcp-deps-audit --help for usage.");
  return 2;
}
