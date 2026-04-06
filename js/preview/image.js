"use strict";

import { state } from "../state.js";
import { $ } from "../util.js";

export function disposeImageUi() {
  if (state.previewImageObjectUrl) {
    URL.revokeObjectURL(state.previewImageObjectUrl);
    state.previewImageObjectUrl = null;
  }
}

export function applyPreviewImageFromBlob(blob) {
  var wrap = $("preview-text-wrap");
  var pre = $("preview-content");
  var img = $("preview-image");
  if (!pre || !img) return;
  if (state.previewImageObjectUrl) {
    URL.revokeObjectURL(state.previewImageObjectUrl);
    state.previewImageObjectUrl = null;
  }
  state.previewImageObjectUrl = URL.createObjectURL(blob);
  if (wrap) wrap.hidden = true;
  pre.hidden = true;
  img.hidden = false;
  img.src = state.previewImageObjectUrl;
  img.alt = "Image preview";
}

export function applyPreviewImageFromCanvas(canvas, setPreviewTextMode) {
  if (typeof canvas.toBlob === "function") {
    canvas.toBlob(
      function (blob) {
        if (blob) applyPreviewImageFromBlob(blob);
        else setPreviewTextMode("Preview: could not encode image");
      },
      "image/png"
    );
  } else {
    try {
      var wrap = $("preview-text-wrap");
      var pre = $("preview-content");
      var img = $("preview-image");
      if (!pre || !img) return;
      if (state.previewImageObjectUrl) {
        URL.revokeObjectURL(state.previewImageObjectUrl);
        state.previewImageObjectUrl = null;
      }
      if (wrap) wrap.hidden = true;
      pre.hidden = true;
      img.hidden = false;
      img.src = canvas.toDataURL("image/png");
      img.alt = "Image preview";
    } catch (e) {
      setPreviewTextMode("Preview: could not encode image");
    }
  }
}
