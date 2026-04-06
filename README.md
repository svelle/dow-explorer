# SGA Browser

A browser-based explorer for **Dawn of War — Soulstorm** `.sga` archives: folder tree, file list, previews (textures, audio, WHM mesh, hex/text), and optional ZIP export of a folder.

The UI is bundled with [Bun](https://bun.sh) from `[js/main.js](js/main.js)` into `[dist/main.js](dist/main.js)`. Legacy parsers and globals (`SGA`, `TGA`, `DDS`, `WhmPreview`, etc.) stay as separate scripts referenced from `[index.html](index.html)`.

## Requirements

- [Bun](https://bun.sh) 1.x (install: see [https://bun.sh/docs/installation](https://bun.sh/docs/installation))

No npm dependencies are required for the scripts in `[package.json](package.json)`.

## Quick start

```bash
git clone <repository-url>
cd dow-sga-browser
bun dev
```

Open [http://127.0.0.1:8080/](http://127.0.0.1:8080/). The dev command runs an initial bundle, starts a file watcher that rebuilds `dist/main.js` when you change files under `js/`, and serves the repo root.

## Scripts


| Command                 | Description                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `bun dev` / `bun start` | Build once, then watch `js/` → `dist/`, and serve on port `8080` (override with `PORT`). |
| `bun run build`         | Production bundle: minified `dist/main.js` + source maps.                                |
| `bun run preview`       | Run `build`, then serve statically (no watch).                                           |


After a fresh clone, `dist/` may be missing until you run `bun dev` or `bun run build`. The app entry in `index.html` is `<script type="module" src="dist/main.js">`.

## Using the app

- **Choose .sga** or **Open .sga** opens the system file picker (or the File System Access API where supported).
- **Drag and drop** `.sga` files onto the page.
- **Recent files** can reopen archives if the browser still has permission (Chromium) or if you have a backend that implements `**GET /api/read-sga?path=…`** for absolute paths stored in recent history.

## Project layout

- `[docs/MODULES.md](docs/MODULES.md)` — module map (what each `js/` file does; for maintainers and agents).
- `js/main.js` — application entry (ES modules under `js/`).
- `js/sga.js`, `js/tga.js`, `js/dds.js`, … — format parsers and preview helpers loaded before the bundle.
- `dist/` — build output (listed in `.gitignore`; generate locally with Bun).
- `dev.ts` — development server + watch.
- `serve.ts` — static server only (used by `bun run preview`).

## Credits

See [ATTRIBUTIONS.md](ATTRIBUTIONS.md) for format references and third-party inspiration.