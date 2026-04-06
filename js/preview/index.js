"use strict";

/**
 * Preview dispatch: extension-specific renderers share the same metadata/actions chrome.
 * Order: WHM → RGD → WTP → UCS → WHE (Chunky tree) → FDA → raster → text/hex fallback.
 */

import { state, getActiveArchive } from "../state.js";
import { formatHex } from "../util.js";
import { applyPreviewAudioFromBlob, setupPreviewAudio } from "./audio.js";
import { clearPreview } from "./clear.js";
import { applyPreviewImageFromBlob, applyPreviewImageFromCanvas } from "./image.js";
import { setPreviewTextMode } from "./text.js";
import { setPreviewWhm } from "./whm.js";
import { setPreviewRgdTree, setPreviewWtp, setPreviewUcsTable } from "./structured.js";
import { setPreviewChunkyTree } from "./chunky-structure.js";

export { clearPreview } from "./clear.js";
export { setupPreviewAudio } from "./audio.js";
export { setPreviewTextMode } from "./text.js";
export { setPreviewWhm } from "./whm.js";
export { setPreviewRgdTree, setPreviewWtp, setPreviewUcsTable } from "./structured.js";
export { setPreviewChunkyTree } from "./chunky-structure.js";

function chunkyPreambleLine(p) {
  if (!p) return "";
  var minor = p.minorVersion != null ? "." + p.minorVersion : "";
  return (
    "Relic Chunky · stamp 0x" +
    p.versionStamp.toString(16).toUpperCase() +
    " · platform " +
    p.platform +
    " · file v" +
    p.majorVersion +
    minor
  );
}

export function setPreviewAudioFromBlob(blob, displayName) {
  clearPreview();
  applyPreviewAudioFromBlob(blob, displayName);
}

export function setPreviewImageFromBlob(blob, metaLines) {
  clearPreview();
  applyPreviewImageFromBlob(blob, metaLines);
}

export function setPreviewImageFromCanvas(canvas, metaLines) {
  clearPreview();
  applyPreviewImageFromCanvas(canvas, setPreviewTextMode, metaLines);
}

