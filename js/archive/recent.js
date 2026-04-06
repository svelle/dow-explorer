"use strict";

import { deleteHandle, loadHandle, saveHandle } from "./handles.js";
import { addArchiveFromBuffer, pathFromFile } from "./open.js";
import { state } from "../state.js";
import { $, basename, uid, isFileSystemHandleAccessBlockedError } from "../util.js";
import { showAppNotice } from "../ui/notice.js";

var RECENT_KEY = "sga-browser-recent-files";
var MAX_RECENT = 20;

export function loadRecentRaw() {
  try {
    var raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    var list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

export function rememberRecent(name, path, fileSystemHandle) {
  var list = loadRecentRaw();
  var hid = "";
  if (fileSystemHandle) {
    hid = uid();
    saveHandle(hid, fileSystemHandle).catch(function () {});
  }
  var entry = { name: name, path: path || "", hid: hid };
  list = list.filter(function (x) {
    if (entry.path && x.path === entry.path) return false;
    if (entry.hid && x.hid === entry.hid) return false;
    if (entry.hid && x.name === entry.name && !x.hid && (!x.path || x.path === "")) return false;
    if (!entry.path && !entry.hid && (!x.path || x.path === "") && x.name === entry.name && !x.hid)
      return false;
    return true;
  });
  list.unshift(entry);
  if (list.length > MAX_RECENT) list = list.slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch (e) {
    /* quota */
  }
}

export function removeRecent(entry) {
  if (entry.hid) deleteHandle(entry.hid).catch(function () {});
  var list = loadRecentRaw();
  list = list.filter(function (x) {
    if (entry.hid && x.hid === entry.hid) return false;
    if (entry.path && x.path === entry.path) return false;
    return !(x.name === entry.name && !x.hid && (!x.path || x.path === ""));
  });
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch (e) {
    /* ignore */
  }
}

export function renderRecent() {
  var sec = $("recent-section");
  var ul = $("recent-list");
  if (!sec || !ul) return;
  var list = loadRecentRaw();
  ul.innerHTML = "";
  if (!list.length) {
    sec.hidden = true;
    return;
  }
  sec.hidden = false;
  list.forEach(function (entry) {
    var li = document.createElement("li");
    li.className = "recent-item";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "recent-btn";
    var display = entry.path || entry.name;
    btn.textContent = display;
    var canOpen = !!(entry.path || entry.hid);
    btn.title = entry.path
      ? entry.path
      : entry.hid
      ? entry.name + " — reopen via saved file access (Chromium)"
      : entry.name +
        " — cannot reopen (open once with Choose .sga so access can be saved)";
    btn.disabled = !canOpen;
    btn.addEventListener("click", function () {
      if (canOpen) openRecentEntry(entry);
    });
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "recent-remove";
    rm.setAttribute("aria-label", "Remove from list");
    rm.textContent = "×";
    rm.addEventListener("click", function (e) {
      e.stopPropagation();
      removeRecent(entry);
      renderRecent();
    });
    li.appendChild(btn);
    li.appendChild(rm);
    ul.appendChild(li);
  });
}

export function openRecentEntry(entry) {
  if (!entry) return;
  if (entry.path) {
    fetch("/api/read-sga?path=" + encodeURIComponent(entry.path))
      .then(function (r) {
        if (!r.ok) throw new Error(r.status + " " + r.statusText);
        return r.arrayBuffer();
      })
      .then(function (buf) {
        addArchiveFromBuffer(buf, basename(entry.path), entry.path, null);
      })
      .catch(function (e) {
        showAppNotice(
          "Could not load from saved path. Use Choose .sga and pick the file again. " +
            (e && e.message ? "(" + e.message + ")" : "")
        );
      });
    return;
  }
  if (entry.hid) {
    loadHandle(entry.hid)
      .then(function (handle) {
        if (!handle || typeof handle.getFile !== "function") {
          throw new Error("Saved file access expired or unavailable. Choose the file again.");
        }
        return handle.getFile().then(function (file) {
          return file.arrayBuffer().then(function (buf) {
            addArchiveFromBuffer(buf, file.name, pathFromFile(file), handle);
          });
        });
      })
      .catch(function (e) {
        var msg;
        if (isFileSystemHandleAccessBlockedError(e)) {
          msg =
            "Cannot reopen this recent file here: the browser blocks file access in this context (e.g. embedded IDE preview). " +
            "Open the app in Chrome or Edge, or use Choose .sga and select the file again.";
        } else {
          msg =
            e && e.message
              ? e.message
              : "Saved file access expired or is unavailable. Use Choose .sga and pick the file again.";
        }
        console.warn("[SGA Browser] Recent reopen failed:", e);
        showAppNotice(msg);
      });
    return;
  }
}
