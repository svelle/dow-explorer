"use strict";

import { state } from "../state.js";
import { getActiveArchive } from "../state.js";
import { $ } from "../util.js";
import { buildFolderParentMap, expandAllTreeFolders } from "../tree/flatten.js";

var LS_TREE_PINS = "sga-browser-tree-pins-v1";

export function archiveStorageKey(label) {
  return String(label || "archive").replace(/[^a-z0-9_-]/gi, "_");
}

export function pinKey(si, fi) {
  return si + ":" + fi;
}

export function loadPinsRaw() {
  try {
    var raw = localStorage.getItem(LS_TREE_PINS);
    if (!raw) return {};
    var o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch (e) {
    return {};
  }
}

export function savePinsRaw(obj) {
  try {
    localStorage.setItem(LS_TREE_PINS, JSON.stringify(obj));
  } catch (e) {}
}

export function isFolderPinned(archiveLabel, si, fi) {
  var o = loadPinsRaw();
  var list = o[archiveStorageKey(archiveLabel)];
  if (!Array.isArray(list)) return false;
  var pk = pinKey(si, fi);
  return list.some(function (p) {
    return pinKey(p.sectionIndex, p.folderIndex) === pk;
  });
}

export function togglePinForTarget() {
  var entry = getActiveArchive();
  if (!entry || !state.treeContextTarget) return;
  var o = loadPinsRaw();
  var k = archiveStorageKey(entry.label);
  var list = Array.isArray(o[k]) ? o[k].slice() : [];
  var pk = pinKey(state.treeContextTarget.sectionIndex, state.treeContextTarget.folderIndex);
  var ix = -1;
  for (var i = 0; i < list.length; i++) {
    if (pinKey(list[i].sectionIndex, list[i].folderIndex) === pk) {
      ix = i;
      break;
    }
  }
  if (ix >= 0) list.splice(ix, 1);
  else {
    var arch = entry.parsed;
    list.push({
      sectionIndex: state.treeContextTarget.sectionIndex,
      folderIndex: state.treeContextTarget.folderIndex,
      label: arch ? SGA.folderPath(arch, state.treeContextTarget.folderIndex) : "",
    });
  }
  o[k] = list;
  savePinsRaw(o);
  renderPins();
}

export function renderPins() {
  var ul = $("tree-pins-list");
  var entry = getActiveArchive();
  if (!ul) return;
  ul.innerHTML = "";
  if (!entry || !entry.parsed) {
    ul.innerHTML = "<li class=\"tree-pins-empty\">Open an archive to use pins.</li>";
    return;
  }
  var o = loadPinsRaw();
  var list = o[archiveStorageKey(entry.label)];
  if (!Array.isArray(list) || !list.length) {
    ul.innerHTML = "<li class=\"tree-pins-empty\">Right-click a folder to pin.</li>";
    return;
  }
  var arch = entry.parsed;
  list.forEach(function (p) {
    var li = document.createElement("li");
    var btn = document.createElement("button");
    btn.type = "button";
    var path = p.label || SGA.folderPath(arch, p.folderIndex);
    btn.textContent = path;
    btn.title = path;
    btn.addEventListener("click", function () {
      state.selection = { sectionIndex: p.sectionIndex, folderIndex: p.folderIndex };
      state.selectedFileIndex = null;
      if (!entry.folderParent) entry.folderParent = buildFolderParentMap(arch);
      state.expanded.clear();
      expandAllTreeFolders(arch);
      Promise.all([
        import("../tree/render.js"),
        import("../files/view.js"),
        import("./inspector.js"),
      ]).then(function (mods) {
        mods[0].renderTree();
        mods[1].renderMain();
        mods[2].renderInspector();
        requestAnimationFrame(function () {
          mods[0].scrollTreeSelectionIntoView();
        });
      });
    });
    li.appendChild(btn);
    ul.appendChild(li);
  });
}
