"use strict";

import { state } from "../state.js";
import { getActiveArchive } from "../state.js";
import { $, esc } from "../util.js";
import {
  applyFilterAutoExpand,
  buildFolderParentMap,
  buildTreeFlatRows,
  treeFlatRowMatchesSelection,
} from "./flatten.js";
import { openTreeContextMenu } from "./context-menu.js";

export var TREE_ROW_HEIGHT = 28;

function labelWithHighlights(text, ranges) {
  if (!ranges || !ranges.length) return esc(text);
  var out = "";
  var i = 0;
  ranges.forEach(function (r) {
    var a = r[0];
    var b = r[1];
    if (a > i) out += esc(text.slice(i, a));
    out += "<span class=\"tree-label-match\">" + esc(text.slice(a, b)) + "</span>";
    i = b;
  });
  if (i < text.length) out += esc(text.slice(i));
  return out;
}

function renderTreeRowNode(arch, entry, row) {
  var rowEl = document.createElement("div");
  rowEl.className = "tree-row";
  rowEl.style.paddingLeft = 0.35 + row.depth * 0.65 + "rem";
  rowEl.dataset.section = String(row.sectionIndex);
  rowEl.dataset.folder = String(row.folderIndex);
  rowEl.style.height = TREE_ROW_HEIGHT + "px";
  if (row.kind === "section") rowEl.classList.add("tree-row--section");
  if (row.isLeaf && row.kind !== "section") rowEl.classList.add("tree-row--leaf");
  if (row.chainFolderIndices && row.chainFolderIndices.length > 1) {
    rowEl.classList.add("tree-row--chain");
    rowEl.dataset.chain = row.chainFolderIndices.join(",");
  }

  var chev = document.createElement("span");
  chev.className = "tree-chevron";
  if (row.kind === "section") {
    if (row.hasChildren) {
      chev.textContent = state.lastTreeEffectiveExpanded.has(row.expandKey) ? "▼" : "▶";
    } else {
      chev.className += " leaf";
      chev.textContent = "·";
    }
  } else if (row.hasChildren) {
    chev.textContent = state.lastTreeEffectiveExpanded.has(row.expandKey) ? "▼" : "▶";
  } else {
    chev.className += " leaf";
    chev.textContent = "·";
  }

  var wrap = document.createElement("div");
  wrap.className = "tree-label-wrap";
  var lab = document.createElement("span");
  lab.className =
    "tree-label-primary" +
    (row.chainFolderIndices && row.chainFolderIndices.length > 1 ? " tree-label--chain" : "");
  lab.innerHTML = labelWithHighlights(row.shortName || row.label, row.highlights);
  if (row.chainFolderIndices && row.chainFolderIndices.length > 1) {
    lab.title = row.chainFolderIndices
      .map(function (fi) {
        return SGA.folderPath(arch, fi);
      })
      .join("\n");
  } else {
    lab.title = SGA.folderPath(arch, row.folderIndex);
  }
  wrap.appendChild(lab);
  if (row.fileCount > 0) {
    var cnt = document.createElement("span");
    cnt.className = "tree-label-count";
    cnt.textContent = String(row.fileCount);
    wrap.appendChild(cnt);
  }

  rowEl.appendChild(chev);
  rowEl.appendChild(wrap);
  rowEl.setAttribute("role", "treeitem");
  rowEl.dataset.expandKey = row.expandKey || "";

  rowEl.addEventListener("click", function (e) {
    if (e.target === chev) return;
    state.selection = { sectionIndex: row.sectionIndex, folderIndex: row.folderIndex };
    state.selectedFileIndex = null;
    renderTree();
    Promise.all([import("../files/view.js"), import("../ui/inspector.js")]).then(function (mods) {
      mods[0].renderMain();
      mods[1].renderInspector();
    });
  });
  chev.addEventListener("click", function (e) {
    e.stopPropagation();
    if (!row.expandKey) return;
    if (state.expanded.has(row.expandKey)) state.expanded.delete(row.expandKey);
    else state.expanded.add(row.expandKey);
    renderTree();
  });

  rowEl.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    state.selection = { sectionIndex: row.sectionIndex, folderIndex: row.folderIndex };
    state.selectedFileIndex = null;
    state.treeContextTarget = { sectionIndex: row.sectionIndex, folderIndex: row.folderIndex };
    paintTreeVirtualRows();
    Promise.all([import("../files/view.js"), import("../ui/inspector.js")]).then(function (mods) {
      mods[0].renderMain();
      mods[1].renderInspector();
    });
    openTreeContextMenu(e.clientX, e.clientY);
  });

  return rowEl;
}

