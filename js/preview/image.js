"use strict";

import { state } from "../state.js";
import { $ } from "../util.js";
import { resetAuxiliaryPreviewDom } from "./dom-reset.js";

export function setPreviewRasterMeta(lines) {
  var meta = $("preview-raster-meta");
  if (!meta) return;
  if (!lines || !lines.length) {
    meta.hidden = true;
    meta.textContent = "";
    return;
  }
  meta.hidden = false;
  meta.textContent = Array.isArray(lines) ? lines.join("\n") : String(lines);
}

export function disposeImageUi() {
  if (state.previewImageObjectUrl) {
    URL.revokeObjectURL(state.previewImageObjectUrl);
    state.previewImageObjectUrl = null;
  }
}

export function applyPreviewImageFromBlob(blob, metaLines) {
  var wrap = $("preview-text-wrap");
  var pre = $("preview-content");
  var img = $("preview-image");
  var rasterWrap = $("preview-raster-wrap");
  if (!pre || !img) return;
  resetAuxiliaryPreviewDom();
  if (state.previewImageObjectUrl) {
    URL.revokeObjectURL(state.previewImageObjectUrl);
    state.previewImageObjectUrl = null;
  }
  state.previewImageObjectUrl = URL.createObjectURL(blob);
  if (wrap) wrap.hidden = true;
  pre.hidden = true;
  setPreviewRasterMeta(metaLines);
  if (rasterWrap) rasterWrap.hidden = false;
  img.hidden = false;
  img.src = state.previewImageObjectUrl;
  img.alt = "Image preview";
}

export function applyPreviewImageFromCanvas(canvas, setPreviewTextMode, metaLines) {
  if (typeof canvas.toBlob === "function") {
    canvas.toBlob(
      function (blob) {
        if (blob) applyPreviewImageFromBlob(blob, metaLines);
        else setPreviewTextMode("Preview: could not encode image");
      },
      "image/png"
    );
  } else {
    try {
      var wrap = $("preview-text-wrap");
      var pre = $("preview-content");
      var img = $("preview-image");
      var rasterWrap = $("preview-raster-wrap");
      if (!pre || !img) return;
      resetAuxiliaryPreviewDom();
      if (state.previewImageObjectUrl) {
        URL.revokeObjectURL(state.previewImageObjectUrl);
        state.previewImageObjectUrl = null;
      }
      if (wrap) wrap.hidden = true;
      pre.hidden = true;
      setPreviewRasterMeta(metaLines);
      if (rasterWrap) rasterWrap.hidden = false;
      img.hidden = false;
      img.src = canvas.toDataURL("image/png");
      img.alt = "Image preview";
    } catch (e) {
      setPreviewTextMode("Preview: could not encode image");
    }
  }
}
