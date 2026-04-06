"use strict";

import { state } from "../state.js";
import { getActiveArchive } from "../state.js";
import { $, esc } from "../util.js";
import { closePathCrumbPopup, renderPathBar } from "../ui/path-bar.js";
import {
  createKindIconArt,
  extSupportsLazyGridThumb,
  extSupportsLazyWhmGridThumb,
  getFileKindInfo,
} from "./kinds.js";
import {
  ensureGridThumbObserver,
  tearDownGridThumbnails,
} from "./thumbnails.js";
import { renderInspector } from "../ui/inspector.js";
import { loadPreview } from "../preview/index.js";

export function filterText() {
  return ($("filter-input").value || "").trim().toLowerCase();
}

export function filesForView(arch, folderIndex) {
  var files = SGA.listFilesInFolder(arch, folderIndex);
  var ft = filterText();
  if (!ft) return files;
  return files.filter(function (f) {
    return SGA.fileName(arch, f.index).toLowerCase().indexOf(ft) !== -1;
  });
}

export function folderStoredTotal(arch, folderIndex) {
  var files = SGA.listFilesInFolder(arch, folderIndex);
  var t = 0;
  files.forEach(function (f) {
    t += f.compressedSize;
  });
  return t;
}

export function syncFileViewSelection() {
  var fileView = $("file-view");
  if (!fileView) return;
  if (state.viewMode === "list") {
    fileView.querySelectorAll("tbody tr[data-file-index]").forEach(function (tr) {
      var idx = parseInt(tr.dataset.fileIndex, 10);
      var sel = state.selectedFileIndex === idx;
      tr.setAttribute("aria-selected", sel ? "true" : "false");
      if (sel) tr.classList.add("selected");
      else tr.classList.remove("selected");
    });
    return;
  }
  fileView.querySelectorAll(".file-card[data-file-index]").forEach(function (card) {
    var idx = parseInt(card.dataset.fileIndex, 10);
    var sel = state.selectedFileIndex === idx;
    card.setAttribute("aria-selected", sel ? "true" : "false");
    if (sel) card.classList.add("selected");
    else card.classList.remove("selected");
  });
}

