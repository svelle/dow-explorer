"use strict";

import { state } from "../state.js";
import { $ } from "../util.js";
import { disposeAudioUi } from "./audio.js";
import { disposeImageUi } from "./image.js";
import { resetAuxiliaryPreviewDom } from "./dom-reset.js";

var whmTextureResizeObserver = null;
var whmModeIsTexture = false;
var LS_WHM_MESHES_COLLAPSED = "sga-browser-whm-meshes-collapsed";
/** @type {{ label: string, texture: object, previewCanvas?: object, previewImageData?: ImageData | null }[]} */
var whmTextureCatalog = [];

function detachWhmTextureUi() {
  if (whmTextureResizeObserver) {
    try {
      whmTextureResizeObserver.disconnect();
    } catch (e) {}
    whmTextureResizeObserver = null;
  }
}

function resetWhmPreviewChrome() {
  var modelBtn = $("preview-whm-mode-model");
  var texBtn = $("preview-whm-mode-texture");
  var texWrap = $("preview-whm-texture-wrap");
  var canvas = $("preview-whm-canvas");
  var selRow = $("preview-whm-texture-select-row");
  var sel = $("preview-whm-texture-select");
  whmModeIsTexture = false;
  whmTextureCatalog = [];
  detachWhmTextureUi();
  if (modelBtn) {
    modelBtn.classList.add("active");
    modelBtn.setAttribute("aria-pressed", "true");
  }
  if (texBtn) {
    texBtn.classList.remove("active");
    texBtn.setAttribute("aria-pressed", "false");
    texBtn.disabled = true;
  }
  if (texWrap) {
    texWrap.hidden = true;
    texWrap.setAttribute("aria-hidden", "true");
  }
  if (canvas) canvas.hidden = false;
  if (selRow) selRow.hidden = true;
  var mapWrap = $("preview-whm-texture-map-wrap");
  if (mapWrap) mapWrap.hidden = true;
  var uvOv = $("preview-whm-uv-overlay");
  if (uvOv) {
    uvOv.checked = false;
    uvOv.onchange = null;
  }
  if (sel) {
    sel.innerHTML = "";
    sel.onchange = null;
  }
  var displayLabel = $("preview-whm-display-label");
  if (displayLabel) {
    displayLabel.hidden = false;
    displayLabel.removeAttribute("aria-hidden");
  }
  var hint = $("preview-whm-hint");
  if (hint) {
    hint.hidden = false;
    hint.removeAttribute("aria-hidden");
  }
  var skelLbl = document.querySelector(".preview-whm-skel-label");
  if (skelLbl) {
    skelLbl.setAttribute("data-whm-has-skel", "0");
    skelLbl.hidden = true;
    skelLbl.setAttribute("aria-hidden", "true");
  }
  var animBar = $("preview-whm-anim-bar");
  if (animBar) {
    animBar.setAttribute("data-whm-has-anim", "0");
    animBar.hidden = true;
    animBar.setAttribute("aria-hidden", "true");
  }
  var boneTip = $("preview-whm-bone-tooltip");
  if (boneTip) {
    boneTip.hidden = true;
    boneTip.textContent = "";
  }
  var dbgPre = $("preview-whm-debug-body");
  if (dbgPre) dbgPre.textContent = "";
}

function resolveCatalogImageSource(entry) {
  if (!entry) return null;
  var tex = entry.texture;
  var src = entry.previewCanvas;
  if (tex && tex.userData && tex.userData.sgaPreview2d) {
    src = tex.userData.sgaPreview2d;
  }
  var w0 =
    src &&
    (typeof src.width === "number"
      ? src.width
      : src.naturalWidth || src.videoWidth || 0);
  if (src && w0 > 0) return src;
  if (!tex) return null;
  src = tex.image != null ? tex.image : tex.source && tex.source.data;
  if (!src) return null;
  w0 =
    typeof src.width === "number"
      ? src.width
      : src.naturalWidth || src.videoWidth || 0;
  return w0 > 0 ? src : null;
}

function scheduleDrawWhmTexturePanel() {
  if (typeof requestAnimationFrame === "undefined") {
    drawWhmTexturePanel();
    return;
  }
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      drawWhmTexturePanel();
    });
  });
}

