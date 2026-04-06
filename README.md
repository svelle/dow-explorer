# SGA Browser

A browser-based explorer for **Dawn of War — Soulstorm** `.sga` archives: folder tree, file list, previews (textures, audio, WHM mesh, hex/text), and optional ZIP export of a folder.

<img width="2253" height="1267" alt="image" src="https://github.com/user-attachments/assets/49b5c99d-78fb-44b0-b0c2-42475b3372bd" />

<img width="2251" height="1269" alt="image" src="https://github.com/user-attachments/assets/96c096c0-c703-432d-a64e-880479c36052" />

<img width="2250" height="1268" alt="image" src="https://github.com/user-attachments/assets/d959aeae-7b3b-4c4f-b859-b86239755bce" />

<img width="2253" height="1264" alt="image" src="https://github.com/user-attachments/assets/5819e077-6a4e-4bec-a14c-ee6efc7c8a7f" />

**Live site:** [https://svelle.github.io/dow-explorer/](https://svelle.github.io/dow-explorer/)


## Using the app

- **Choose .sga** or **Open .sga** opens the system file picker (or the File System Access API where supported). If picking files fails in a restricted context, the app falls back to a classic file input.
- **Drag and drop** `.sga` files onto the page.

*You will need to add multiple files to make models load their corresponding textures. Easiest is just to load all .sga files and then remove the _low and _med archives.*

## Preview support

The preview panel picks a viewer by **file extension** (see `js/preview/index.js`).

**Structured / media**

| Extension | Preview |
| --- | --- |
| `.whm` | 3D mesh (WebGL / Three.js), materials and animation controls |
| `.rgd` | Parsed game-data tree |
| `.wtp` | Team colour texture |
| `.ucs` | Localization string table |
| `.whe` | Relic Chunky file tree |
| `.fda` | Audio (decoded to WAV for the built-in player) |
| `.rsh` | Shader / embedded texture (DDS path when present) |
| `.tga`, `.dds` | Decoded image |

**Text**

Readable **UTF-8** with line numbers (large files are truncated): `.lua`, `.scar`, `.events`, `.sgb`, `.ai`, `.nis`, `.teamcolour`, `.rml`, `.txt`, `.md`, `.xml`, `.csv`, `.json`, `.html`, `.glsl`, `.hlsl`, `.cs`, `.cpp`, `.h`. Other files may still open as text if the first bytes look like plain ASCII/UTF-8.

**Fallback**

Everything else shows a **hex** preview (first part of the file). That includes formats you might expect in data archives but that are not decoded yet—for example **`.ogg`**, **`.wav`**, **`.mp3`**, or typical web rasters like **`.png`** / **`.jpg`**.

The UI is bundled with [Bun](https://bun.sh): `[js/three-global.js](js/three-global.js)` → `dist/three-global.js` (sets `globalThis.THREE` from the [`three`](https://www.npmjs.com/package/three) package), and `[js/main.js](js/main.js)` → `dist/main.js`. Legacy parsers and other globals (`SGA`, `TGA`, `DDS`, `WhmPreview`, etc.) stay as separate scripts in `[index.html](index.html)`.

## Requirements

- [Bun](https://bun.sh) 1.x (install: see [https://bun.sh/docs/installation](https://bun.sh/docs/installation))

The only listed dependency is **`three`** (Three.js), used for the WHM WebGL preview; install with `bun install` if needed.

## Quick start

```bash
git clone <repository-url>
cd dow-sga-browser
bun install
bun dev
```

Open [http://127.0.0.1:8080/](http://127.0.0.1:8080/). The dev command runs initial bundles, starts watchers that rebuild `dist/three-global.js` and `dist/main.js` when sources change, and serves the repo root.

## Scripts


| Command                 | Description                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `bun dev` / `bun start` | Build `three-global` + app once, watch both into `dist/`, serve on `8080` (`PORT`).      |
| `bun run build`         | Production bundles: minified `dist/three-global.js`, `dist/main.js`, and source maps.   |
| `bun run preview`       | Run `build`, then serve statically (no watch).                                           |


After a fresh clone, `dist/` may be missing until you run `bun dev` or `bun run build`. `index.html` loads `dist/three-global.js` (Three.js) before `whm-preview.js`, then `dist/main.js`.

## Project layout

- `[docs/MODULES.md](docs/MODULES.md)` — module map (what each `js/` file does; for maintainers and agents).
- `js/three-global.js` — Bun entry that re-exports Three.js as `globalThis.THREE` for classic scripts.
- `js/main.js` — application entry (ES modules under `js/`).
- `js/sga.js`, `js/tga.js`, `js/dds.js`, … — format parsers and preview helpers loaded before the bundle.
- `dist/` — build output (listed in `.gitignore`; generate locally with Bun).
- `dev.ts` — development server + watch.
- `serve.ts` — static server only (used by `bun run preview`).

## Credits

See [ATTRIBUTIONS.md](ATTRIBUTIONS.md) for format references and third-party inspiration.
