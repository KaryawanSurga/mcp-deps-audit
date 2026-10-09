# PRD — MCP Deps Audit (Bahasa Indonesia)

**Status:** v0.1.0 siap rilis
**Owner:** KaryawanSurga
**Update terakhir:** 2026-10-09

## 1. Ringkasan

MCP Deps Audit adalah MCP server + CLI untuk mengaudit dependency project lintas npm dan PyPI. Menjawab lima pertanyaan: apa yang dideklarasikan, apa yang dideklarasikan tapi tidak dipakai, apa yang diimpor tapi tidak dideklarasikan, seberapa tertinggal beserta lisensinya, dan paket mana yang membawa kerentanan dikenal menurut OSV.dev. Tool offline instan dan lokal; tool jaringan terbatas, injectable, dan tahan gagal.

## 2. Masalah

- Dependency tak terpakai menumpuk diam-diam, membengkakkan install dan attack surface.
- Deklarasi yang terlupa lolos di lokal (node_modules hoisted) lalu gagal di CI atau produksi.
- "Outdated" berupa tabel interaktif yang berisik, bukan jawaban terstruktur yang bisa dieksekusi agen.
- Scanner kerentanan biasanya hanya membaca lockfile; analisis level-import dan missing-deps menangkap kelas kegagalan yang berbeda.

## 3. Target pengguna

- Agen coding AI (klien MCP apa pun) untuk task maintenance, upgrade, dan cleanup.
- Developer yang menyiapkan rilis, bump dependency, atau review keamanan.
- Penulis CI yang ingin langkah audit dependency tanpa scanner berat.

## 4. Tujuan (v0.1.0)

1. Parsing deklarasi dari `package.json`, `requirements.txt`, dan `pyproject.toml` `[project] dependencies`.
2. Deteksi deklarasi tak terpakai dengan kesadaran tooling (typescript, eslint, pytest, `@types/*`, pemakaian di script, alias map).
3. Deteksi bare import tanpa deklarasi dengan pengecualian stdlib Node dan daftar CPython kurasi.
4. Laporan versi terbaru, majors tertinggal, lisensi, dan deprecation dari npm dan PyPI dengan konkurensi dan timeout terbatas.
5. Query batch API OSV.dev untuk dependency langsung, di-pin via `package-lock.json` bila ada.
6. Menyajikan semuanya sebagai lima tool MCP read-only plus CLI yang mencerminkan dengan `--json`.

## 5. Bukan tujuan

- Graf dependency transitif dan walk kerentanan lockfile penuh (roadmap).
- Auto-fix manifest di v0.1.0 (hanya hint, nanti `--fix`).
- Dukungan lockfile pnpm/yarn dan layout Poetry di v0.1.0 (gap terdokumentasi).
- Penegakan kebijakan lisensi (gate allowlist/denylist) di v0.1.0.
- Hosting atau upload lockfile ke mana pun; semua berjalan lokal.

## 6. User story

- Sebagai agen yang merapikan repo, saya ingin daftar dependency tak terpakai dengan kepastian soal paket tooling.
- Sebagai agen yang menyiapkan CI, saya ingin deklarasi yang hilang sebelum build gagal.
- Sebagai maintainer, saya ingin tabel ringkas paket outdated dan deprecated beserta catatan lisensi.
- Sebagai reviewer keamanan, saya ingin CVE dikenal untuk dependency yang dideklarasikan, ter-pin ke versi terpasang.

## 7. Kebutuhan fungsional

| ID | Kebutuhan |
| --- | --- |
| FR1 | `list_deps` mengembalikan dependency dengan ekosistem, kind (prod/dev/optional/peer), dan range; deklarasi duplikat di-dedupe (first-wins). |
| FR2 | `unused_deps` mencocokkan paket terhadap bare import yang dipindai, sebutan script (npm), daftar tooling, dan alias map PyPI; mengembalikan jumlah diperiksa. |
| FR3 | `missing_deps` mencocokkan import terhadap deklarasi dan stdlib; dikelompokkan per paket dengan hingga 10 file pengimpor. |
| FR4 | `dependency_report` mengambil metadata registry per dependency (konkurensi 6, timeout 8 dtk, limit hasil), menghitung majors tertinggal dari versi lockfile bila ada. |
| FR5 | `vulnerable_deps` mem-batch query OSV per ekosistem, memakai versi lockfile bila ada, melaporkan error tanpa throw. |
| FR6 | Pemindaian import mencakup JS/TS (`import`, side-effect, `export ... from`, dynamic import, `require`) dan Python (`import`, `from ... import`), melewati specifier relatif, builtin `node:`, dan daftar stdlib kurasi. |
| FR7 | Pemindaian melewati `node_modules`, `dist`, output build, virtualenv, cache, dan symlink; file > 1 MB dilewati. |
| FR8 | Baris requirements yang tidak bisa di-parse dan requirement URL/path menghasilkan warning, bukan gagal. |
| FR9 | Output report dibatasi token budget (default ~900) pada batas baris. |
| FR10 | Semua tool MCP ber-annotasi read-only; tool jaringan menyatakan open-world hint dan mengembalikan teks error actionable. |
| FR11 | CLI mencerminkan semua tool dengan `--json`, `--limit`, dan `--budget`; exit code 0/1/2. |

## 8. Kebutuhan non-fungsional

- Node >= 20; dependency runtime hanya MCP SDK dan zod.
- Urutan output deterministik; teks stabil untuk diffing.
- `fetch` injectable untuk setiap panggilan jaringan sehingga seluruh suite berjalan offline dengan HTTP stub.
- Tanpa penulisan ke project yang diaudit; tanpa telemetry.
- Paritas Windows/macOS/Linux (tanpa proses anak sama sekali).

## 9. Metrik sukses

- Diadopsi di workflow maintenance agen (cleanup, upgrade, review).
- Pipeline CI menambahkan `depsaudit` sebagai langkah pra-rilis.
- Issue yang meminta dukungan lockfile dan transitif (validasi roadmap).
- Install npm dan star bertumbuh dari minggu ke minggu.

## 10. Catatan teknis

- Manifest: parse JSON untuk npm; parser baris dengan validasi operator range untuk requirements; ekstraksi array regex untuk `[project]` di pyproject (TOML-lite, terdokumentasi).
- Pemindaian import memakai aturan line-level dengan guard 500 karakter; ekstraksi paket kanonik menangani paket scoped npm dan jalur titik Python.
- Klien registry: `registry.npmjs.org/<pkg>/latest` dan `pypi.org/pypi/<pkg>/json`, dengan fallback classifier lisensi untuk PyPI.
- OSV: `POST /v1/querybatch`, satu request per ekosistem, hasil dipetakan balik berurutan.
- `mapLimit` memberi konkurensi terbatas dengan urutan terjaga; `majorOf` mem-parse major awal dari range dan versi.
- Rendering berbagi token clamp; MCP server dan CLI merender identik.

## 11. Rencana rilis

- **v0.1.0** — lima tool, CLI, parsing manifest, analisis pemakaian, klien registry + OSV, suite 34 test, CI (2026-10-09).
- **v0.2.0** — lockfile pnpm/yarn, layout Poetry, hitungan kerentanan transitif.
- **v0.3.0** — gate kebijakan lisensi, bantuan `--fix`, output SARIF untuk anotasi CI.

## 12. Pertanyaan terbuka

- Perlukah `unused_deps` memberi bobot keyakinan (mis. "hanya disebut di komentar")?
- Perlukah `dependency_report` men-cache respons registry antar-run?
- Perlukah pengecekan missing-deps mempelajari alias lokal project (alias tauri, import map)?