function drawWhmTexturePanel() {
  var dbg =
    typeof globalThis !== "undefined" && !!globalThis.__SGA_DEBUG_WHM_TEXTURE__;
  var dst = $("preview-whm-texture-canvas");
  var wrap = $("preview-whm-texture-wrap");
  var sel = $("preview-whm-texture-select");
  var selRow = $("preview-whm-texture-select-row");
  var parent = $("preview-whm-canvas-wrap") || (wrap && wrap.parentElement);
  if (!dst || !wrap || !whmTextureCatalog.length) {
    if (dbg) {
      console.warn("[whm texture] skip draw", {
        dst: !!dst,
        wrap: !!wrap,
        parent: !!parent,
        catalogLen: whmTextureCatalog.length,
      });
    }
    return;
  }
  var idx = sel && sel.selectedIndex >= 0 ? sel.selectedIndex : 0;
  if (idx < 0 || idx >= whmTextureCatalog.length) idx = 0;
  var entry = whmTextureCatalog[idx];
  var blitSource = null;
  var sw = 1;
  var sh = 1;
  var idata = entry.previewImageData;
  if (
    idata &&
    idata.width > 0 &&
    idata.height > 0 &&
    idata.data &&
    idata.data.length
  ) {
    sw = idata.width;
    sh = idata.height;
    var tmp = document.createElement("canvas");
    tmp.width = sw;
    tmp.height = sh;
    var tcx = tmp.getContext("2d");
    if (tcx) {
      try {
        tcx.putImageData(idata, 0, 0);
        blitSource = tmp;
      } catch (e) {
        if (dbg) console.warn("[whm texture] putImageData failed", entry.label, e);
      }
    }
  }
  if (!blitSource) {
    var src = resolveCatalogImageSource(entry);
    if (!src) {
      if (dbg) {
        console.warn("[whm texture] no image source", {
          idx: idx,
          label: entry && entry.label,
          hasTex: !!(entry && entry.texture),
          hadSnap: !!(idata && idata.width),
        });
      }
      return;
    }
    sw =
      typeof src.width === "number" ? src.width : src.naturalWidth || src.videoWidth || 1;
    sh =
      typeof src.height === "number"
        ? src.height
        : src.naturalHeight || src.videoHeight || 1;
    blitSource = src;
  }

  var rect = wrap.getBoundingClientRect();
  var w = Math.max(1, Math.round(rect.width || wrap.clientWidth || 0));
  var h = Math.max(1, Math.round(rect.height || wrap.clientHeight || 0));
  if ((w < 2 || h < 2) && parent) {
    var pr = parent.getBoundingClientRect();
    w = Math.max(1, Math.round(pr.width || parent.clientWidth || 1));
    h = Math.max(1, Math.round(pr.height || parent.clientHeight || 1));
  }

  var rowH = 0;
  if (selRow && !selRow.hidden) {
    rowH = selRow.offsetHeight || 0;
  }
  var drawH = Math.max(1, h - rowH);

  var dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  dst.width = (w * dpr) | 0;
  dst.height = (drawH * dpr) | 0;
  dst.style.width = w + "px";
  dst.style.height = drawH + "px";
  var ctx = dst.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#252528";
  ctx.fillRect(0, 0, w, drawH);

  if (!(sw > 0) || !(sh > 0)) {
    if (dbg) console.warn("[whm texture] bad source size", { sw: sw, sh: sh });
    return;
  }

  var scale = Math.min(w / sw, drawH / sh);
  var dw = sw * scale;
  var dh = sh * scale;
  var ox = (w - dw) * 0.5;
  var oy = (drawH - dh) * 0.5;
  ctx.imageSmoothingEnabled = true;

  function blit(source) {
    ctx.drawImage(source, 0, 0, sw, sh, ox, oy, dw, dh);
  }
  try {
    blit(blitSource);
    if (dbg) {
      console.log("[whm texture] blit ok", {
        label: entry.label,
        sw: sw,
        sh: sh,
        w: w,
        drawH: drawH,
        fromSnap: !!(idata && idata.width),
      });
    }
  } catch (e) {
    if (dbg) console.warn("[whm texture] drawImage failed", entry.label, e);
    if (
      !idata &&
      typeof HTMLCanvasElement !== "undefined" &&
      blitSource instanceof HTMLCanvasElement
    ) {
      var clone = document.createElement("canvas");
      clone.width = sw;
      clone.height = sh;
      var c2 = clone.getContext("2d");
      if (c2) {
        try {
          c2.drawImage(blitSource, 0, 0);
          blit(clone);
          if (dbg) console.log("[whm texture] blit via clone ok", entry.label);
        } catch (e2) {
          if (dbg) console.warn("[whm texture] clone blit failed", entry.label, e2);
        }
      }
    }
  }

  var uvOv = $("preview-whm-uv-overlay");
  if (
    uvOv &&
    uvOv.checked &&
    typeof WhmPreview !== "undefined" &&
    WhmPreview.getUvTrianglesForShader
  ) {
    var tris = WhmPreview.getUvTrianglesForShader(entry.label);
    if (tris && tris.length) {
      var maxT = 14000;
      var triStep = tris.length > maxT ? Math.ceil(tris.length / maxT) : 1;
      ctx.save();
      ctx.strokeStyle = "rgba(0, 230, 130, 0.88)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      /* Mesh uses v_mesh = 1 - v_file; bitmap is file space (v downward from top). */
      function uvToPx(uMesh, vMesh) {
        return [ox + uMesh * dw, oy + (1 - vMesh) * dh];
      }
      for (var ti = 0; ti < tris.length; ti += triStep) {
        var tri = tris[ti];
        if (!tri || tri.length < 6) continue;
        var p0 = uvToPx(tri[0], tri[1]);
        var p1 = uvToPx(tri[2], tri[3]);
        var p2 = uvToPx(tri[4], tri[5]);
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}

function setWhmPreviewMode(mode) {
  var modelBtn = $("preview-whm-mode-model");
  var texBtn = $("preview-whm-mode-texture");
  var texWrap = $("preview-whm-texture-wrap");
  var canvas = $("preview-whm-canvas");
  var isTex = mode === "texture";
  whmModeIsTexture = isTex;
  if (modelBtn) {
    modelBtn.classList.toggle("active", !isTex);
    modelBtn.setAttribute("aria-pressed", !isTex ? "true" : "false");
  }
  if (texBtn) {
    texBtn.classList.toggle("active", isTex);
    texBtn.setAttribute("aria-pressed", isTex ? "true" : "false");
  }
  if (texWrap) {
    texWrap.hidden = !isTex;
    texWrap.setAttribute("aria-hidden", isTex ? "false" : "true");
  }
  if (canvas) canvas.hidden = isTex;
  var displayLabel = $("preview-whm-display-label");
  if (displayLabel) {
    displayLabel.hidden = isTex;
    displayLabel.setAttribute("aria-hidden", isTex ? "true" : "false");
  }
  var skelLbl = document.querySelector(".preview-whm-skel-label");
  if (skelLbl) {
    var showSkel = skelLbl.getAttribute("data-whm-has-skel") === "1";
    var hideSkelChrome = isTex || !showSkel;
    skelLbl.hidden = hideSkelChrome;
    skelLbl.setAttribute("aria-hidden", hideSkelChrome ? "true" : "false");
  }
  var animBar = $("preview-whm-anim-bar");
  if (animBar) {
    var showAnim = animBar.getAttribute("data-whm-has-anim") === "1";
    var hideAnimChrome = isTex || !showAnim;
    animBar.hidden = hideAnimChrome;
    animBar.setAttribute("aria-hidden", hideAnimChrome ? "true" : "false");
  }
  var hint = $("preview-whm-hint");
  if (hint) {
    hint.hidden = isTex;
    hint.setAttribute("aria-hidden", isTex ? "true" : "false");
  }
  if (isTex) {
    scheduleDrawWhmTexturePanel();
  } else if (typeof WhmPreview !== "undefined" && WhmPreview.resize) {
    WhmPreview.resize();
  }
}

function applyWhmMeshesPanelCollapsed(collapsed) {
  var inner = document.querySelector(".preview-whm-inner");
  var btn = $("preview-whm-meshes-toggle");
  var icon = btn && btn.querySelector(".preview-whm-meshes-toggle-icon");
  if (!inner || !btn) return;
  inner.classList.toggle("preview-whm-inner--meshes-collapsed", collapsed);
  btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  btn.title = collapsed ? "Show mesh list" : "Hide mesh list";
  btn.setAttribute("aria-label", collapsed ? "Show mesh list" : "Hide mesh list");
  if (icon) icon.textContent = collapsed ? "▶" : "◀";
  try {
    localStorage.setItem(LS_WHM_MESHES_COLLAPSED, collapsed ? "1" : "0");
  } catch (e) {}
}

function setupWhmMeshesPanelToggle() {
  var inner = document.querySelector(".preview-whm-inner");
  var btn = $("preview-whm-meshes-toggle");
  var sidebar = $("preview-whm-sidebar");
  if (!inner || !btn || !sidebar) return;
  if (sidebar.hidden) {
    btn.hidden = true;
    inner.classList.remove("preview-whm-inner--meshes-collapsed");
    return;
  }
  btn.hidden = false;
  var collapsed = false;
  try {
    collapsed = localStorage.getItem(LS_WHM_MESHES_COLLAPSED) === "1";
  } catch (e) {}
  applyWhmMeshesPanelCollapsed(collapsed);
  btn.onclick = function () {
    applyWhmMeshesPanelCollapsed(
      !inner.classList.contains("preview-whm-inner--meshes-collapsed")
    );
    if (typeof WhmPreview !== "undefined" && WhmPreview.resize) {
      WhmPreview.resize();
      requestAnimationFrame(function () {
        if (WhmPreview.resize) WhmPreview.resize();
      });
    }
    if (whmModeIsTexture) scheduleDrawWhmTexturePanel();
  };
  if (typeof WhmPreview !== "undefined" && WhmPreview.resize) {
    WhmPreview.resize();
    requestAnimationFrame(function () {
      if (WhmPreview.resize) WhmPreview.resize();
    });
  }
  if (whmModeIsTexture) scheduleDrawWhmTexturePanel();
}

function setupWhmPreviewChromeAfterLoad() {
  detachWhmTextureUi();
  /* Do not call resetWhmPreviewChrome() here: load() already ran after disposeWhm() reset it,
   * and bindSkelAnimControls just updated the DOM. A second reset would hide skeleton/anim chrome. */
  var modelBtn = $("preview-whm-mode-model");
  var texBtn = $("preview-whm-mode-texture");
  var texWrap = $("preview-whm-texture-wrap");
  var sel = $("preview-whm-texture-select");
  var selRow = $("preview-whm-texture-select-row");
  var mapWrap = $("preview-whm-texture-map-wrap");
  var uvOv = $("preview-whm-uv-overlay");
  var canvasWrap = $("preview-whm-canvas-wrap");
  if (!modelBtn || !texBtn || !texWrap) return;

  whmTextureCatalog =
    typeof WhmPreview !== "undefined" && WhmPreview.getTextureCatalog
      ? WhmPreview.getTextureCatalog()
      : [];

  if (whmTextureCatalog.length > 0) {
    texBtn.disabled = false;
    if (selRow) selRow.hidden = false;
    if (mapWrap) mapWrap.hidden = whmTextureCatalog.length <= 1;
    if (sel) {
      whmTextureCatalog.forEach(function (e, i) {
        var opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = e.label;
        sel.appendChild(opt);
      });
      sel.onchange = function () {
        if (whmModeIsTexture) scheduleDrawWhmTexturePanel();
      };
    }
    if (uvOv) {
      uvOv.onchange = function () {
        if (whmModeIsTexture) scheduleDrawWhmTexturePanel();
      };
    }
  } else {
    if (texBtn) texBtn.disabled = true;
    if (selRow) selRow.hidden = true;
    if (mapWrap) mapWrap.hidden = true;
  }

  modelBtn.onclick = function () {
    setWhmPreviewMode("model");
  };
  texBtn.onclick = function () {
    if (texBtn.disabled) return;
    setWhmPreviewMode("texture");
  };

  if (canvasWrap && typeof ResizeObserver !== "undefined") {
    whmTextureResizeObserver = new ResizeObserver(function () {
      if (whmModeIsTexture) scheduleDrawWhmTexturePanel();
    });
    whmTextureResizeObserver.observe(canvasWrap);
  }

  setupWhmMeshesPanelToggle();
}

export function disposeWhm() {
  resetWhmPreviewChrome();
  if (typeof WhmPreview !== "undefined" && WhmPreview.dispose) {
    WhmPreview.dispose();
  }
  var meshToggle = $("preview-whm-meshes-toggle");
  var inner = document.querySelector(".preview-whm-inner");
  if (meshToggle) {
    meshToggle.hidden = true;
    meshToggle.onclick = null;
  }
  if (inner) inner.classList.remove("preview-whm-inner--meshes-collapsed");
}

function hidePreviewWhmWrap() {
  var w = $("preview-whm-wrap");
  if (w) w.hidden = true;
}

/**
 * Resolve a Relic logical path (no extension) to .rsh bytes by searching all loaded SGA archives.
 * @param {string} pathNoExt e.g. art/ebps/races/space_marines/texture_share/chaplain
 * @returns {Promise<Uint8Array | null>}
 */
export async function resolveWhmTextureFile(pathNoExt) {
  if (typeof SGA === "undefined" || typeof SGA.findFileByLogicalPath !== "function") {
    return null;
  }
  var rel = String(pathNoExt || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!rel) return null;
  var candidates = [rel + ".rsh", rel.replace(/\//g, "\\") + ".rsh"];
  for (var ai = 0; ai < state.archives.length; ai++) {
    var ent = state.archives[ai];
    if (!ent || !ent.parsed) continue;
    for (var ci = 0; ci < candidates.length; ci++) {
      var fe = SGA.findFileByLogicalPath(ent.parsed, candidates[ci]);
      if (fe) {
        return await SGA.readFileData(ent.parsed, fe);
      }
    }
  }
  return null;
}

/**
 * Load sibling `.whe` animation file for a `.whm` logical path (same stem).
 * @param {string} whmPath e.g. art/.../unit.whm
 * @returns {Promise<Uint8Array | null>}
 */
/**
 * @param {string} whmPath — full logical path inside archives (folder + file.whm)
 * @param {object} [debugOut] — filled when provided: candidates, found, matchedCandidate, …
 */
export async function resolveWhmSiblingWhe(whmPath, debugOut) {
  if (typeof SGA === "undefined" || typeof SGA.findFileByLogicalPath !== "function") {
    if (debugOut) debugOut.error = "SGA.findFileByLogicalPath unavailable";
    return null;
  }
  var rel = String(whmPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (debugOut) {
    debugOut.normalizedWhmPath = rel;
    debugOut.skipReason = null;
  }
  if (!rel || !/\.whm$/i.test(rel)) {
    if (debugOut) debugOut.skipReason = "path missing or not .whm (need full archive path, not leaf name only)";
    return null;
  }
  var base = rel.replace(/\.whm$/i, "");
  var candidates = [base + ".whe", base.replace(/\//g, "\\") + ".whe"];
  if (debugOut) {
    debugOut.candidates = candidates.slice();
    debugOut.matchedCandidate = null;
    debugOut.found = false;
    debugOut.byteLength = 0;
    debugOut.searchArchives = state.archives ? state.archives.length : 0;
  }
  for (var ai = 0; ai < state.archives.length; ai++) {
    var ent = state.archives[ai];
    if (!ent || !ent.parsed) continue;
    for (var ci = 0; ci < candidates.length; ci++) {
      var fe = SGA.findFileByLogicalPath(ent.parsed, candidates[ci]);
      if (fe) {
        var data = await SGA.readFileData(ent.parsed, fe);
        if (debugOut) {
          debugOut.found = true;
          debugOut.matchedCandidate = candidates[ci];
          debugOut.archiveIndex = ai;
          debugOut.byteLength = data ? data.byteLength || data.length : 0;
        }
        return data;
      }
    }
  }
  return null;
}

export function setPreviewWhm(u8, fileName) {
  var w = $("preview-whm-wrap");
  var canvas = $("preview-whm-canvas");
  if (!w || !canvas || typeof WhmPreview === "undefined" || typeof WHM === "undefined") {
    w.hidden = true;
    var pre0 = $("preview-content");
    var wrap0 = $("preview-text-wrap");
    if (wrap0) wrap0.hidden = false;
    if (pre0) {
      pre0.hidden = false;
      pre0.textContent = "WHM preview: viewer not available";
    }
    return;
  }
  disposeImageUi();
  disposeAudioUi();
  resetAuxiliaryPreviewDom();
  disposeWhm();
  hidePreviewWhmWrap();
  var aud = $("preview-audio");
  var awrap = $("preview-audio-wrap");
  if (aud) {
    aud.pause();
    aud.removeAttribute("src");
  }
  var wrap = $("preview-text-wrap");
  var pre = $("preview-content");
  var img = $("preview-image");
  if (!pre || !img) return;
  if (wrap) wrap.hidden = true;
  pre.hidden = true;
  img.hidden = true;
  img.removeAttribute("src");
  var sidebar = $("preview-whm-sidebar");
  resolveWhmSiblingWhe(fileName, null)
    .then(function (wheBytes) {
      return WhmPreview.load(u8, canvas, sidebar, resolveWhmTextureFile, {
        wheBytes: wheBytes,
        whmLogicalPath: fileName,
      });
    })
    .then(function (r) {
      if (!r || !r.ok) {
        w.hidden = true;
        var pre1 = $("preview-content");
        var wrap1 = $("preview-text-wrap");
        if (wrap1) wrap1.hidden = false;
        if (pre1) {
          pre1.hidden = false;
          pre1.textContent = "WHM preview: " + (r && r.error ? r.error : "failed");
        }
        return;
      }
      setupWhmPreviewChromeAfterLoad();
      w.hidden = false;
    })
    .catch(function (err) {
      w.hidden = true;
      var pre2 = $("preview-content");
      var wrap2 = $("preview-text-wrap");
      if (wrap2) wrap2.hidden = false;
      if (pre2) {
        pre2.hidden = false;
        pre2.textContent =
          "WHM preview: " + (err && err.message ? err.message : String(err));
      }
    });
}

export { hidePreviewWhmWrap };