export function scrollFileSelectionIntoView() {
  var fv = $("file-view");
  var sel = fv.querySelector(".file-card.selected, tr.selected");
  if (sel) sel.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

export function moveFileSelection(delta) {
  var entry = getActiveArchive();
  if (!entry || !entry.parsed || !state.selection) return;
  var arch = entry.parsed;
  var visible = filesForView(arch, state.selection.folderIndex);
  if (!visible.length) return;
  var idx = -1;
  for (var i = 0; i < visible.length; i++) {
    if (visible[i].index === state.selectedFileIndex) {
      idx = i;
      break;
    }
  }
  var next;
  if (idx < 0) {
    next = delta > 0 ? 0 : visible.length - 1;
  } else {
    next = idx + delta;
    if (next < 0) next = 0;
    if (next >= visible.length) next = visible.length - 1;
    if (next === idx && visible[next].index === state.selectedFileIndex) return;
  }
  state.selectedFileIndex = visible[next].index;
  syncFileViewSelection();
  renderInspector();
  loadPreview();
  $("file-view").focus();
  requestAnimationFrame(scrollFileSelectionIntoView);
}

export function fileSelectionGoEnd(first) {
  var entry = getActiveArchive();
  if (!entry || !entry.parsed || !state.selection) return;
  var arch = entry.parsed;
  var visible = filesForView(arch, state.selection.folderIndex);
  if (!visible.length) return;
  state.selectedFileIndex = visible[first ? 0 : visible.length - 1].index;
  syncFileViewSelection();
  renderInspector();
  loadPreview();
  $("file-view").focus();
  requestAnimationFrame(scrollFileSelectionIntoView);
}

export function renderMain() {
  var pathBar = $("path-bar");
  var summary = $("folder-summary");
  var fileView = $("file-view");
  var entry = getActiveArchive();

  if (!pathBar || !summary || !fileView) return;

  if (!entry || !entry.parsed || !state.selection) {
    closePathCrumbPopup();
    pathBar.textContent = "—";
    summary.textContent = "—";
    tearDownGridThumbnails();
    fileView.innerHTML = "";
    return;
  }

  var arch = entry.parsed;
  renderPathBar(entry, arch);

  var allFiles = SGA.listFilesInFolder(arch, state.selection.folderIndex);
  var visible = filesForView(arch, state.selection.folderIndex);
  var stored = folderStoredTotal(arch, state.selection.folderIndex);
  summary.textContent =
    visible.length +
    (visible.length !== allFiles.length ? " of " + allFiles.length : "") +
    " files • " +
    SGA.formatBytes(stored) +
    " stored";

  tearDownGridThumbnails();
  fileView.className = "file-view " + (state.viewMode === "list" ? "list" : "grid");
  fileView.innerHTML = "";

  if (state.viewMode === "list") {
    var table = document.createElement("table");
    table.className = "file-table";
    table.innerHTML =
      "<thead><tr><th class=\"file-table-icon-col\" aria-label=\"Kind\"></th><th>Name</th><th>Format</th><th>Kind</th><th>Stored</th><th>Raw</th><th>Ratio</th></tr></thead><tbody></tbody>";
    var tb = table.querySelector("tbody");
    visible.forEach(function (f) {
      var tr = document.createElement("tr");
      tr.setAttribute("role", "option");
      tr.dataset.fileIndex = String(f.index);
      var sel = state.selectedFileIndex === f.index;
      tr.setAttribute("aria-selected", sel ? "true" : "false");
      if (sel) tr.classList.add("selected");
      var name = SGA.fileName(arch, f.index);
      var kind = getFileKindInfo(name);
      var contentKind = FileKindIcons.getContentKindFromExt(kind.ext);
      tr.innerHTML =
        "<td class=\"file-table-icon-cell\"><span class=\"file-kind-icon\" title=\"" +
        esc(FileKindIcons.kindLabel(contentKind)) +
        "\">" +
        FileKindIcons.getSvgHtml(contentKind) +
        "</span></td><td>" +
        esc(name) +
        "</td><td>" +
        esc(kind.label) +
        "</td><td>" +
        esc(kind.kind) +
        "</td><td>" +
        SGA.formatBytes(f.compressedSize) +
        "</td><td>" +
        SGA.formatBytes(f.decompressedSize) +
        "</td><td>" +
        SGA.compressionRatio(f.compressedSize, f.decompressedSize) +
        "</td>";
      tr.addEventListener("click", function () {
        state.selectedFileIndex = f.index;
        syncFileViewSelection();
        renderInspector();
        loadPreview();
      });
      tb.appendChild(tr);
    });
    fileView.appendChild(table);
    return;
  }

  visible.forEach(function (f) {
    var card = document.createElement("div");
    var sel = state.selectedFileIndex === f.index;
    card.className = "file-card file-card--tile" + (sel ? " selected" : "");
    card.setAttribute("role", "option");
    card.dataset.fileIndex = String(f.index);
    card.setAttribute("aria-selected", sel ? "true" : "false");
    var name = SGA.fileName(arch, f.index);
    var kind = getFileKindInfo(name);
    var contentKind = FileKindIcons.getContentKindFromExt(kind.ext);

    var preview = document.createElement("div");
    preview.className = "file-card-preview file-card-preview--kind-" + contentKind;

    var badge = document.createElement("span");
    badge.className = "file-card-preview-badge";
    badge.setAttribute("data-ext", kind.ext || "");
    badge.textContent = kind.label;
    badge.title = "." + (kind.ext || "") + " — " + kind.kind;

    preview.appendChild(badge);

    var extLower = (kind.ext || "").toLowerCase();
    var lazyWhm = extLower === "whm" && extSupportsLazyWhmGridThumb();
    var lazyThumb = extSupportsLazyGridThumb(extLower) || lazyWhm;
    if (lazyThumb) {
      preview.classList.add("file-card-preview--has-thumb");
      preview.dataset.lazyThumb = "1";
      preview.dataset.archiveId = entry.id;
      preview.dataset.fileIndex = String(f.index);
      preview.dataset.ext = kind.ext || "";
      if (lazyWhm) preview.dataset.lazyWhm = "1";

      var thumbImg = document.createElement("img");
      thumbImg.className = "file-card-thumb";
      thumbImg.alt = "";
      thumbImg.hidden = true;
      thumbImg.decoding = "async";
      preview.appendChild(thumbImg);
      preview.appendChild(createKindIconArt(contentKind));
    } else {
      preview.appendChild(createKindIconArt(contentKind));
    }

    var meta = document.createElement("div");
    meta.className = "file-card-meta";

    var divN = document.createElement("div");
    divN.className = "file-card-name";
    divN.textContent = name;
    divN.title = name + "\n" + kind.kind;

    var divS = document.createElement("div");
    divS.className = "file-card-size";
    divS.textContent = SGA.formatBytes(f.compressedSize);

    meta.appendChild(divN);
    meta.appendChild(divS);
    card.appendChild(preview);
    card.appendChild(meta);
    card.addEventListener("click", function () {
      state.selectedFileIndex = f.index;
      syncFileViewSelection();
      renderInspector();
      loadPreview();
    });
    fileView.appendChild(card);
  });

  ensureGridThumbObserver();
  fileView.querySelectorAll("[data-lazy-thumb=\"1\"]").forEach(function (preview) {
    if (state.gridThumbObserver) state.gridThumbObserver.observe(preview);
  });
}
