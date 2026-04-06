"use strict";

import { state } from "../state.js";
import { $ } from "../util.js";
import { buildFolderParentMap, expandAllTreeFolders } from "../tree/flatten.js";
import { renderPins } from "./pins.js";
import { renderTree } from "../tree/render.js";
import { renderMain } from "../files/view.js";
import { renderInspector } from "./inspector.js";
import { clearPreview } from "../preview/clear.js";
import { tearDownGridThumbnails } from "../files/thumbnails.js";

/** Remove a loaded archive from memory. If it was active, selects another open archive when possible. */
export function unloadArchiveById(id) {
  var idx = state.archives.findIndex(function (a) {
    return a.id === id;
  });
  if (idx < 0) return;
  var wasActive = state.activeArchiveId === id;
  state.archives.splice(idx, 1);

  if (wasActive) {
    clearPreview();
    state.cachedPreview = null;
    tearDownGridThumbnails();
    state.expanded.clear();
    state.selection = null;
    state.selectedFileIndex = null;
    state.treeContextTarget = null;
    if (state.archives.length === 0) {
      state.activeArchiveId = null;
    } else {
      var newIdx = idx === 0 ? 0 : idx - 1;
      var next = state.archives[newIdx];
      state.activeArchiveId = next.id;
      if (next.parsed && next.parsed.sections.length) {
        var sec0 = next.parsed.sections[0];
        if (sec0.rootFolder < next.parsed.folders.length) {
          state.selection = { sectionIndex: sec0.index, folderIndex: sec0.rootFolder };
          if (!next.folderParent) next.folderParent = buildFolderParentMap(next.parsed);
          expandAllTreeFolders(next.parsed);
        }
      }
    }
  }

  renderArchives();
  renderTree();
  renderMain();
  renderInspector();
  updateSplash();
}

export function updateSplash() {
  var splash = $("splash");
  var root = $("app-root");
  if (!splash) return;
  if (state.archives.length === 0) {
    splash.classList.remove("splash--hidden");
    splash.setAttribute("aria-hidden", "false");
    if (root) root.setAttribute("aria-hidden", "true");
  } else {
    splash.classList.add("splash--hidden");
    splash.setAttribute("aria-hidden", "true");
    if (root) root.setAttribute("aria-hidden", "false");
  }
}

export function renderArchives() {
  var ul = $("archive-list");
  var count = $("archive-count");
  count.textContent = String(state.archives.length);
  ul.innerHTML = "";
  state.archives.forEach(function (a) {
    var li = document.createElement("li");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "archive-select-btn";
    btn.textContent = a.label;
    btn.title = a.label;
    if (a.id === state.activeArchiveId) btn.classList.add("active");
    btn.addEventListener("click", function () {
      state.activeArchiveId = a.id;
      state.selectedFileIndex = null;
      state.expanded.clear();
      state.selection = null;
      if (a.parsed && a.parsed.sections.length) {
        var sec0 = a.parsed.sections[0];
        if (sec0.rootFolder < a.parsed.folders.length) {
          state.selection = { sectionIndex: sec0.index, folderIndex: sec0.rootFolder };
          if (!a.folderParent) a.folderParent = buildFolderParentMap(a.parsed);
          expandAllTreeFolders(a.parsed);
        }
      }
      renderArchives();
      renderTree();
      renderMain();
      renderInspector();
    });
    var unload = document.createElement("button");
    unload.type = "button";
    unload.className = "archive-unload-btn";
    unload.textContent = "×";
    unload.setAttribute("aria-label", "Unload " + a.label);
    unload.title = "Unload archive";
    unload.addEventListener("click", function (ev) {
      ev.stopPropagation();
      unloadArchiveById(a.id);
    });
    li.appendChild(btn);
    li.appendChild(unload);
    ul.appendChild(li);
  });
  renderPins();
}
