# mcp-deps-audit

[![npm](https://img.shields.io/npm/v/mcp-deps-audit)](https://www.npmjs.com/package/mcp-deps-audit)
[![CI](https://github.com/KaryawanSurga/mcp-deps-audit/actions/workflows/ci.yml/badge.svg)](https://github.com/KaryawanSurga/mcp-deps-audit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**Audit project dependencies from any MCP client — unused, missing, outdated, deprecated, and vulnerable — for npm and PyPI.**

An MCP server and CLI that answers the dependency questions agents usually skip: *Is this package actually used? Did we forget to declare something we import? How far behind are we? Is anything deprecated? Does anything have known CVEs?* Two tools answer offline from the working tree; two enrich with the npm registry, PyPI, and OSV.dev.

## Why

- Unused dependencies bloat installs, attack surface, and lockfiles — nobody prunes them because checking is tedious.
- Forgotten declarations pass locally (hoisted node_modules) and explode in CI or production.
- "How outdated are we?" usually means reading a noisy `npm outdated` table; agents need a structured answer.
- Vulnerability scanners default to lockfiles only; import-level usage and missing-deps analysis are complementary signals.

## Install

```sh
# run directly
npx -y mcp-deps-audit report .

# or install globally
npm install -g mcp-deps-audit
depsaudit unused
```

Requires Node >= 20. Network tools (`report`, `vulns`) call the npm registry, PyPI, and OSV.dev; the rest are fully local.

## MCP setup

```json
{
  "mcpServers": {
    "deps-audit": {
      "command": "npx",
      "args": ["-y", "mcp-deps-audit", "serve"]
    }
  }
}
```

## Tools

| Tool | Network | Answers |
| --- | --- | --- |
| `list_deps` | no | What is declared, in which ecosystem, kind, and range. |
| `unused_deps` | no | What is declared but never imported or run. |
| `missing_deps` | no | What is imported but never declared. |
| `dependency_report` | yes | Latest version, majors behind, license, deprecation. |
| `vulnerable_deps` | yes | Known vulnerabilities from OSV.dev, pinned via lockfile. |

## CLI

```sh
depsaudit list                # declared dependencies
depsaudit unused              # declared but unused (tooling excluded)
depsaudit missing             # imported but undeclared (stdlib excluded)
depsaudit report --limit 30   # registry check for the first 30 deps
depsaudit vulns               # OSV.dev vulnerability query
depsaudit serve               # MCP server on stdio
```

Every command supports `--json` and an optional project directory argument.

## Example

```text
$ depsaudit report . --limit 4
Dependency report (4/4 resolved, 1 skipped by limit)

  @modelcontextprotocol/sdk  1.32.1 -> 1.32.1  MIT
  zod  4.6.5 -> 4.6.5  MIT
  @types/node  22.20.5 -> 26.6.4  [4 major(s) behind]  MIT
  typescript  5.9.3 -> 7.0.2  [2 major(s) behind]  Apache-2.0
```

## How it works

- **Manifests**: `package.json` (dependencies, devDependencies, optionalDependencies, peerDependencies), `requirements.txt`, and `pyproject.toml` `[project] dependencies`. Poetry-style layouts are a documented gap for v0.2.
- **Imports**: line-level extraction of `import`, `export ... from`, dynamic `import()`, `require()`, and Python `import` / `from ... import` across the working tree, skipping `node_modules`, `dist`, virtualenvs, and friends.
- **Usage matching**: tooling packages never imported (`typescript`, `eslint`, `pytest`, `@types/*`, ...) and packages named in npm scripts count as used. Common PyPI import aliases (`yaml` → `pyyaml`, `bs4` → `beautifulsoup4`, `cv2` → `opencv-python`, ...) are resolved.
- **Pinning**: when `package-lock.json` exists, exact installed versions drive both the "majors behind" calculation and the OSV queries; otherwise OSV answers at package level.
- **Bounded**: registry lookups run with bounded concurrency (6), an 8-second timeout each, and a result limit; OSV uses the batch API, one request per ecosystem.
- **Read-only**: nothing writes to your project; `report` and `vulns` are annotated as network tools.

## Limitations (v0.1.0)

- Import scanning is regex-level: dynamic specifier construction and heavy metaprogramming can be missed.
- Fixture files that contain example import statements (test literals) can surface as missing dependencies — the importer path is reported so you can judge.
- Python missing-deps uses a curated stdlib list and alias map, not a live interpreter.
- `package-lock.json` (npm) is the only lockfile understood; pnpm and yarn locks fall back to range display.
- No transitive vulnerability walk: OSV is queried for declared direct dependencies.

## Roadmap

- pnpm-lock.yaml and yarn.lock support; Poetry `[tool.poetry]` dependencies.
- Transitive vulnerability counts from lockfiles.
- License policy checks (allowlist/denylist) for CI gating.
- `--fix` hints: remove unused, add missing with the latest version.

## Development

```sh
npm install
npm run typecheck
npm run build
npm test
```

The suite covers manifest parsing, import scanning, usage matching, registry clients (with stubbed HTTP), OSV batching, rendering, the CLI, and the MCP server handshake.

## License

MIT — see [LICENSE](LICENSE).
