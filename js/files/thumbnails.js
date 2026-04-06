"use strict";

import { state } from "../state.js";
import { $ } from "../util.js";
import { mimeForRasterExt } from "./kinds.js";
import { resolveWhmTextureFile } from "../preview/whm.js";

export function thumbCanvasToBlob(canvas, maxDim, callback) {
  var w = canvas.width;
  var h = canvas.height;
  if (!w || !h) {
    callback(null);
    return;
  }
  if (w <= maxDim && h <= maxDim) {
    canvas.toBlob(callback, "image/png");
    return;
  }
  var scale = Math.min(maxDim / w, maxDim / h);
  var nw = Math.max(1, Math.round(w * scale));
  var nh = Math.max(1, Math.round(h * scale));
  var c = document.createElement("canvas");
  c.width = nw;
  c.height = nh;
  var ctx = c.getContext("2d", { alpha: true });
  if (!ctx) {
    callback(null);
    return;
  }
  ctx.clearRect(0, 0, nw, nh);
  ctx.drawImage(canvas, 0, 0, nw, nh);
  c.toBlob(callback, "image/png");
}

export function tearDownGridThumbnails() {
  if (state.gridThumbObserver) {
    state.gridThumbObserver.disconnect();
    state.gridThumbObserver = null;
  }
  state.gridThumbObjectUrls.forEach(function (u) {
    try {
      URL.revokeObjectURL(u);
    } catch (e) {}
  });
  state.gridThumbObjectUrls = [];
}

export function ensureGridThumbObserver() {
  if (state.gridThumbObserver) return;
  var fv = $("file-view");
  state.gridThumbObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        if (
          el.dataset.thumbState === "loading" ||
          el.dataset.thumbState === "done" ||
          el.dataset.thumbState === "error"
        )
          return;
        el.dataset.thumbState = "loading";
        loadGridThumbnailForPreview(el);
      });
    },
    { root: fv || null, rootMargin: "120px", threshold: 0.01 }
  );
}

