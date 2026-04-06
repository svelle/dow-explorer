"use strict";

import { addArchiveFromBuffer, onOpenFiles, pathFromFile } from "./open.js";
import { readFileAsArrayBuffer } from "../util.js";

export function setupDragAndDrop() {
  window.addEventListener(
    "dragover",
    function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      document.body.classList.add("drag-over");
    },
    false
  );
  window.addEventListener(
    "dragleave",
    function (e) {
      if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
        document.body.classList.remove("drag-over");
      }
    },
    false
  );
  window.addEventListener(
    "drop",
    function (e) {
      e.preventDefault();
      document.body.classList.remove("drag-over");
      var dt = e.dataTransfer;
      if (!dt || !dt.items || !dt.items.length) return;

      var tasks = [];
      for (var i = 0; i < dt.items.length; i++) {
        (function (item) {
          if (item.kind !== "file") return;
          if (typeof item.getAsFileSystemHandle === "function") {
            tasks.push(
              item.getAsFileSystemHandle().then(function (handle) {
                if (!handle || handle.kind !== "file") {
                  var f = item.getAsFile();
                  if (!f) return;
                  return readFileAsArrayBuffer(f).then(function (buf) {
                    addArchiveFromBuffer(buf, f.name, pathFromFile(f), null);
                  });
                }
                return handle
                  .getFile()
                  .then(
                    function (file) {
                      return { file: file, keepHandle: true };
                    },
                    function () {
                      var f = item.getAsFile();
                      if (!f) {
                        return Promise.reject(new Error("getFile blocked and no File fallback"));
                      }
                      return { file: f, keepHandle: false };
                    }
                  )
                  .then(function (x) {
                    return x.file.arrayBuffer().then(function (buf) {
                      addArchiveFromBuffer(
                        buf,
                        x.file.name,
                        pathFromFile(x.file),
                        x.keepHandle ? handle : null
                      );
                    });
                  });
              })
            );
          } else {
            var f2 = item.getAsFile();
            if (f2) {
              tasks.push(
                readFileAsArrayBuffer(f2).then(function (buf) {
                  addArchiveFromBuffer(buf, f2.name, pathFromFile(f2), null);
                })
              );
            }
          }
        })(dt.items[i]);
      }
      if (tasks.length) {
        Promise.all(tasks).catch(function () {
          if (dt.files && dt.files.length) onOpenFiles(dt.files);
        });
        return;
      }
      if (dt.files && dt.files.length) onOpenFiles(dt.files);
    },
    false
  );
  window.addEventListener("dragenter", function (e) {
    e.preventDefault();
  });
}