export function paintTreeVirtualRows() {
  var container = $("tree-container");
  var scroll = $("tree-virt-scroll");
  var pad = $("tree-virt-pad");
  if (!container || !scroll || !pad) return;
  var rows = state.lastTreeFlatRows;
  var entry = getActiveArchive();
  if (!entry || !entry.parsed) return;
  var arch = entry.parsed;
  var totalH = rows.length * TREE_ROW_HEIGHT;
  pad.style.minHeight = totalH + "px";
  var st = scroll.scrollTop;
  var ch = scroll.clientHeight || 400;
  var start = Math.floor(st / TREE_ROW_HEIGHT);
  var end = Math.min(rows.length, start + Math.ceil(ch / TREE_ROW_HEIGHT) + 4);
  var topPad = start * TREE_ROW_HEIGHT;
  var botPad = Math.max(0, (rows.length - end) * TREE_ROW_HEIGHT);
  pad.style.paddingTop = topPad + "px";
  pad.style.paddingBottom = botPad + "px";
  pad.innerHTML = "";
  for (var i = start; i < end; i++) {
    pad.appendChild(renderTreeRowNode(arch, entry, rows[i]));
  }
  highlightTreeSelection(container);
}

export function schedulePaintTreeVirtual() {
  if (state.treeVirtualScrollPending) return;
  state.treeVirtualScrollPending = true;
  requestAnimationFrame(function () {
    state.treeVirtualScrollPending = false;
    paintTreeVirtualRows();
  });
}

export function highlightTreeSelection(container) {
  container.querySelectorAll(".tree-row.selected").forEach(function (n) {
    n.classList.remove("selected");
  });
  if (!state.selection) return;
  var sel = container.querySelector(
    '.tree-row[data-section="' + state.selection.sectionIndex + '"][data-folder="' + state.selection.folderIndex + '"]'
  );
  if (!sel) {
    var rows = container.querySelectorAll(".tree-row[data-chain]");
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.dataset.section !== String(state.selection.sectionIndex)) continue;
      var parts = (r.dataset.chain || "").split(",");
      if (parts.indexOf(String(state.selection.folderIndex)) >= 0) {
        sel = r;
        break;
      }
    }
  }
  if (sel) sel.classList.add("selected");
}

export function scrollTreeSelectionIntoView() {
  var scroll = $("tree-virt-scroll");
  if (!state.selection || !scroll) return;
  var idx = -1;
  for (var i = 0; i < state.lastTreeFlatRows.length; i++) {
    if (treeFlatRowMatchesSelection(state.lastTreeFlatRows[i], state.selection)) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return;
  var top = idx * TREE_ROW_HEIGHT;
  var bot = top + TREE_ROW_HEIGHT;
  var st = scroll.scrollTop;
  var ch = scroll.clientHeight;
  if (top < st || bot > st + ch) {
    scroll.scrollTop = Math.max(0, top - TREE_ROW_HEIGHT * 2);
    schedulePaintTreeVirtual();
  }
}

export function renderTree() {
  var container = $("tree-container");
  var filterInput = $("tree-filter-input");
  var filter = filterInput ? filterInput.value.trim() : "";
  var entry = getActiveArchive();

  if (!container) return;
  if (!entry || !entry.parsed) {
    container.innerHTML = "";
    container.textContent = entry && entry.error ? entry.error : "Open an .sga file";
    state.lastTreeFlatRows = [];
    return;
  }

  if (!entry.folderParent) {
    entry.folderParent = buildFolderParentMap(entry.parsed);
  }

  var arch = entry.parsed;
  state.lastTreeEffectiveExpanded = new Set(state.expanded);
  if (filter) {
    applyFilterAutoExpand(arch, entry, filter, state.lastTreeEffectiveExpanded);
  }

  state.lastTreeFlatRows = buildTreeFlatRows(arch, entry, filter, state.lastTreeEffectiveExpanded);

  if (filter && state.lastTreeFlatRows.length && state.selection) {
    var found = false;
    for (var fi = 0; fi < state.lastTreeFlatRows.length; fi++) {
      if (treeFlatRowMatchesSelection(state.lastTreeFlatRows[fi], state.selection)) {
        found = true;
        break;
      }
    }
    if (!found) {
      var r0 = state.lastTreeFlatRows[0];
      state.selection = { sectionIndex: r0.sectionIndex, folderIndex: r0.folderIndex };
      state.selectedFileIndex = null;
    }
  }

  var prevScroll = $("tree-virt-scroll");
  var savedScrollTop = prevScroll ? prevScroll.scrollTop : 0;

  container.innerHTML = "";
  var scroll = document.createElement("div");
  scroll.className = "tree-virt-scroll";
  scroll.id = "tree-virt-scroll";
  var pad = document.createElement("div");
  pad.className = "tree-virt-pad";
  pad.id = "tree-virt-pad";
  scroll.appendChild(pad);
  container.appendChild(scroll);

  var totalPadH = state.lastTreeFlatRows.length * TREE_ROW_HEIGHT;
  pad.style.minHeight = totalPadH + "px";
  scroll.scrollTop = savedScrollTop;
  paintTreeVirtualRows();

  scroll.onscroll = function () {
    schedulePaintTreeVirtual();
  };
}
