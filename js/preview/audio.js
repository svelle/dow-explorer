"use strict";

import { state } from "../state.js";
import { $ } from "../util.js";
import { resetAuxiliaryPreviewDom } from "./dom-reset.js";

function formatPreviewTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  var m = Math.floor(sec / 60);
  var s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}

function setPreviewAudioPlayButtonUi(playing) {
  var btn = $("preview-audio-play");
  if (!btn) return;
  btn.textContent = playing ? "⏸" : "▶";
  btn.setAttribute("aria-label", playing ? "Pause" : "Play");
}

function resetPreviewAudioSeekUi() {
  var seek = $("preview-audio-seek");
  if (!seek) return;
  seek.value = "0";
  seek.max = "1";
}

function updatePreviewAudioSeekFromAudio() {
  if (state.previewAudioSeekDragging) return;
  var aud = $("preview-audio");
  var seek = $("preview-audio-seek");
  if (!aud || !seek) return;
  var d = aud.duration;
  if (isFinite(d) && d > 0) {
    seek.max = String(d);
    seek.value = String(aud.currentTime);
  } else {
    seek.max = "1";
    seek.value = "0";
  }
}

function updatePreviewAudioTimeLabels() {
  var aud = $("preview-audio");
  var cur = $("preview-audio-cur");
  var dur = $("preview-audio-dur");
  if (!aud || !cur || !dur) return;
  cur.textContent = formatPreviewTime(aud.currentTime);
  dur.textContent = formatPreviewTime(aud.duration || 0);
  updatePreviewAudioSeekFromAudio();
}

export function disposeAudioUi() {
  if (state.previewAudioObjectUrl) {
    URL.revokeObjectURL(state.previewAudioObjectUrl);
    state.previewAudioObjectUrl = null;
  }
  var aud = $("preview-audio");
  var awrap = $("preview-audio-wrap");
  if (aud) {
    aud.pause();
    aud.removeAttribute("src");
  }
  setPreviewAudioPlayButtonUi(false);
  resetPreviewAudioSeekUi();
  if (awrap) awrap.hidden = true;
}

export function applyPreviewAudioFromBlob(blob, displayName) {
  resetAuxiliaryPreviewDom();
  var wrap = $("preview-text-wrap");
  var pre = $("preview-content");
  var img = $("preview-image");
  var awrap = $("preview-audio-wrap");
  var aud = $("preview-audio");
  var fnEl = $("preview-audio-filename");
  if (!pre || !img || !awrap || !aud) return;
  if (fnEl) {
    var label = displayName != null && String(displayName).length ? String(displayName) : "";
    fnEl.textContent = label;
    fnEl.title = label;
    fnEl.hidden = !label;
  }
  if (wrap) wrap.hidden = true;
  pre.hidden = true;
  img.hidden = true;
  img.removeAttribute("src");
  aud.pause();
  aud.removeAttribute("src");
  state.previewAudioObjectUrl = URL.createObjectURL(blob);
  aud.src = state.previewAudioObjectUrl;
  aud.volume = 0.25;
  var vol = $("preview-audio-volume");
  if (vol) vol.value = "0.25";
  setPreviewAudioPlayButtonUi(false);
  resetPreviewAudioSeekUi();
  awrap.hidden = false;
  updatePreviewAudioTimeLabels();
}

export function setupPreviewAudio() {
  var aud = $("preview-audio");
  var btn = $("preview-audio-play");
  var vol = $("preview-audio-volume");
  var seek = $("preview-audio-seek");
  if (!aud || !btn) return;

  var iconSlot = $("preview-audio-icon-slot");
  if (iconSlot && typeof FileKindIcons !== "undefined" && FileKindIcons.getSvgHtml) {
    iconSlot.innerHTML = FileKindIcons.getSvgHtml("audio");
  }

  function applySeekFromInput() {
    var d = aud.duration;
    if (!isFinite(d) || d <= 0) return;
    var t = parseFloat(seek.value);
    if (!isFinite(t)) return;
    aud.currentTime = Math.min(Math.max(0, t), d);
  }

  btn.addEventListener("click", function () {
    if (aud.paused) {
      aud.play().catch(function () {});
    } else {
      aud.pause();
    }
  });
  aud.addEventListener("play", function () {
    setPreviewAudioPlayButtonUi(true);
  });
  aud.addEventListener("pause", function () {
    setPreviewAudioPlayButtonUi(false);
  });
  aud.addEventListener("timeupdate", updatePreviewAudioTimeLabels);
  aud.addEventListener("loadedmetadata", updatePreviewAudioTimeLabels);
  aud.addEventListener("ended", function () {
    setPreviewAudioPlayButtonUi(false);
    updatePreviewAudioSeekFromAudio();
  });
  if (seek) {
    seek.addEventListener("pointerdown", function (e) {
      state.previewAudioSeekDragging = true;
      try {
        seek.setPointerCapture(e.pointerId);
      } catch (err) {}
    });
    seek.addEventListener("pointerup", function () {
      state.previewAudioSeekDragging = false;
      updatePreviewAudioSeekFromAudio();
    });
    seek.addEventListener("pointercancel", function () {
      state.previewAudioSeekDragging = false;
      updatePreviewAudioSeekFromAudio();
    });
    seek.addEventListener("input", function () {
      applySeekFromInput();
    });
    seek.addEventListener("change", function () {
      applySeekFromInput();
      state.previewAudioSeekDragging = false;
      updatePreviewAudioSeekFromAudio();
    });
  }
  if (vol) {
    vol.addEventListener("input", function () {
      aud.volume = parseFloat(vol.value) || 0;
    });
  }
}
