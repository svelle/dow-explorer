# Attributions and credits

This project implements several **Dawn of War / Relic Entertainment** formats in the browser. The implementations are original JavaScript, but they lean on public reverse‑engineering work, reference tools, and format documentation. The following projects and resources were especially helpful as **inspiration** or **cross‑checks** (not as bundled dependencies).

---

## Archives (`.sga`)

- **[MAK–Relic–Tool](https://github.com/MAK-Relic-Tool)** — Ecosystem of tools and libraries for Relic-era archives and assets. The SGA v2 reader in this repo’s `js/sga.js` aligns with the same on-disk layout and conventions (e.g. TOC at `0xB4`, header fields around `0xAC` / `0xB0`) documented in that community and related tooling.
- **Related:** [SGA-V2](https://github.com/MAK-Relic-Tool/SGA-V2) (read/write SGA v2).

---

## FDA audio preview (`.fda`)

- **[vgmstream](https://github.com/vgmstream/vgmstream)** — Game audio library. The FDA decoder in `js/fda.js` follows the same ideas as vgmstream’s `meta/fda.c` and the Relic transform codec in `coding/libs/relic_lib.c` (DCT + mixed-radix FFT, frame layout, and decoding flow).

---

## WHM mesh preview (`.whm`) and Relic Chunky

- **[blender_dow](https://github.com/amorgun/blender_dow)** (Alexander Morgun) — Blender add-on for importing Dawn of War assets.  
  - **`chunky.py`** — Chunk header layout (8-byte `typeid`, version, size, name) and `skip_relic_chunky()` behaviour informed `js/chunky.js`.  
  - **`CH_FOLDMSLC` / `importer.py`** — Mesh slice layout (`FOLDMSGR` → `FOLDMSLC` → `DATADATA`, vertex streams, materials, index order) informed `js/whm.js`.

- **Three.js** — [three.js](https://threejs.org/) (via CDN) is used only for **WebGL preview** in `js/whm-preview.js` (scene, lights, `BufferGeometry`). It is not a format parser.

---

## Image previews

### DDS (`.dds`)

- Decoding in `js/dds.js` is based on **public** descriptions of the **DirectDraw Surface** layout and **BC/DXT** block compression (DXT1/DXT3/DXT5, DXGI-style extended headers).  
- Useful references include Microsoft’s DDS documentation and the **Khronos** block-compressed texture overview.

### TGA (`.tga`)

- `js/tga.js` is a small decoder for common **uncompressed / RLE RGB** TGA variants used in game data.  
- Behaviour is aligned with the classic **Truevision TGA** file description (image types 2 and 10, 24/32 bpp).

---

## UI icons

- **`js/file-kind-icons.js`** — Inline SVG icons follow a **Material-style** glyph vocabulary (similar in spirit to [Google Material Symbols](https://fonts.google.com/icons) / Material Design iconography). Paths are embedded in the project; they are not pulled from a runtime package.

---

## Disclaimer

- **Relic Entertainment**, **Dawn of War**, and related names are trademarks of their respective owners. This project is an independent fan/tooling effort and is not affiliated with or endorsed by Relic or Microsoft.
- Credits here are for **recognition and traceability**; refer to each project’s own license for redistribution terms if you reuse their code or assets directly.
