"use strict";

import { state } from "../state.js";
import { $ } from "../util.js";
import { clearPreview } from "./clear.js";
import { setPreviewTextMode } from "./text.js";

function formatRgdValue(v) {
  if (typeof v === "string") return JSON.stringify(v);
  if (v === true || v === false) return v ? "true" : "false";
  if (typeof v === "number" && !isFinite(v)) return String(v);
  return String(v);
}

function buildRgdDetails(nodes) {
  var frag = document.createDocumentFragment();
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var det = document.createElement("details");
    det.className = "preview-rgd-node";
    var sum = document.createElement("summary");
    var keySpan = document.createElement("span");
    keySpan.className = "preview-rgd-key";
    keySpan.textContent = n.key;
    sum.appendChild(keySpan);
    if (n.children && n.children.length) {
      det.open = false;
      var badge = document.createElement("span");
      badge.className = "preview-rgd-badge";
      badge.textContent = String(n.children.length);
      sum.appendChild(badge);
      det.appendChild(sum);
      det.appendChild(buildRgdDetails(n.children));
    } else {
      det.open = true;
      sum.appendChild(document.createTextNode(": "));
      var valSpan = document.createElement("span");
      valSpan.className = "preview-rgd-val";
      valSpan.textContent = formatRgdValue(n.value);
      sum.appendChild(valSpan);
      det.appendChild(sum);
    }
    frag.appendChild(det);
  }
  return frag;
}

function filterRgdTree(rootEl, q) {
  q = (q || "").trim().toLowerCase();
  var blocks = rootEl.querySelectorAll(".preview-rgd-node");
  if (!q) {
    blocks.forEach(function (el) {
      el.hidden = false;
    });
    return;
  }
  function subtreeHasMatch(el) {
    var sum = el.querySelector(":scope > summary");
    if (sum && sum.textContent.toLowerCase().indexOf(q) >= 0) return true;
    var kids = el.querySelectorAll(":scope > .preview-rgd-node");
    for (var i = 0; i < kids.length; i++) {
      if (subtreeHasMatch(kids[i])) return true;
    }
    return false;
  }
  blocks.forEach(function (el) {
    el.hidden = !subtreeHasMatch(el);
  });
}

var rgdSearchTimer = null;

function wireRgdSearch() {
  var inp = $("preview-rgd-search");
  var tree = $("preview-rgd-tree");
  if (!inp || !tree) return;
  inp.value = "";
  inp.oninput = function () {
    if (rgdSearchTimer) clearTimeout(rgdSearchTimer);
    var v = inp.value;
    rgdSearchTimer = setTimeout(function () {
      filterRgdTree(tree, v);
    }, 120);
  };
}

/**
 * @param {object[]} tree — RGD.parseToTree().tree
 */
export function setPreviewRgdTree(tree) {
  clearPreview();
  var wrap = $("preview-rgd-wrap");
  var treeEl = $("preview-rgd-tree");
  if (!wrap || !treeEl) return;
  treeEl.innerHTML = "";
  treeEl.appendChild(buildRgdDetails(tree || []));
  wrap.hidden = false;
  wireRgdSearch();
}

/**
 * @param {Uint8Array} u8
 */
export function setPreviewWtp(u8) {
  clearPreview();
  if (typeof WTP === "undefined" || typeof WTP.extractTeamLayers !== "function") {
    setPreviewTextMode("WTP preview: decoder not loaded");
    return;
  }
  var r = WTP.extractTeamLayers(u8);
  var wrap = $("preview-wtp-wrap");
  var grid = $("preview-wtp-grid");
  if (!wrap || !grid) return;
  if (!r.ok) {
    setPreviewTextMode("WTP: " + (r.error || "failed"));
    return;
  }
  grid.innerHTML = "";
  r.layers.forEach(function (L) {
    var cell = document.createElement("div");
    cell.className = "preview-wtp-cell";
    var lab = document.createElement("div");
    lab.className = "preview-wtp-label";
    lab.textContent = L.label;
    var checker = document.createElement("div");
    checker.className = "preview-raster-checker preview-wtp-checker";
    var img = document.createElement("img");
    img.className = "preview-wtp-thumb";
    img.alt = L.label;
    checker.appendChild(img);
    cell.appendChild(lab);
    cell.appendChild(checker);
    grid.appendChild(cell);
    L.canvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      state.previewStructuredObjectUrls.push(url);
      img.src = url;
    }, "image/png");
  });
  wrap.hidden = false;
}

/**
 * @param {{ id: number, text: string }[]} rows
 */
export function setPreviewUcsTable(rows) {
  clearPreview();
  var wrap = $("preview-ucs-wrap");
  var tbody = $("preview-ucs-tbody");
  var inp = $("preview-ucs-search");
  if (!wrap || !tbody) return;
  tbody.innerHTML = "";
  rows.forEach(function (row) {
    var tr = document.createElement("tr");
    tr.dataset.query = (String(row.id) + " " + row.text).toLowerCase();
    var tdId = document.createElement("td");
    tdId.className = "preview-ucs-col-id";
    tdId.textContent = String(row.id);
    var tdT = document.createElement("td");
    tdT.textContent = row.text;
    tr.appendChild(tdId);
    tr.appendChild(tdT);
    tbody.appendChild(tr);
  });
  wrap.hidden = false;
  if (inp) {
    inp.value = "";
    inp.oninput = function () {
      var q = inp.value.trim().toLowerCase();
      var trs = tbody.querySelectorAll("tr");
      trs.forEach(function (tr) {
        var hay = tr.dataset.query || "";
        tr.hidden = q.length > 0 && hay.indexOf(q) < 0;
      });
    };
  }
}