export function loadPreview() {
  var entry = getActiveArchive();
  if (!entry || !entry.parsed || state.selection == null || state.selectedFileIndex == null) return;

  var arch = entry.parsed;
  var f = arch.files[state.selectedFileIndex];
  if (!f) return;

  setPreviewTextMode("Loading…");
  state.cachedPreview = null;

  SGA.readFileData(arch, f)
    .then(function (data) {
      state.cachedPreview = data;
      var crcEl = document.getElementById("crc-field");
      if (crcEl) crcEl.textContent = "0x" + SGA.crc32(data).toString(16).toUpperCase().padStart(8, "0");

      var name = SGA.fileName(arch, f.index).toLowerCase();
      var displayName = SGA.fileName(arch, f.index);

      if (name.endsWith(".whm")) {
        var whmLogical =
          typeof SGA.logicalPathForFile === "function"
            ? SGA.logicalPathForFile(arch, f.index)
            : displayName;
        setPreviewWhm(data, whmLogical);
        return;
      }

      if (name.endsWith(".rgd")) {
        if (typeof RGD !== "undefined") {
          var rgd = RGD.parseToTree(data);
          if (rgd.ok) {
            setPreviewRgdTree(rgd.tree);
            return;
          }
          setPreviewTextMode(
            "RGD: " + (rgd.error || "parse failed") + "\n\n" + formatHex(data, 256)
          );
        } else {
          setPreviewTextMode(
            "RGD preview: parser not loaded\n\n" + formatHex(data, 256)
          );
        }
        return;
      }

      if (name.endsWith(".wtp")) {
        if (typeof WTP !== "undefined") {
          setPreviewWtp(data);
        } else {
          setPreviewTextMode("WTP preview: parser not loaded");
        }
        return;
      }

      if (name.endsWith(".ucs")) {
        if (typeof UCS === "undefined") {
          setPreviewTextMode("UCS preview: parser not loaded");
          return;
        }
        var ucs = UCS.parseUcs(data);
        if (ucs.ok) {
          if (ucs.rows.length) {
            setPreviewUcsTable(ucs.rows);
            return;
          }
          setPreviewTextMode("UCS: no entries parsed (empty or unknown layout)");
          return;
        }
        setPreviewTextMode("UCS: " + (ucs.error || "parse failed"));
        return;
      }

      if (name.endsWith(".whe")) {
        if (typeof RelicChunkyTree === "undefined" || typeof RelicChunkyTree.parseToNodes !== "function") {
          setPreviewTextMode("WHE preview: Relic Chunky tree script not loaded");
          return;
        }
        var cw = RelicChunkyTree.parseToNodes(data);
        if (cw.ok) {
          setPreviewChunkyTree(cw.nodes, { preamble: chunkyPreambleLine(cw.preamble) });
          return;
        }
        setPreviewTextMode(
          "WHE: " + (cw.error || "could not parse as Chunky") + "\n\n" + formatHex(data, 256)
        );
        return;
      }

      if (name.endsWith(".fda") && typeof FDA !== "undefined") {
        var fda = FDA.decodeToWav(data);
        if (fda.ok) {
          setPreviewAudioFromBlob(fda.blob, displayName);
          return;
        }
        setPreviewTextMode("FDA preview: " + (fda.error || "unsupported"));
        return;
      }

      if (name.endsWith(".rsh") && typeof RSH !== "undefined") {
        var rshMeta =
          typeof RSH.getPreviewTextureInfoLines === "function" ? RSH.getPreviewTextureInfoLines(data) : [];
        if (typeof RSH.decodePreviewToCanvas === "function") {
          var rshPv = RSH.decodePreviewToCanvas(data);
          if (rshPv.ok && rshPv.canvas) {
            setPreviewImageFromCanvas(rshPv.canvas, rshMeta);
            return;
          }
          setPreviewTextMode("RSH preview: " + (rshPv.error || "unsupported"));
          return;
        }
        if (typeof RSH.extractDdsBytes === "function" && typeof DDS !== "undefined") {
          var legacyDds = RSH.extractDdsBytes(data);
          if (legacyDds && legacyDds.length) {
            var legacyPrev = DDS.decodeToCanvas(legacyDds);
            if (legacyPrev.ok) {
              setPreviewImageFromCanvas(legacyPrev.canvas, rshMeta);
              return;
            }
            setPreviewTextMode("RSH preview: " + (legacyPrev.error || "unsupported"));
            return;
          }
        }
        setPreviewTextMode("RSH preview: decoder not available");
        return;
      }

      if (name.endsWith(".tga") && typeof TGA !== "undefined") {
        var tga = TGA.decodeToCanvas(data);
        if (tga.ok) {
          setPreviewImageFromCanvas(tga.canvas);
          return;
        }
        setPreviewTextMode("TGA preview: " + (tga.error || "unsupported"));
        return;
      }

      if (name.endsWith(".dds") && typeof DDS !== "undefined") {
        var dds = DDS.decodeToCanvas(data);
        if (dds.ok) {
          setPreviewImageFromCanvas(dds.canvas);
          return;
        }
        setPreviewTextMode("DDS preview: " + (dds.error || "unsupported"));
        return;
      }

      var ext = name.indexOf(".") >= 0 ? name.slice(name.lastIndexOf(".") + 1) : "";
      var textLike =
        typeof FileKindIcons.isTextLikeExtension === "function"
          ? FileKindIcons.isTextLikeExtension(ext)
          : FileKindIcons.getContentKindFromExt(ext) === "text";
      var probeLen = Math.min(4096, data.length);
      var probeText = new TextDecoder("utf-8", { fatal: false }).decode(data.subarray(0, probeLen));
      var asciiProbe = /^[\x09\x0a\x0d\x20-\x7e]+$/.test(
        probeText.slice(0, Math.min(64, probeText.length))
      );
      var previewMax = 262144;
      if (textLike || asciiProbe) {
        var slice = data.length > previewMax ? data.subarray(0, previewMax) : data;
        var out = new TextDecoder("utf-8", { fatal: false }).decode(slice);
        if (data.length > previewMax) {
          out += "\n\n… (" + (data.length - previewMax) + " more bytes not shown)";
        }
        setPreviewTextMode(out, { lineNumbers: true });
      } else {
        setPreviewTextMode(formatHex(data, 384));
      }
    })
    .catch(function (err) {
      setPreviewTextMode("Error: " + (err && err.message ? err.message : String(err)));
      state.cachedPreview = null;
    });
}
