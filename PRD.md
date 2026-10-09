# PRD — MCP Deps Audit

**Status:** v0.1.0 ready to ship
**Owner:** KaryawanSurga
**Last updated:** 2026-10-09

## 1. Summary

MCP Deps Audit is an MCP server and CLI that audits project dependencies across npm and PyPI. It answers five questions: what is declared, what is declared but unused, what is imported but undeclared, how outdated and licensing look against the registries, and which packages carry known vulnerabilities per OSV.dev. Offline tools are instant and local; network tools are bounded, injectable, and resilient.

## 2. Problem

- Unused dependencies accumulate silently, bloating installs and attack surface.
- Missing declarations pass locally through hoisted `node_modules` and fail later in CI or production.
- "Outdated" is a noisy interactive table rather than a structured answer agents can act on.
- Vulnerability scanners typically read lockfiles only; complementing them with import-level usage and missing-deps analysis catches different failure classes.

## 3. Target users

- AI coding agents (any MCP client) doing maintenance, upgrades, and cleanup tasks.
- Developers preparing releases, dependency bumps, or security reviews.
- CI authors wanting a dependency audit step without a heavyweight scanner.

## 4. Goals (v0.1.0)

1. Parse declarations from `package.json`, `requirements.txt`, and `pyproject.toml` `[project] dependencies`.
2. Detect unused declarations with tooling-awareness (typescript, eslint, pytest, `@types/*`, script usage, alias maps).
3. Detect undeclared bare imports with stdlib exclusion for Node and a curated CPython list.
4. Report latest versions, majors behind, license, and deprecation from npm and PyPI with bounded concurrency and timeouts.
5. Query OSV.dev batch API for direct dependencies, version-pinned via `package-lock.json` when present.
6. Ship all of it as five read-only MCP tools plus a mirrored CLI with `--json`.

## 5. Non-goals

- Transitive dependency graphs and full lockfile vulnerability walks (roadmap).
- Auto-fixing manifests in v0.1.0 (hints only, later `--fix`).
- Supporting pnpm/yarn lockfiles and Poetry layouts in v0.1.0 (documented gaps).
- License policy enforcement (allowlist/denylist gating) in v0.1.0.
- Hosting or uploading lockfiles anywhere; everything runs locally.

## 6. User stories

- As an agent cleaning up a repo, I want the list of unused dependencies with confidence about tooling packages.
- As an agent preparing CI, I want missing declarations before the build fails.
- As a maintainer, I want a compact table of outdated and deprecated packages with license notes.
- As a security reviewer, I want known CVEs for declared dependencies pinned to installed versions.

## 7. Functional requirements

| ID | Requirement |
| --- | --- |
| FR1 | `list_deps` returns declared dependencies with ecosystem, kind (prod/dev/optional/peer), and range; duplicate declarations are deduplicated with first-wins precedence. |
| FR2 | `unused_deps` matches declared packages against scanned bare imports, script mentions (npm), tooling lists, and PyPI alias maps; returns checked count. |
| FR3 | `missing_deps` matches scanned imports against declarations and stdlib; groups by package with up to 10 importer files. |
| FR4 | `dependency_report` fetches registry metadata per dependency (bounded concurrency 6, 8s timeout, result limit), computing majors behind from lockfile versions when available. |
| FR5 | `vulnerable_deps` batches OSV queries per ecosystem, using lockfile versions when present, reporting errors without throwing. |
| FR6 | Import scanning covers JS/TS (`import`, side-effect import, `export ... from`, dynamic import, `require`) and Python (`import`, `from ... import`), skipping relative specifiers, `node:` builtins, and a curated stdlib list. |
| FR7 | Scans skip `node_modules`, `dist`, build output, virtualenvs, caches, and symlinks; files over 1 MB are skipped. |
| FR8 | Unparsable requirements lines and URL/path requirements produce warnings, not failures. |
| FR9 | Report output is token-budgeted (default ~900) on line boundaries. |
| FR10 | Every MCP tool is annotated read-only; network tools declare an open-world hint and return actionable error text. |
| FR11 | CLI mirrors all tools with `--json`, `--limit`, and `--budget`; exit codes 0/1/2. |

## 8. Non-functional requirements

- Node >= 20; runtime dependencies limited to the MCP SDK and zod.
- Deterministic output ordering; stable text for diffing.
- Injectable `fetch` for every network call so the entire suite runs offline with stubbed HTTP.
- No writes to the audited project; no telemetry.
- Windows/macOS/Linux parity (`windowsHide` on child processes is not needed here; no child processes at all).

## 9. Success metrics

- Adoption in agent maintenance workflows (cleanup, upgrade, review).
- CI pipelines adding `depsaudit` as a pre-release step.
- Issues requesting lockfile and transitive support (roadmap validation).
- npm installs and stars growing week over week.

## 10. Technical notes

- Manifests: JSON parse for npm; line parser with range-operator validation for requirements; regex array extraction for `[project]` in pyproject (documented as TOML-lite).
- Import scanning reuses line-level rules with a 500-char line guard; canonical package extraction handles scoped npm packages and Python dot-paths.
- Registry clients: `registry.npmjs.org/<pkg>/latest` and `pypi.org/pypi/<pkg>/json`, with license classifier fallback for PyPI.
- OSV: `POST /v1/querybatch`, one request per ecosystem, results mapped back in order.
- `mapLimit` provides bounded concurrency with order preservation; `majorOf` parses leading majors from ranges and versions.
- Rendering shares the token clamp; the MCP server and CLI render identically.

## 11. Release plan

- **v0.1.0** — five tools, CLI, manifest parsing, usage analysis, registry + OSV clients, 34-test suite, CI (2026-10-09).
- **v0.2.0** — pnpm/yarn lockfiles, Poetry layouts, transitive vulnerability counts.
- **v0.3.0** — license policy gating, `--fix` assistance, SARIF output for CI annotations.

## 12. Open questions

- Should `unused_deps` weight confidence (e.g. "only referenced in comments")?
- Should `dependency_report` cache registry responses between runs?
- Should missing-deps checks learn project-local aliases (tauri aliases, import maps)?
