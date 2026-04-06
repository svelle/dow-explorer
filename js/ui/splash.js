"use strict";

import { state } from "../state.js";
import { $ } from "../util.js";
import { buildFolderParentMap, expandAllTreeFolders } from "../tree/flatten.js";
import { renderPins } from "./pins.js";
import { renderTree } from "../tree/render.js";
import { renderMain } from "../files/view.js";
import { renderInspector } from "./inspector.js";

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
    btn.textContent = a.label;
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
    li.appendChild(btn);
    ul.appendChild(li);
  });
  renderPins();
}
