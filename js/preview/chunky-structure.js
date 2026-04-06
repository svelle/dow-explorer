"use strict";

import { $ } from "../util.js";
import { clearPreview } from "./clear.js";

function buildChunkyDetails(nodes) {
  var frag = document.createDocumentFragment();
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var det = document.createElement("details");
    det.className = "preview-chunky-node";
    var sum = document.createElement("summary");
    var typ = document.createElement("span");
    typ.className = "preview-chunky-type";
    typ.textContent = n.typeid + (n.name ? " — " + n.name : "");
    sum.appendChild(typ);
    var meta = document.createElement("span");
    meta.className = "preview-chunky-meta";
    meta.textContent = " v" + n.version + " · " + n.size + " B";
    sum.appendChild(meta);
    if (n.children && n.children.length) {
      det.open = false;
      var badge = document.createElement("span");
      badge.className = "preview-chunky-badge";
      badge.textContent = String(n.children.length);
      sum.appendChild(badge);
      det.appendChild(sum);
      det.appendChild(buildChunkyDetails(n.children));
    } else {
      det.open = false;
      det.appendChild(sum);
      if (n.asciiPreview) {
        var ascii = document.createElement("div");
        ascii.className = "preview-chunky-ascii";
        ascii.textContent = n.asciiPreview;
        det.appendChild(ascii);
      }
    }
    frag.appendChild(det);
  }
  return frag;
}

function filterChunkyTree(rootEl, q) {
  q = (q || "").trim().toLowerCase();
  var blocks = rootEl.querySelectorAll(".preview-chunky-node");
  if (!q) {
    blocks.forEach(function (el) {
      el.hidden = false;
    });
    return;
  }
  function subtreeHasMatch(el) {
    var sum = el.querySelector(":scope > summary");
    if (sum && sum.textContent.toLowerCase().indexOf(q) >= 0) return true;
    var asc = el.querySelector(":scope > .preview-chunky-ascii");
    if (asc && asc.textContent.toLowerCase().indexOf(q) >= 0) return true;
    var kids = el.querySelectorAll(":scope > .preview-chunky-node");
    for (var i = 0; i < kids.length; i++) {
      if (subtreeHasMatch(kids[i])) return true;
    }
    return false;
  }
  blocks.forEach(function (el) {
    el.hidden = !subtreeHasMatch(el);
  });
}

var chunkySearchTimer = null;

function wireChunkySearch() {
  var inp = $("preview-chunky-search");
  var tree = $("preview-chunky-tree");
  if (!inp || !tree) return;
  inp.value = "";
  inp.oninput = function () {
    if (chunkySearchTimer) clearTimeout(chunkySearchTimer);
    var v = inp.value;
    chunkySearchTimer = setTimeout(function () {
      filterChunkyTree(tree, v);
    }, 120);
  };
}

/**
 * @param {object[]} nodes — RelicChunkyTree.parseToNodes().nodes
 * @param {{ preamble?: string }} [opts]
 */
export function setPreviewChunkyTree(nodes, opts) {
  clearPreview();
  opts = opts || {};
  var wrap = $("preview-chunky-wrap");
  var treeEl = $("preview-chunky-tree");
  var preEl = $("preview-chunky-preamble");
  if (!wrap || !treeEl) return;
  treeEl.innerHTML = "";
  if (preEl) {
    if (opts.preamble) {
      preEl.textContent = opts.preamble;
      preEl.hidden = false;
    } else {
      preEl.textContent = "";
      preEl.hidden = true;
    }
  }
  treeEl.appendChild(buildChunkyDetails(nodes || []));
  wrap.hidden = false;
  wireChunkySearch();
}
