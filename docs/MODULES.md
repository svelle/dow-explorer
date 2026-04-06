# Module map (for maintainers and agents)

The app **source** lives under [`js/`](../js/). [`index.html`](../index.html) loads **legacy/global scripts** first (parsers, Three.js, fflate), then **`dist/main.js`**, which is produced by **`bun build js/main.js`** (see [`package.json`](../package.json)). This document describes **roles and dependencies at the source level**, not the minified bundle.

---

## Entry and shared core

| Path | Role |
|------|------|
| [`js/main.js`](../js/main.js) | **Application entry**: `init()` wires DOM events (splash, file picker, filters, tree/file keyboard, theme, sidebar, preview buttons, drag-and-drop). Calls `setRenderMainForPathBar(renderMain)` so the path bar can trigger `renderMain` without importing `files/view.js` (avoids a circular dependency). |
| [`js/state.js`](../js/state.js) | **`state`** — shared mutable object: `archives`, `activeArchiveId`, `selection`, `selectedFileIndex`, `viewMode`, `expanded`, preview/grid/tree fields, `pathCrumbPopupClose`, etc. Exports **`getActiveArchive()`**. |
| [`js/util.js`](../js/util.js) | **`$`**, **`uid`**, **`basename`**, **`esc`**, **`formatHex`**, **`readFileAsArrayBuffer`**. Small DOM and string helpers used across the app. |

---

## `js/archive/` — opening archives and recents

| Path | Role |
|------|------|
| [`handles.js`](../js/archive/handles.js) | **IndexedDB** helpers: `idbOpen`, `saveHandle`, `loadHandle`, `deleteHandle` — stores `FileSystemHandle` ids for Chromium “recent” reopen. Constants: DB name and object store name (local to this file). |
| [`recent.js`](../js/archive/recent.js) | **Recent list** in `localStorage`: `loadRecentRaw`, `rememberRecent`, `removeRecent`, `renderRecent`, `openRecentEntry`. Imports `addArchiveFromBuffer` / `pathFromFile` from `open.js`. |
| [`open.js`](../js/archive/open.js) | **`addArchiveFromBuffer`**, **`pickSgaFiles`** (File System Access API or fallback `<input type=file>`), **`onOpenFiles`**, **`pathFromFile`**. Orchestrates first-load UI: `renderArchives`, `renderTree`, `renderMain`, `renderInspector`, `updateSplash`, `renderRecent`. |
| [`dnd.js`](../js/archive/dnd.js) | **`setupDragAndDrop`** — window `dragover` / `drop` / `dragleave` to add archives from dropped files or handles. |

---

## `js/preview/` — file preview pane

| Path | Role |
|------|------|
| [`index.js`](../js/preview/index.js) | **`loadPreview`** — reads selected file, dispatches to TGA/DDS/RSH/FDA/WHM/text/hex paths. **`setPreviewAudioFromBlob`**, **`setPreviewImageFromBlob`**, **`setPreviewImageFromCanvas`** — call **`clearPreview()`** then apply. Re-exports **`clearPreview`**, **`setupPreviewAudio`**, **`setPreviewTextMode`**, **`setPreviewWhm`**. |
| [`clear.js`](../js/preview/clear.js) | **`clearPreview()`** — revokes object URLs, `disposeAudioUi`, `disposeImageUi`, `disposeWhm`, `hidePreviewWhmWrap`, resets audio/text/image DOM to a neutral state. |
| [`audio.js`](../js/preview/audio.js) | Preview **audio** (FDA/WAV path): `disposeAudioUi`, `applyPreviewAudioFromBlob`, **`setupPreviewAudio`** (play/pause/seek/volume listeners). Uses `state.previewAudioSeekDragging`. |
| [`image.js`](../js/preview/image.js) | Preview **raster** from blob or canvas: `disposeImageUi`, `applyPreviewImageFromBlob`, `applyPreviewImageFromCanvas`. |
| [`text.js`](../js/preview/text.js) | **`setPreviewTextMode`** — text, hex dump, or line-numbered text; calls **`clearPreview`** first. |
| [`whm.js`](../js/preview/whm.js) | **`setPreviewWhm`**, **`resolveWhmTextureFile`** (find `.rsh` across loaded archives), **`disposeWhm`**, `hidePreviewWhmWrap`. Relies on global **`WhmPreview`** / **`WHM`**. |

---

## `js/tree/` — folder tree, virtualization, keyboard

| Path | Role |
|------|------|
| [`flatten.js`](../js/tree/flatten.js) | **Pure tree data**: `folderKey`, `buildFolderParentMap`, **`expandAllTreeFolders`** (mutates `state.expanded`), fuzzy match/highlight helpers, `applyFilterAutoExpand`, `compressSingleChildChain`, `treeFlatRowMatchesSelection`, **`buildTreeFlatRows`**. |
| [`render.js`](../js/tree/render.js) | **`renderTree`**, virtualized **`paintTreeVirtualRows`**, **`schedulePaintTreeVirtual`**, **`highlightTreeSelection`**, **`scrollTreeSelectionIntoView`**, `TREE_ROW_HEIGHT`, internal **`renderTreeRowNode`** / **`labelWithHighlights`**. Imports **`openTreeContextMenu`** from `context-menu.js`. Uses dynamic `import()` for `renderMain` / `renderInspector` on row click to avoid cycles. |
| [`virtual.js`](../js/tree/virtual.js) | Thin **re-export** of `paintTreeVirtualRows` and `schedulePaintTreeVirtual` from `render.js` (layout compatibility). |
| [`keyboard.js`](../js/tree/keyboard.js) | Tree **keyboard**: `getCurrentTreeFlatRow`, `moveTreeSelection`, `treeToggleExpandForRow`, `treeExpandRowIfCollapsed`, `treeCollapseRowIfExpanded`. |
| [`context-menu.js`](../js/tree/context-menu.js) | **Right-click menu**: `openTreeContextMenu`, `collectFolderFilesRecursive`, `expandAllUnderFolder`, `collapseAllUnderFolder`, ZIP extract via **fflate**. Imports **`togglePinForTarget`** from `ui/pins.js`. |

