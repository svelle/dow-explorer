"use strict";

import { state } from "../state.js";
import { $ } from "../util.js";

/** Hides raster / RGD / WTP / UCS preview shells and revokes blob URLs for structured previews. */
export function resetAuxiliaryPreviewDom() {
  if (state.previewStructuredObjectUrls.length) {
    state.previewStructuredObjectUrls.forEach(function (u) {
      try {
        URL.revokeObjectURL(u);
      } catch (e) {}
    });
    state.previewStructuredObjectUrls = [];
  }
  var el = $("preview-raster-wrap");
  if (el) el.hidden = true;
  el = $("preview-raster-meta");
  if (el) {
    el.hidden = true;
    el.textContent = "";
  }
  el = $("preview-rgd-tree");
  if (el) el.innerHTML = "";
  el = $("preview-rgd-wrap");
  if (el) el.hidden = true;
  el = $("preview-wtp-grid");
  if (el) el.innerHTML = "";
  el = $("preview-wtp-wrap");
  if (el) el.hidden = true;
  el = $("preview-ucs-tbody");
  if (el) el.innerHTML = "";
  el = $("preview-ucs-wrap");
  if (el) el.hidden = true;
  el = $("preview-chunky-tree");
  if (el) el.innerHTML = "";
  el = $("preview-chunky-preamble");
  if (el) {
    el.textContent = "";
    el.hidden = true;
  }
  el = $("preview-chunky-wrap");
  if (el) el.hidden = true;
}
