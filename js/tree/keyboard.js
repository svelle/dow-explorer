"use strict";

import { state } from "../state.js";
import { $ } from "../util.js";
import { treeFlatRowMatchesSelection } from "./flatten.js";
import {
  renderTree,
  scrollTreeSelectionIntoView,
  schedulePaintTreeVirtual,
} from "./render.js";
import { renderMain } from "../files/view.js";
import { renderInspector } from "../ui/inspector.js";

export function getCurrentTreeFlatRow() {
  if (!state.selection) return null;
  for (var i = 0; i < state.lastTreeFlatRows.length; i++) {
    var r = state.lastTreeFlatRows[i];
    if (
      r.sectionIndex === state.selection.sectionIndex &&
      r.folderIndex === state.selection.folderIndex
    ) {
      return r;
    }
  }
  return null;
}

export function treeToggleExpandForRow() {
  var row = getCurrentTreeFlatRow();
  if (!row || !row.expandKey) return;
  var ek = row.expandKey;
  if (state.expanded.has(ek)) state.expanded.delete(ek);
  else state.expanded.add(ek);
  renderTree();
  $("tree-container").focus();
  requestAnimationFrame(scrollTreeSelectionIntoView);
}

export function moveTreeSelection(delta) {
  var rows = state.lastTreeFlatRows;
  if (!rows.length) return;
  var cur = -1;
  if (state.selection) {
    for (var i = 0; i < rows.length; i++) {
      if (treeFlatRowMatchesSelection(rows[i], state.selection)) {
        cur = i;
        break;
      }
    }
  }
  if (cur < 0) {
    cur = delta > 0 ? -1 : rows.length;
  }
  var next = cur + delta;
  if (next < 0) next = 0;
  if (next >= rows.length) next = rows.length - 1;
  var tr = rows[next];
  state.selection = { sectionIndex: tr.sectionIndex, folderIndex: tr.folderIndex };
  state.selectedFileIndex = null;
  renderTree();
  renderMain();
  renderInspector();
  $("tree-container").focus();
  requestAnimationFrame(scrollTreeSelectionIntoView);
}

export function treeExpandRowIfCollapsed() {
  var row = getCurrentTreeFlatRow();
  if (!row || !row.expandKey) return;
  var ek = row.expandKey;
  if (state.expanded.has(ek)) return;
  state.expanded.add(ek);
  renderTree();
  $("tree-container").focus();
  requestAnimationFrame(scrollTreeSelectionIntoView);
}

export function treeCollapseRowIfExpanded() {
  var row = getCurrentTreeFlatRow();
  if (!row || !row.expandKey) return;
  var ek = row.expandKey;
  if (!state.expanded.has(ek)) return;
  state.expanded.delete(ek);
  renderTree();
  $("tree-container").focus();
  requestAnimationFrame(scrollTreeSelectionIntoView);
}
