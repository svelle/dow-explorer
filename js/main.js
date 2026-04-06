"use strict";

import { state, getActiveArchive } from "./state.js";
import { $ } from "./util.js";
import { setupDragAndDrop } from "./archive/dnd.js";
import { pickSgaFiles, onOpenFiles } from "./archive/open.js";
import { renderArchives, updateSplash } from "./ui/splash.js";
import { renderTree, schedulePaintTreeVirtual } from "./tree/render.js";
import { renderMain, moveFileSelection, fileSelectionGoEnd } from "./files/view.js";
import { renderInspector, onExtract, onHex, closeHex } from "./ui/inspector.js";
import { setupPreviewAudio } from "./preview/index.js";
import { loadSidebarWidth, setupSidebarResize } from "./ui/sidebar-resize.js";
import {
  readPaletteAppearance,
  resolveThemeId,
  setDataThemeFromId,
  syncThemeControls,
  applyPaletteAppearance,
} from "./ui/theme.js";
import {
  applySidebarLeftCollapsed,
  LS_SIDEBAR_LEFT_COLLAPSED,
} from "./ui/sidebar-left.js";
import { renderRecent } from "./archive/recent.js";
import { closePathCrumbPopup, setRenderMainForPathBar } from "./ui/path-bar.js";
import {
  moveTreeSelection,
  treeToggleExpandForRow,
  treeExpandRowIfCollapsed,
  treeCollapseRowIfExpanded,
  getCurrentTreeFlatRow,
} from "./tree/keyboard.js";

var LS_PINS_SECTION_COLLAPSED = "sga-browser-pins-section-collapsed";