---

## `js/files/` — file grid/list and thumbnails

| Path | Role |
|------|------|
| [`kinds.js`](../js/files/kinds.js) | **`getFileKindInfo`**, **`mimeForRasterExt`**, **`extSupportsLazyGridThumb`**, **`createKindIconArt`** — extension badges and lazy-thumb eligibility. Uses global **`FileKindIcons`**. |
| [`thumbnails.js`](../js/files/thumbnails.js) | **Grid lazy thumbnails**: `IntersectionObserver`, **`loadGridThumbnailForPreview`**, **`thumbCanvasToBlob`**, **`tearDownGridThumbnails`**, **`ensureGridThumbObserver`**. |
| [`view.js`](../js/files/view.js) | **`renderMain`** (grid/list), **`filesForView`**, **`filterText`**, **`folderStoredTotal`**, **`syncFileViewSelection`**, **`scrollFileSelectionIntoView`**, **`moveFileSelection`**, **`fileSelectionGoEnd`**. Imports path bar and preview `loadPreview`. |

---

## `js/ui/` — chrome around the archive view

| Path | Role |
|------|------|
| [`splash.js`](../js/ui/splash.js) | **`updateSplash`** (splash vs app-root visibility), **`renderArchives`** (archive tabs + `renderPins`). |
| [`path-bar.js`](../js/ui/path-bar.js) | **`renderPathBar`**, **`closePathCrumbPopup`**, **`setRenderMainForPathBar`** — breadcrumb navigation; `renderMain` injected to avoid importing `files/view.js`. |
| [`pins.js`](../js/ui/pins.js) | **Pinned folders** (`localStorage`), `archiveStorageKey`, `pinKey`, `loadPinsRaw`, `savePinsRaw`, `isFolderPinned`, **`togglePinForTarget`**, **`renderPins`**. Pin navigation uses **dynamic `import()`** of `tree/render`, `files/view`, `ui/inspector` to avoid circular imports. |
| [`theme.js`](../js/ui/theme.js) | **Palette / appearance**: `readPaletteAppearance`, `resolveThemeId`, `setDataThemeFromId`, `syncThemeControls`, `applyPaletteAppearance`, legacy key migration. |
| [`sidebar-resize.js`](../js/ui/sidebar-resize.js) | **Right** sidebar width: `loadSidebarWidth`, `applySidebarWidth`, **`setupSidebarResize`** (drag handle). |
| [`sidebar-left.js`](../js/ui/sidebar-left.js) | **Left** folder panel collapse: `applySidebarLeftCollapsed`, exports **`LS_SIDEBAR_LEFT_COLLAPSED`**. |
| [`inspector.js`](../js/ui/inspector.js) | **`renderInspector`**, **`onExtract`**, **`onHex`**, **`closeHex`** — metadata panel and hex modal. |

---

## Global / pre-bundle scripts (`index.html` order)

These are **not** part of the ES module graph; they attach globals used by the bundle and by each other.

| Path | Role |
|------|------|
| `fflate` (CDN UMD) | ZIP sync for folder extract (`fflate.zipSync`). |
| [`js/sga.js`](../js/sga.js) | **SGA** archive parser and file API — **`SGA`** global. |
| [`js/file-kind-icons.js`](../js/file-kind-icons.js) | **`FileKindIcons`** — SVG icons and content-kind from extension. |
| [`js/tga.js`](../js/tga.js) | **TGA** decode → canvas — **`TGA`** global. |
| [`js/dds.js`](../js/dds.js) | **DDS** decode — **`DDS`** global. |
| [`js/fda.js`](../js/fda.js) | **FDA** audio decode — **`FDA`** global. |
| [`js/chunky.js`](../js/chunky.js) | Relic **Chunky** helpers — **`Chunky`** global (e.g. RSH path). |
| [`js/rsh.js`](../js/rsh.js) | **RSH** preview / DDS extraction — **`RSH`** global. |
| [`js/whm.js`](../js/whm.js) | **WHM** mesh parsing — **`WHM`** global. |
| `three` (CDN) | **`THREE`** for WHM WebGL preview. |
| [`js/whm-preview.js`](../js/whm-preview.js) | **`WhmPreview`** — loads WHM into canvas + sidebar UI. |

---

## Repo scripts (not under `js/`)

| Path | Role |
|------|------|
| [`dev.ts`](../dev.ts) | **Dev server**: initial `bun build`, **`bun build --watch`**, static `Bun.serve` on port 8080. |
| [`serve.ts`](../serve.ts) | **Static server only** — used after `bun run build` / `bun run preview`. |

---

## Circular-import patterns to preserve

- **`ui/path-bar.js`** ↔ **`files/view.js`**: path bar calls **`renderMain`** via **`setRenderMainForPathBar`** set from `main.js`, not a direct import of `view.js`.
- **`tree/render.js`** ↔ **`tree/context-menu.js`**: `render` imports `openTreeContextMenu`; context menu imports `renderTree`. ES module live bindings usually tolerate this if nothing runs at module top level.
- **`archive/open.js`** ↔ **`archive/recent.js`**: `open` ↔ `recent` for `rememberRecent` / `addArchiveFromBuffer`; keep as function bodies only, no top-level calls.

---

## Related docs

- [README.md](../README.md) — how to run and build  
- [ATTRIBUTIONS.md](../ATTRIBUTIONS.md) — format credits  
