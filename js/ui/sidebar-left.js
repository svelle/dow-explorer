"use strict";

import { $ } from "../util.js";

var LS_SIDEBAR_LEFT_COLLAPSED = "sga-browser-sidebar-left-collapsed";

export function applySidebarLeftCollapsed(collapsed) {
  var layout = $("app-layout");
  var btn = $("sidebar-left-toggle");
  if (!layout) return;
  if (collapsed) layout.classList.add("sidebar-left-collapsed");
  else layout.classList.remove("sidebar-left-collapsed");
  if (btn) {
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    btn.title = collapsed ? "Expand folder panel" : "Collapse folder panel";
  }
}

export { LS_SIDEBAR_LEFT_COLLAPSED };