export function loadGridThumbnailForPreview(previewEl) {
  var entryId = previewEl.dataset.archiveId;
  var idx = parseInt(previewEl.dataset.fileIndex, 10);
  var ext = (previewEl.dataset.ext || "").toLowerCase();

  var img = previewEl.querySelector(".file-card-thumb");
  if (!img) {
    previewEl.dataset.thumbState = "error";
    return;
  }

  var entry = state.archives.find(function (a) {
    return a.id === entryId;
  });
  if (!entry || !entry.parsed) {
    previewEl.dataset.thumbState = "error";
    if (state.gridThumbObserver) state.gridThumbObserver.unobserve(previewEl);
    return;
  }

  var arch = entry.parsed;
  var f = arch.files[idx];
  if (!f) {
    previewEl.dataset.thumbState = "error";
    if (state.gridThumbObserver) state.gridThumbObserver.unobserve(previewEl);
    return;
  }

  function finishWithBlob(blob) {
    if (!previewEl.isConnected) return;
    if (!blob) {
      previewEl.dataset.thumbState = "error";
      if (state.gridThumbObserver) state.gridThumbObserver.unobserve(previewEl);
      return;
    }
    var u = URL.createObjectURL(blob);
    state.gridThumbObjectUrls.push(u);
    img.src = u;
    img.onload = function () {
      if (!previewEl.isConnected) {
        try {
          URL.revokeObjectURL(u);
        } catch (e) {}
        var j = state.gridThumbObjectUrls.indexOf(u);
        if (j >= 0) state.gridThumbObjectUrls.splice(j, 1);
        return;
      }
      img.hidden = false;
      img.setAttribute("data-loaded", "1");
      previewEl.dataset.thumbState = "done";
      var art = previewEl.querySelector(".file-card-preview-art--icon");
      if (art) art.classList.add("file-card-preview-art--faded");
      if (state.gridThumbObserver) state.gridThumbObserver.unobserve(previewEl);
    };
    img.onerror = function () {
      try {
        URL.revokeObjectURL(u);
      } catch (e) {}
      var i = state.gridThumbObjectUrls.indexOf(u);
      if (i >= 0) state.gridThumbObjectUrls.splice(i, 1);
      previewEl.dataset.thumbState = "error";
      if (state.gridThumbObserver) state.gridThumbObserver.unobserve(previewEl);
    };
  }

  SGA.readFileData(arch, f)
    .then(function (data) {
      if (!previewEl.isConnected) {
        if (state.gridThumbObserver) state.gridThumbObserver.unobserve(previewEl);
        return;
      }

      if (ext === "whm") {
        if (typeof WhmPreview === "undefined" || !WhmPreview.renderGridThumbnail) {
          throw new Error("whm thumb");
        }
        function replaceGridThumbBlob(blob) {
          if (!blob || !previewEl.isConnected) return;
          var prev = img.src;
          if (prev && prev.indexOf("blob:") === 0) {
            try {
              URL.revokeObjectURL(prev);
            } catch (e) {}
            var ki = state.gridThumbObjectUrls.indexOf(prev);
            if (ki >= 0) state.gridThumbObjectUrls.splice(ki, 1);
          }
          var u = URL.createObjectURL(blob);
          state.gridThumbObjectUrls.push(u);
          img.src = u;
        }
        return WhmPreview.renderGridThumbnail(data, null)
          .then(function (canvasFast) {
            if (!canvasFast) throw new Error("whm fast");
            return new Promise(function (resolve, reject) {
              thumbCanvasToBlob(canvasFast, 256, function (blob) {
                if (!previewEl.isConnected) {
                  resolve();
                  return;
                }
                if (!blob) {
                  reject(new Error("whm blob"));
                  return;
                }
                finishWithBlob(blob);
                resolve();
              });
            });
          })
          .then(function () {
            return WhmPreview.renderGridThumbnail(data, resolveWhmTextureFile);
          })
          .then(function (canvasFull) {
            if (!previewEl.isConnected || !canvasFull) return;
            return new Promise(function (resolve) {
              thumbCanvasToBlob(canvasFull, 256, function (blob) {
                if (!blob || !previewEl.isConnected) {
                  resolve();
                  return;
                }
                replaceGridThumbBlob(blob);
                resolve();
              });
            });
          })
          .catch(function () {
            /* Textured pass failed or optional — matcap thumb may already show. */
          });
      }

      if (ext === "tga" && typeof TGA !== "undefined") {
        var r = TGA.decodeToCanvas(data);
        if (!r.ok) throw new Error(r.error || "tga");
        return new Promise(function (resolve) {
          thumbCanvasToBlob(r.canvas, 256, function (blob) {
            if (!previewEl.isConnected) {
              resolve();
              return;
            }
            finishWithBlob(blob);
            resolve();
          });
        });
      }

      if (ext === "dds" && typeof DDS !== "undefined") {
        var dds = DDS.decodeToCanvas(data);
        if (!dds.ok) throw new Error(dds.error || "dds");
        return new Promise(function (resolve) {
          thumbCanvasToBlob(dds.canvas, 256, function (blob) {
            if (!previewEl.isConnected) {
              resolve();
              return;
            }
            finishWithBlob(blob);
            resolve();
          });
        });
      }

      if (ext === "rsh" && typeof RSH !== "undefined" && typeof DDS !== "undefined") {
        var ddsFromRsh = RSH.extractDdsBytes(data);
        if (!ddsFromRsh || !ddsFromRsh.length) throw new Error("no embedded DDS");
        var rshDds = DDS.decodeToCanvas(ddsFromRsh);
        if (!rshDds.ok) throw new Error(rshDds.error || "rsh");
        return new Promise(function (resolve) {
          thumbCanvasToBlob(rshDds.canvas, 256, function (blob) {
            if (!previewEl.isConnected) {
              resolve();
              return;
            }
            finishWithBlob(blob);
            resolve();
          });
        });
      }

      var mime = mimeForRasterExt(ext);
      if (!mime) throw new Error("unsupported");
      finishWithBlob(new Blob([data], { type: mime }));
    })
    .catch(function () {
      previewEl.dataset.thumbState = "error";
      if (state.gridThumbObserver) state.gridThumbObserver.unobserve(previewEl);
    });
}
