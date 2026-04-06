"use strict";

import { state, getActiveArchive } from "../state.js";
import { formatHex } from "../util.js";
import { applyPreviewAudioFromBlob, setupPreviewAudio } from "./audio.js";
import { clearPreview } from "./clear.js";
import { applyPreviewImageFromBlob, applyPreviewImageFromCanvas } from "./image.js";
import { setPreviewTextMode } from "./text.js";
import { setPreviewWhm } from "./whm.js";

export { clearPreview } from "./clear.js";
export { setupPreviewAudio } from "./audio.js";
export { setPreviewTextMode } from "./text.js";
export { setPreviewWhm } from "./whm.js";

export function setPreviewAudioFromBlob(blob, displayName) {
  clearPreview();
  applyPreviewAudioFromBlob(blob, displayName);
}

export function setPreviewImageFromBlob(blob) {
  clearPreview();
  applyPreviewImageFromBlob(blob);
}

export function setPreviewImageFromCanvas(canvas) {
  clearPreview();
  applyPreviewImageFromCanvas(canvas, setPreviewTextMode);
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
      if (name.endsWith(".rgd")) {
        setPreviewTextMode(
          "-- parsed rgd properties\n" +
            "(RGD binary format not implemented — showing hex preview)\n\n" +
            formatHex(data, 256)
        );
      } else if (name.endsWith(".tga") && typeof TGA !== "undefined") {
        var tga = TGA.decodeToCanvas(data);
        if (tga.ok) {
          setPreviewImageFromCanvas(tga.canvas);
          return;
        }
        setPreviewTextMode("TGA preview: " + (tga.error || "unsupported"));
        return;
      } else if (name.endsWith(".dds") && typeof DDS !== "undefined") {
        var dds = DDS.decodeToCanvas(data);
        if (dds.ok) {
          setPreviewImageFromCanvas(dds.canvas);
          return;
        }
        setPreviewTextMode("DDS preview: " + (dds.error || "unsupported"));
        return;
      } else if (name.endsWith(".rsh") && typeof RSH !== "undefined") {
        if (typeof RSH.decodePreviewToCanvas === "function") {
          var rshPv = RSH.decodePreviewToCanvas(data);
          if (rshPv.ok && rshPv.canvas) {
            setPreviewImageFromCanvas(rshPv.canvas);
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
              setPreviewImageFromCanvas(legacyPrev.canvas);
              return;
            }
            setPreviewTextMode(
              "RSH preview: " + (legacyPrev.error || "unsupported")
            );
            return;
          }
        }
        setPreviewTextMode("RSH preview: decoder not available");
        return;
      } else if (name.endsWith(".fda") && typeof FDA !== "undefined") {
        var fda = FDA.decodeToWav(data);
        if (fda.ok) {
          setPreviewAudioFromBlob(fda.blob, SGA.fileName(arch, f.index));
          return;
        }
        setPreviewTextMode("FDA preview: " + (fda.error || "unsupported"));
        return;
      } else if (name.endsWith(".whm")) {
        setPreviewWhm(data, SGA.fileName(arch, f.index));
        return;
      } else {
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
      }
    })
    .catch(function (err) {
      setPreviewTextMode("Error: " + (err && err.message ? err.message : String(err)));
      state.cachedPreview = null;
    });
}
