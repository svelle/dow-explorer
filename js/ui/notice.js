"use strict";

import { $ } from "../util.js";

/**
 * Show a dismissible banner at the top of the viewport (works on splash and main UI).
 * @param {string} message
 */
export function showAppNotice(message) {
  var bar = $("app-notice");
  var text = $("app-notice-text");
  var dismiss = $("app-notice-dismiss");
  if (!bar || !text) {
    console.warn("[SGA Browser]", message);
    return;
  }
  text.textContent = message;
  bar.hidden = false;
  bar.setAttribute("aria-live", "assertive");
  if (dismiss) {
    dismiss.onclick = function () {
      bar.hidden = true;
      text.textContent = "";
      bar.removeAttribute("aria-live");
    };
    try {
      dismiss.focus();
    } catch (e) {}
  }
}
