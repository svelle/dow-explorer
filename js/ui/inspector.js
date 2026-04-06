"use strict";

import { state } from "../state.js";
import { getActiveArchive } from "../state.js";
import { $, esc, formatHex } from "../util.js";
import { setPreviewTextMode } from "../preview/text.js";
import { loadPreview } from "../preview/index.js";

export function renderInspector() {
  var insp = $("inspector");
  var btnE = $("btn-extract");
  var btnH = $("btn-hex");
  var entry = getActiveArchive();

  if (!entry || !entry.parsed || state.selection == null || state.selectedFileIndex == null) {
    insp.innerHTML = "<p class=\"muted\">No file selected</p>";
    setPreviewTextMode("Select a file");
    btnE.disabled = true;
    btnH.disabled = true;
    state.cachedPreview = null;
    return;
  }

  var arch = entry.parsed;
  var f = arch.files[state.selectedFileIndex];
  if (!f) {
    insp.innerHTML = "<p class=\"muted\">Invalid file</p>";
    setPreviewTextMode("—");
    return;
  }

  var name = SGA.fileName(arch, f.index);
  var full = SGA.fileFullPath(arch, state.selection.folderIndex, f.index);
  var compLabel =
    f.compressedSize === f.decompressedSize ? "stored" : "zlib";

  btnE.disabled = false;
  btnH.disabled = false;

  insp.innerHTML =
    "<dl>" +
    "<dt>Name</dt><dd>" +
    esc(name) +
    "</dd>" +
    "<dt>Path</dt><dd>" +
    esc(full) +
    "</dd>" +
    "<dt>Archive</dt><dd>" +
    esc(entry.label) +
    "</dd>" +
    "<dt>Stored</dt><dd>" +
    SGA.formatBytes(f.compressedSize) +
    " (" +
    esc(compLabel) +
    ")</dd>" +
    "<dt>Raw</dt><dd>" +
    SGA.formatBytes(f.decompressedSize) +
    "</dd>" +
    "<dt>Ratio</dt><dd>" +
    SGA.compressionRatio(f.compressedSize, f.decompressedSize) +
    "</dd>" +
    "<dt>CRC32</dt><dd id=\"crc-field\">…</dd>" +
    "<dt>Offset</dt><dd>0x" +
    (arch.dataOffset + f.dataOffsetRel).toString(16).toUpperCase().padStart(8, "0") +
    "</dd></dl>";

  loadPreview();
}

export async function onExtract() {
  var entry = getActiveArchive();
  if (!entry || !entry.parsed || state.selection == null || state.selectedFileIndex == null) return;
  var arch = entry.parsed;
  var f = arch.files[state.selectedFileIndex];
  try {
    var data = await SGA.readFileData(arch, f);
    var name = SGA.fileName(arch, f.index);
    var blob = new Blob([data], { type: "application/octet-stream" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    alert("Extract failed: " + (e && e.message ? e.message : e));
  }
}

export async function onHex() {
  var entry = getActiveArchive();
  if (!entry || !entry.parsed || state.selection == null || state.selectedFileIndex == null) return;
  var arch = entry.parsed;
  var f = arch.files[state.selectedFileIndex];
  var modal = $("hex-modal");
  var body = $("hex-body");
  var title = $("hex-title");
  title.textContent = SGA.fileName(arch, f.index);
  body.textContent = "Loading…";
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  try {
    var data = state.cachedPreview;
    if (!data) data = await SGA.readFileData(arch, f);
    var max = 65536;
    body.textContent = formatHex(data, max);
  } catch (e) {
    body.textContent = String(e && e.message ? e.message : e);
  }
}

export function closeHex() {
  var modal = $("hex-modal");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}
