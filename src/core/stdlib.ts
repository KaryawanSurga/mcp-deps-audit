export const NODE_BUILTINS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "sea",
  "sqlite",
  "stream",
  "string_decoder",
  "sys",
  "test",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

/** Common CPython standard library modules (heuristic, not exhaustive). */
export const PYTHON_STDLIB = new Set([
  "abc",
  "argparse",
  "array",
  "ast",
  "asyncio",
  "base64",
  "binascii",
  "bisect",
  "builtins",
  "bz2",
  "calendar",
  "cmath",
  "codecs",
  "collections",
  "concurrent",
  "configparser",
  "contextlib",
  "copy",
  "csv",
  "ctypes",
  "curses",
  "dataclasses",
  "datetime",
  "decimal",
  "difflib",
  "dis",
  "email",
  "encodings",
  "enum",
  "errno",
  "faulthandler",
  "fnmatch",
  "fractions",
  "ftplib",
  "functools",
  "gc",
  "getpass",
  "gettext",
  "glob",
  "gzip",
  "hashlib",
  "heapq",
  "hmac",
  "html",
  "http",
  "imaplib",
  "importlib",
  "inspect",
  "io",
  "ipaddress",
  "itertools",
  "json",
  "keyword",
  "linecache",
  "locale",
  "logging",
  "lzma",
  "math",
  "mimetypes",
  "multiprocessing",
  "numbers",
  "operator",
  "os",
  "pathlib",
  "pdb",
  "pickle",
  "pkgutil",
  "platform",
  "plistlib",
  "pprint",
  "profile",
  "pstats",
  "pty",
  "queue",
  "random",
  "re",
  "readline",
  "reprlib",
  "resource",
  "sched",
  "secrets",
  "select",
  "shelve",
  "shlex",
  "shutil",
  "signal",
  "site",
  "smtplib",
  "socket",
  "socketserver",
  "sqlite3",
  "ssl",
  "statistics",
  "string",
  "stringprep",
  "struct",
  "subprocess",
  "symtable",
  "sys",
  "sysconfig",
  "tarfile",
  "tempfile",
  "textwrap",
  "threading",
  "time",
  "timeit",
  "token",
  "tokenize",
  "traceback",
  "tracemalloc",
  "tty",
  "types",
  "typing",
  "unicodedata",
  "unittest",
  "urllib",
  "uuid",
  "venv",
  "warnings",
  "wave",
  "weakref",
  "webbrowser",
  "xml",
  "xmlrpc",
  "zipfile",
  "zipimport",
  "zlib",
  "zoneinfo",
]);

/**
 * Import name to distribution name mismatches that are common in the wild.
 * Keys are import module names, values are canonical PyPI distribution names.
 */
export const PYTHON_IMPORT_ALIASES: Record<string, string> = {
  bs4: "beautifulsoup4",
  cv2: "opencv-python",
  dateutil: "python-dateutil",
  docx: "python-docx",
  dotenv: "python-dotenv",
  google: "protobuf",
  grpc: "grpcio",
  jwt: "pyjwt",
  matplotlib: "matplotlib",
  pil: "pillow",
  psycopg2: "psycopg2-binary",
  sklearn: "scikit-learn",
  yaml: "pyyaml",
  yaml_loader: "pyyaml",
};

/** Packages that are used through tooling (CLI, config) rather than imports. */
export const NPM_TOOLING = new Set([
  "typescript",
  "vitest",
  "jest",
  "eslint",
  "prettier",
  "tsup",
  "tsx",
  "ts-node",
  "rimraf",
  "concurrently",
  "nodemon",
  "husky",
  "lint-staged",
  "cross-env",
  "shx",
  "npm-run-all",
  "wireit",
  "turbo",
]);

export const PYTHON_TOOLING = new Set([
  "pytest",
  "black",
  "ruff",
  "mypy",
  "flake8",
  "isort",
  "coverage",
  "tox",
  "twine",
  "build",
  "setuptools",
  "wheel",
  "pip",
  "uv",
  "hatchling",
  "poetry",
  "pre-commit",
  "pylint",
  "bandit",
  "nbqa",
]);

export function isBuiltin(specifier: string, ecosystem: "npm" | "pypi"): boolean {
  if (ecosystem === "npm") {
    const stripped = specifier.startsWith("node:") ? specifier.slice(5) : specifier;
    return NODE_BUILTINS.has(stripped);
  }
  return PYTHON_STDLIB.has(specifier);
}

export function isTooling(depName: string, ecosystem: "npm" | "pypi"): boolean {
  if (ecosystem === "npm") {
    return (
      NPM_TOOLING.has(depName) ||
      depName.startsWith("@types/") ||
      depName.startsWith("@eslint/") ||
      depName.startsWith("@typescript-eslint/") ||
      depName.startsWith("eslint-") ||
      depName.startsWith("prettier-")
    );
  }
  return PYTHON_TOOLING.has(depName);
}

/** Candidate import names a declared package may appear under. */
export function importCandidates(depName: string, ecosystem: "npm" | "pypi"): string[] {
  if (ecosystem === "npm") {
    return [depName];
  }
  const candidates = new Set<string>([depName, depName.replace(/-/g, "_")]);
  for (const [moduleName, distribution] of Object.entries(PYTHON_IMPORT_ALIASES)) {
    if (distribution === depName) {
      candidates.add(moduleName);
    }
  }
  return [...candidates];
}
