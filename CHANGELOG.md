# Changelog

All notable changes to MCP Deps Audit are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-09

### Added

- MCP server with five read-only tools: `list_deps`, `unused_deps`, `missing_deps`, `dependency_report`, `vulnerable_deps`.
- CLI (`depsaudit`) mirroring every tool with `--json`, `--limit`, and `--budget`.
- Manifest parsing for `package.json` (prod/dev/optional/peer), `requirements.txt` (with range validation and warning surfacing), and `pyproject.toml` `[project] dependencies`.
- Unused-dependency analysis with tooling awareness: built-in tooling lists, npm script mentions, `@types/*` and `@eslint/*` prefixes, and a PyPI import-alias map (`yaml` → `pyyaml`, `bs4` → `beautifulsoup4`, `cv2` → `opencv-python`, ...).
- Missing-dependency analysis with Node builtin exclusion and a curated CPython stdlib list.
- Registry clients for the npm registry and PyPI with injectable fetch, 8-second timeouts, and bounded concurrency; majors-behind computed from `package-lock.json` versions.
- OSV.dev batch vulnerability queries, version-pinned from the lockfile when available, with failure containment.
- Token-budgeted report rendering (default ~900 tokens, line-boundary cuts).
- Noise skipping for node_modules, dist, virtualenvs, caches, and symlinks; 1 MB read cap.
- 34-test suite with stubbed HTTP covering manifests, imports, analysis, registry, OSV, rendering, CLI, and MCP handshake.

[0.1.0]: https://github.com/KaryawanSurga/mcp-deps-audit/releases/tag/v0.1.0
