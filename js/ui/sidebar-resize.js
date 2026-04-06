"use strict";

var SIDEBAR_WIDTH_LS = "sga-browser-sidebar-right-width";
var SIDEBAR_MIN = 260;
var MAIN_MIN = 280;

function getSidebarWidthLimits() {
  var w = window.innerWidth;
  if (w <= 720) return null;
  var leftCol = w <= 960 ? 260 : 320;
  var max = Math.max(SIDEBAR_MIN, w - leftCol - MAIN_MIN);
  return { min: SIDEBAR_MIN, max: max };
}

export function applySidebarWidth(px) {
  var limits = getSidebarWidthLimits();
  if (!limits) return;
  var layout = document.querySelector(".layout");
  if (!layout) return;
  var v = Math.max(limits.min, Math.min(px, limits.max));
  layout.style.setProperty("--sidebar-right-width", v + "px");
  try {
    localStorage.setItem(SIDEBAR_WIDTH_LS, String(Math.round(v)));
  } catch (e) {}
}

export function loadSidebarWidth() {
  var w = 400;
  try {
    var raw = localStorage.getItem(SIDEBAR_WIDTH_LS);
    if (raw != null) {
      var n = parseInt(raw, 10);
      if (!isNaN(n)) w = n;
    }
  } catch (e) {}
  applySidebarWidth(w);
}

export function setupSidebarResize() {
  var layout = document.querySelector(".layout");
  var handle = document.querySelector(".sidebar-resize-handle");
  if (!layout || !handle) return;

  var startX = 0;
  var startWidth = 0;
  var active = false;

  function endDrag(e) {
    if (!active) return;
    active = false;
    try {
      if (e && e.pointerId != null) handle.releasePointerCapture(e.pointerId);
    } catch (err) {}
    document.body.classList.remove("sidebar-resizing");
  }

  function onPointerMove(e) {
    if (!active) return;
    var dx = startX - e.clientX;
    applySidebarWidth(startWidth + dx);
  }

  handle.addEventListener("pointerdown", function (e) {
    if (e.button !== 0) return;
    if (!getSidebarWidthLimits()) return;
    e.preventDefault();
    var aside = document.querySelector(".sidebar-right");
    if (!aside) return;
    startWidth = aside.getBoundingClientRect().width;
    startX = e.clientX;
    active = true;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add("sidebar-resizing");
  });

  handle.addEventListener("pointermove", onPointerMove);
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);

  handle.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (!getSidebarWidthLimits()) return;
    e.preventDefault();
    var aside = document.querySelector(".sidebar-right");
    if (!aside) return;
    var cur = aside.getBoundingClientRect().width;
    var step = 24;
    if (e.key === "ArrowLeft") applySidebarWidth(cur + step);
    else applySidebarWidth(cur - step);
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth <= 720) return;
    var aside = document.querySelector(".sidebar-right");
    if (!aside) return;
    applySidebarWidth(aside.getBoundingClientRect().width);
  });
}
