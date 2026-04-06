"use strict";

import { state } from "../state.js";
import { $ } from "../util.js";
import { disposeAudioUi } from "./audio.js";
import { disposeImageUi } from "./image.js";
import { disposeWhm, hidePreviewWhmWrap } from "./whm.js";
import { resetAuxiliaryPreviewDom } from "./dom-reset.js";

export function clearPreview() {
  disposeImageUi();
  disposeAudioUi();
  disposeWhm();
  hidePreviewWhmWrap();
  resetAuxiliaryPreviewDom();

  var wrap = $("preview-text-wrap");
  var gutter = $("preview-line-gutter");
  var pre = $("preview-content");
  var img = $("preview-image");
  var aud = $("preview-audio");
  var awrap = $("preview-audio-wrap");
  if (aud) {
    aud.pause();
    aud.removeAttribute("src");
  }
  var btn = $("preview-audio-play");
  if (btn) {
    btn.textContent = "▶";
    btn.setAttribute("aria-label", "Play");
  }
  var seek = $("preview-audio-seek");
  if (seek) {
    seek.value = "0";
    seek.max = "1";
  }
  if (awrap) awrap.hidden = true;
  if (img) {
    img.hidden = true;
    img.removeAttribute("src");
  }
  if (pre) {
    pre.hidden = true;
    pre.textContent = "";
  }
  if (gutter) {
    gutter.textContent = "";
    gutter.hidden = true;
  }
  if (wrap) {
    wrap.hidden = true;
    wrap.classList.remove("preview-text-wrap--lines");
  }
}