function init() {
  var splashOpen = $("splash-open");
  if (splashOpen) {
    splashOpen.addEventListener("click", function () {
      pickSgaFiles();
    });
  }
  var openBtn = $("open-btn");
  if (openBtn) {
    openBtn.addEventListener("click", function () {
      pickSgaFiles();
    });
  }
  var fileInput = $("file-input");
  if (fileInput) {
    fileInput.addEventListener("change", function (e) {
      onOpenFiles(e.target.files);
      e.target.value = "";
    });
  }

  loadSidebarWidth();
  var st = readPaletteAppearance();
  setDataThemeFromId(resolveThemeId(st.palette, st.appearance));
  syncThemeControls();

  var palSel = $("theme-palette-select");
  if (palSel) {
    palSel.addEventListener("change", function () {
      var st2 = readPaletteAppearance();
      applyPaletteAppearance(palSel.value, st2.appearance);
    });
  }
  var appBtn = $("theme-appearance-toggle");
  if (appBtn) {
    appBtn.addEventListener("click", function () {
      var st2 = readPaletteAppearance();
      var next = st2.appearance === "dark" ? "light" : "dark";
      applyPaletteAppearance(st2.palette, next);
    });
  }

  var filterIn = $("filter-input");
  if (filterIn) {
    filterIn.addEventListener("input", function () {
      renderMain();
    });
  }

  var treeFilter = $("tree-filter-input");
  if (treeFilter) {
    treeFilter.addEventListener("input", function () {
      renderTree();
      renderMain();
    });
  }

  try {
    if (localStorage.getItem(LS_SIDEBAR_LEFT_COLLAPSED) === "1") {
      applySidebarLeftCollapsed(true);
    }
  } catch (e) {}
  var sidebarLeftToggle = $("sidebar-left-toggle");
  if (sidebarLeftToggle) {
    sidebarLeftToggle.addEventListener("click", function () {
      var layout = $("app-layout");
      if (!layout) return;
      var collapsed = !layout.classList.contains("sidebar-left-collapsed");
      applySidebarLeftCollapsed(collapsed);
      try {
        localStorage.setItem(LS_SIDEBAR_LEFT_COLLAPSED, collapsed ? "1" : "0");
      } catch (e) {}
    });
  }

  var pinsToggle = $("tree-pins-toggle");
  var pinsBlock = $("tree-pins-block");
  var pinsList = $("tree-pins-list");
  if (pinsToggle && pinsBlock && pinsList) {
    try {
      if (localStorage.getItem(LS_PINS_SECTION_COLLAPSED) === "1") {
        pinsBlock.classList.add("is-collapsed");
        pinsList.hidden = true;
        pinsToggle.setAttribute("aria-expanded", "false");
      }
    } catch (e) {}
    pinsToggle.addEventListener("click", function () {
      var collapsed = !pinsBlock.classList.contains("is-collapsed");
      if (collapsed) {
        pinsBlock.classList.add("is-collapsed");
        pinsList.hidden = true;
        pinsToggle.setAttribute("aria-expanded", "false");
      } else {
        pinsBlock.classList.remove("is-collapsed");
        pinsList.hidden = false;
        pinsToggle.setAttribute("aria-expanded", "true");
      }
      try {
        localStorage.setItem(LS_PINS_SECTION_COLLAPSED, collapsed ? "1" : "0");
      } catch (e) {}
    });
  }

  document.addEventListener("click", function (e) {
    var m = $("tree-context-menu");
    if (!m || m.hidden) return;
    if (m.contains(e.target)) return;
    m.hidden = true;
  });

  window.addEventListener("resize", function () {
    schedulePaintTreeVirtual();
  });

  var viewGrid = $("view-grid");
  var viewList = $("view-list");
  if (viewGrid && viewList) {
    viewGrid.addEventListener("click", function () {
      state.viewMode = "grid";
      viewGrid.classList.add("active");
      viewList.classList.remove("active");
      renderMain();
    });
    viewList.addEventListener("click", function () {
      state.viewMode = "list";
      viewList.classList.add("active");
      viewGrid.classList.remove("active");
      renderMain();
    });
  }

  setupPreviewAudio();

  var btnExtract = $("btn-extract");
  var btnHex = $("btn-hex");
  var hexClose = $("hex-close");
  var hexModal = $("hex-modal");
  if (btnExtract) btnExtract.addEventListener("click", onExtract);
  if (btnHex) btnHex.addEventListener("click", onHex);
  if (hexClose) hexClose.addEventListener("click", closeHex);
  if (hexModal) {
    hexModal.addEventListener("click", function (e) {
      if (e.target.dataset.close) closeHex();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("hex-modal").classList.contains("hidden")) {
      e.preventDefault();
      closeHex();
      return;
    }
    if (e.key === "Escape") {
      var cm = $("tree-context-menu");
      if (cm && !cm.hidden) {
        cm.hidden = true;
        e.preventDefault();
      }
      closePathCrumbPopup();
    }
  });

  var treeContainer = $("tree-container");
  if (treeContainer) {
    treeContainer.addEventListener("click", function (e) {
      if (e.target.closest(".tree-row")) treeContainer.focus();
    });

    treeContainer.addEventListener("keydown", function (e) {
    var t = e.target;
    if (t !== treeContainer && !t.closest("#tree-container")) return;
    var entry = getActiveArchive();
    if (!entry || !entry.parsed) return;
    if (!state.lastTreeFlatRows.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveTreeSelection(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveTreeSelection(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      treeExpandRowIfCollapsed();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      treeCollapseRowIfExpanded();
    } else if (e.key === "Enter" || e.key === " ") {
      var row = getCurrentTreeFlatRow();
      if (row && row.expandKey) {
        e.preventDefault();
        treeToggleExpandForRow();
      }
    }
  });
  }

  var fileViewEl = $("file-view");
  if (fileViewEl) {
    fileViewEl.addEventListener("click", function () {
      fileViewEl.focus();
    });

    fileViewEl.addEventListener("keydown", function (e) {
    if (e.target !== fileViewEl && !e.target.closest("#file-view")) return;
    var entry = getActiveArchive();
    if (!entry || !entry.parsed || !state.selection) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFileSelection(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFileSelection(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      fileSelectionGoEnd(true);
    } else if (e.key === "End") {
      e.preventDefault();
      fileSelectionGoEnd(false);
    } else if (e.key === "PageDown") {
      e.preventDefault();
      moveFileSelection(10);
    } else if (e.key === "PageUp") {
      e.preventDefault();
      moveFileSelection(-10);
    }
  });
  }

  setupDragAndDrop();
  setupSidebarResize();
  renderArchives();
  renderTree();
  renderMain();
  renderInspector();
  updateSplash();
  renderRecent();
}

setRenderMainForPathBar(renderMain);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
