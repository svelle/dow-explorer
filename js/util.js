"use strict";

export function $(id) {
  return document.getElementById(id);
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "a" + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function basename(path) {
  if (!path) return "";
  var s = String(path).replace(/\\/g, "/");
  var i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

export function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatHex(bytes, maxLen) {
  var cap = typeof maxLen === "number" ? Math.min(bytes.length, maxLen) : bytes.length;
  var lines = [];
  for (var i = 0; i < cap; i += 16) {
    var chunk = bytes.subarray(i, Math.min(i + 16, cap));
    var hex = Array.from(chunk, function (b) {
      return b.toString(16).padStart(2, "0");
    }).join(" ");
    var ascii = Array.from(chunk, function (b) {
      return b >= 32 && b < 127 ? String.fromCharCode(b) : ".";
    }).join("");
    lines.push(i.toString(16).padStart(8, "0") + "  " + hex.padEnd(48, " ") + "  " + ascii);
  }
  if (bytes.length > cap) lines.push("… (" + (bytes.length - cap) + " more bytes)");
  return lines.join("\n");
}

export function readFileAsArrayBuffer(file) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () {
      resolve(r.result);
    };
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

/** True when the environment blocks FileSystemFileHandle.getFile() (e.g. embedded IDE browser, insecure context). */
export function isFileSystemHandleAccessBlockedError(err) {
  if (!err || typeof err !== "object") return false;
  var e = /** @type {{ name?: string, message?: string }} */ (err);
  if (e.name === "NotAllowedError" || e.name === "SecurityError") return true;
  var m = String(e.message || "");
  return (
    m.indexOf("not allowed by the user agent") !== -1 ||
    m.indexOf("The request is not allowed") !== -1 ||
    m.indexOf("user agent or the platform") !== -1
  );
}
