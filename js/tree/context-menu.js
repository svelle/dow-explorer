"use strict";

import { state } from "../state.js";
import { getActiveArchive } from "../state.js";
import { $ } from "../util.js";
import { folderKey } from "./flatten.js";
import { renderTree } from "./render.js";
import { isFolderPinned, togglePinForTarget } from "../ui/pins.js";

export function collectFolderFilesRecursive(arch, folderIndex, pathPrefix) {
  var out = [];
  SGA.listFilesInFolder(arch, folderIndex).forEach(function (f) {
    var name = SGA.fileName(arch, f.index);
    out.push({ rel: pathPrefix + name, file: f });
  });
  SGA.childFolderIndices(arch, folderIndex).forEach(function (c) {
    var sn = SGA.folderShortName(arch, c);
    out = out.concat(collectFolderFilesRecursive(arch, c, pathPrefix + sn + "/"));
  });
  return out;
}

export function expandAllUnderFolder(arch, si, fi) {
  var sec = arch.sections[si];
  var root = sec.rootFolder;
  state.expanded.add("s" + si);
  function walk(fidx) {
    var kids = SGA.childFolderIndices(arch, fidx);
    if (!kids.length) return;
    if (fidx !== root) state.expanded.add(folderKey(si, fidx));
    kids.forEach(walk);
  }
  walk(fi);
}

export function collapseAllUnderFolder(arch, si, fi) {
  function walk(fidx) {
    SGA.childFolderIndices(arch, fidx).forEach(function (c) {
      state.expanded.delete(folderKey(si, c));
      walk(c);
    });
  }
  walk(fi);
}

function contextExpandAll() {
  var entry = getActiveArchive();
  if (!entry || !entry.parsed || !state.treeContextTarget) return;
  expandAllUnderFolder(entry.parsed, state.treeContextTarget.sectionIndex, state.treeContextTarget.folderIndex);
  renderTree();
}

function contextCollapseAll() {
  var entry = getActiveArchive();
  if (!entry || !entry.parsed || !state.treeContextTarget) return;
  collapseAllUnderFolder(entry.parsed, state.treeContextTarget.sectionIndex, state.treeContextTarget.folderIndex);
  renderTree();
}

function contextCopyPath() {
  var entry = getActiveArchive();
  if (!entry || !entry.parsed || !state.treeContextTarget) return;
  var p = SGA.folderPath(entry.parsed, state.treeContextTarget.folderIndex);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(p).catch(function () {
      window.prompt("Copy path:", p);
    });
  } else {
    window.prompt("Copy path:", p);
  }
}

async function contextExtractFolder() {
  var entry = getActiveArchive();
  if (!entry || !entry.parsed || !state.treeContextTarget) return;
  if (typeof fflate === "undefined" || !fflate.zipSync) {
    alert("ZIP export is unavailable (fflate did not load).");
    return;
  }
  var arch = entry.parsed;
  var fi = state.treeContextTarget.folderIndex;
  var list = collectFolderFilesRecursive(arch, fi, "");
  if (!list.length) {
    alert("This folder has no files to extract.");
    return;
  }
  var obj = {};
  try {
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var data = await SGA.readFileData(arch, item.file);
      obj[item.rel.replace(/\\/g, "/")] = data;
    }
    var zipped = fflate.zipSync(obj, { level: 6 });
    var blob = new Blob([zipped], { type: "application/zip" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = SGA.folderShortName(arch, fi) + ".zip";
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert("Extract failed: " + (err && err.message ? err.message : String(err)));
  }
}

export function openTreeContextMenu(clientX, clientY) {
  var menu = $("tree-context-menu");
  if (!menu || !state.treeContextTarget) return;
  menu.innerHTML = "";
  var entry = getActiveArchive();
  var pinned =
    entry &&
    isFolderPinned(entry.label, state.treeContextTarget.sectionIndex, state.treeContextTarget.folderIndex);

  function addItem(label, fn) {
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.textContent = label;
    b.addEventListener("click", function () {
      menu.hidden = true;
      fn();
    });
    menu.appendChild(b);
  }

  addItem("Extract folder…", contextExtractFolder);
  addItem("Copy path", contextCopyPath);
  addItem("Expand all children", contextExpandAll);
  addItem("Collapse all children", contextCollapseAll);
  addItem(pinned ? "Unpin folder" : "Pin folder", togglePinForTarget);

  menu.hidden = false;
  var x = clientX;
  var y = clientY;
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  requestAnimationFrame(function () {
    var r = menu.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    if (r.right > vw) menu.style.left = Math.max(8, vw - r.width - 8) + "px";
    if (r.bottom > vh) menu.style.top = Math.max(8, vh - r.height - 8) + "px";
  });
}
