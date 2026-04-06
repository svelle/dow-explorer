"use strict";

import { $ } from "../util.js";
import { clearPreview } from "./clear.js";

export function setPreviewTextMode(text, opts) {
  clearPreview();
  opts = opts || {};
  var wrap = $("preview-text-wrap");
  var gutter = $("preview-line-gutter");
  var pre = $("preview-content");
  var img = $("preview-image");
  if (!pre || !img) return;
  img.hidden = true;
  img.removeAttribute("src");
  if (wrap) wrap.hidden = false;
  pre.hidden = false;

  if (opts.lineNumbers && typeof text === "string") {
    var lines = text.split(/\n/);
    var n = lines.length;
    var pad = Math.max(1, String(n).length);
    var gutterLines = [];
    for (var i = 1; i <= n; i++) {
      gutterLines.push(String(i).padStart(pad, " "));
    }
    if (gutter) {
      gutter.textContent = gutterLines.join("\n");
      gutter.hidden = false;
    }
    if (wrap) wrap.classList.add("preview-text-wrap--lines");
    pre.textContent = text;
  } else {
    if (gutter) {
      gutter.textContent = "";
      gutter.hidden = true;
    }
    if (wrap) wrap.classList.remove("preview-text-wrap--lines");
    pre.textContent = text;
  }
}
