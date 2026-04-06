"use strict";

import { state } from "../state.js";
import { basename, uid, $ } from "../util.js";
import { rememberRecent } from "./recent.js";
import { buildFolderParentMap, expandAllTreeFolders } from "../tree/flatten.js";
import { renderArchives, updateSplash } from "../ui/splash.js";
import { renderTree } from "../tree/render.js";
import { renderMain } from "../files/view.js";
import { renderInspector } from "../ui/inspector.js";
import { renderRecent } from "./recent.js";

export function pathFromFile(file) {
  return typeof file.path === "string" && file.path ? file.path : "";
}

export function addArchiveFromBuffer(buffer, label, sourcePath, fileSystemHandle) {
  var parsed = SGA.parseSga(buffer);
  var id = uid();
  var entry = {
    id: id,
    label: label,
    buffer: buffer,
    parsed: parsed.ok ? parsed.archive : null,
    error: parsed.ok ? null : parsed.error,
    sourcePath: sourcePath || null,
    folderParent: null,
  };
  if (parsed.ok && entry.parsed) {
    entry.folderParent = buildFolderParentMap(entry.parsed);
  }
  state.archives.push(entry);
  if (!state.activeArchiveId) state.activeArchiveId = id;
  if (parsed.ok && state.activeArchiveId === id) {
    var arch = parsed.archive;
    var sec = arch.sections[0];
    if (sec && sec.rootFolder < arch.folders.length) {
      state.selection = { sectionIndex: sec.index, folderIndex: sec.rootFolder };
      state.expanded.clear();
      expandAllTreeFolders(arch);
    }
  }
  if (parsed.ok) rememberRecent(label, sourcePath || "", fileSystemHandle || null);
  renderArchives();
  renderTree();
  renderMain();
  renderInspector();
  updateSplash();
  renderRecent();
}

function openSgaViaFileInput() {
  var input = $("file-input");
  if (input) input.click();
}

export function pickSgaFiles() {
  if (typeof window.showOpenFilePicker === "function") {
    try {
      window
        .showOpenFilePicker({
          multiple: true,
          types: [
            {
              description: "SGA archives",
              accept: { "application/octet-stream": [".sga"] },
            },
          ],
        })
        .then(function (handles) {
          return Promise.all(
            handles.map(function (h) {
              return h.getFile().then(function (file) {
                return file.arrayBuffer().then(function (buf) {
                  return { buf: buf, file: file, handle: h };
                });
              });
            })
          );
        })
        .then(function (items) {
          items.forEach(function (item) {
            addArchiveFromBuffer(
              item.buf,
              item.file.name,
              pathFromFile(item.file),
              item.handle
            );
          });
        })
        .catch(function (err) {
          if (err && err.name === "AbortError") return;
          openSgaViaFileInput();
        });
    } catch (e) {
      openSgaViaFileInput();
    }
    return;
  }
  openSgaViaFileInput();
}

export function onOpenFiles(files) {
  if (!files || !files.length) return;
  Array.from(files).forEach(function (file) {
    var path = typeof file.path === "string" && file.path ? file.path : "";
    var reader = new FileReader();
    reader.onload = function () {
      addArchiveFromBuffer(reader.result, file.name, path, null);
    };
    reader.readAsArrayBuffer(file);
  });
}
