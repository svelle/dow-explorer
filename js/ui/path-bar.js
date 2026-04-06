"use strict";

import { state } from "../state.js";
import { $ } from "../util.js";
import { buildFolderParentMap } from "../tree/flatten.js";
import { renderTree, scrollTreeSelectionIntoView } from "../tree/render.js";
import { renderInspector } from "./inspector.js";

var renderMainRef = null;

export function setRenderMainForPathBar(fn) {
  renderMainRef = fn;
}

export function closePathCrumbPopup() {
  document.querySelectorAll("#path-bar .path-crumb-popup").forEach(function (el) {
    el.remove();
  });
  if (state.pathCrumbPopupClose) {
    document.removeEventListener("click", state.pathCrumbPopupClose, true);
    state.pathCrumbPopupClose = null;
  }
}

export function renderPathBar(entry, arch) {
  var pathBar = $("path-bar");
  if (!pathBar) return;
  closePathCrumbPopup();
  pathBar.innerHTML = "";
  if (!entry || !arch || !state.selection) {
    pathBar.textContent = "—";
    return;
  }
  if (!entry.folderParent) entry.folderParent = buildFolderParentMap(arch);
  var parent = entry.folderParent;
  var sec = arch.sections[state.selection.sectionIndex];
  if (!sec) {
    pathBar.textContent = "—";
    return;
  }
  var root = sec.rootFolder;
  var chain = [];
  var fi = state.selection.folderIndex;
  while (fi >= 0) {
    chain.push(fi);
    fi = parent[fi];
  }
  chain.reverse();

  function navToFolder(si, fIdx) {
    state.selection = { sectionIndex: si, folderIndex: fIdx };
    state.selectedFileIndex = null;
    closePathCrumbPopup();
    renderTree();
    if (renderMainRef) renderMainRef();
    renderInspector();
    requestAnimationFrame(function () {
      var tc = $("tree-container");
      if (tc) tc.focus();
      scrollTreeSelectionIntoView();
    });
  }

  var nav = document.createElement("div");
  nav.className = "path-bar-inner";

  var archiveBtn = document.createElement("button");
  archiveBtn.type = "button";
  archiveBtn.className = "path-crumb";
  archiveBtn.textContent = entry.label || "Archive";
  archiveBtn.title = entry.label || "";
  archiveBtn.addEventListener("click", function () {
    navToFolder(state.selection.sectionIndex, root);
  });
  nav.appendChild(archiveBtn);

  chain.forEach(function (folderIdx, idx) {
    var parentForMenu = idx === 0 ? root : chain[idx - 1];
    var kids = SGA.childFolderIndices(arch, parentForMenu);

    var sepWrap = document.createElement("span");
    sepWrap.className = "path-crumb-sep-wrap";
    var sepBtn = document.createElement("button");
    sepBtn.type = "button";
    sepBtn.className = "path-crumb-sep-btn";
    sepBtn.textContent = "›";
    sepBtn.setAttribute("aria-haspopup", "true");
    sepBtn.setAttribute("aria-label", "Sibling folders");
    sepBtn.disabled = kids.length === 0;
    sepBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      e.preventDefault();
      closePathCrumbPopup();
      if (!kids.length) return;
      var popup = document.createElement("div");
      popup.className = "path-crumb-popup";
      popup.setAttribute("role", "menu");
      kids.forEach(function (kid) {
        var nm = SGA.folderShortName(arch, kid);
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = nm;
        b.title = SGA.folderPath(arch, kid);
        if (kid === folderIdx) b.classList.add("path-crumb-popup--sel");
        b.addEventListener("click", function () {
          navToFolder(state.selection.sectionIndex, kid);
        });
        popup.appendChild(b);
      });
      sepWrap.appendChild(popup);
      state.pathCrumbPopupClose = function (ev) {
        if (sepWrap.contains(ev.target)) return;
        closePathCrumbPopup();
      };
      setTimeout(function () {
        document.addEventListener("click", state.pathCrumbPopupClose, true);
      }, 0);
    });
    sepWrap.appendChild(sepBtn);
    nav.appendChild(sepWrap);

    var nameBtn = document.createElement("button");
    nameBtn.type = "button";
    var isLast = idx === chain.length - 1;
    nameBtn.className = "path-crumb" + (isLast ? " path-crumb--current" : "");
    nameBtn.textContent = SGA.folderShortName(arch, folderIdx);
    nameBtn.title = SGA.folderPath(arch, folderIdx);
    if (isLast) {
      nameBtn.setAttribute("aria-current", "page");
    }
    nameBtn.addEventListener("click", function () {
      if (!isLast) navToFolder(state.selection.sectionIndex, folderIdx);
    });
    nav.appendChild(nameBtn);
  });

  pathBar.appendChild(nav);
}
