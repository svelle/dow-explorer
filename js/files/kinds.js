"use strict";

/**
 * Extension badge + human-readable kind for DoW / Soulstorm assets.
 */
export function getFileKindInfo(filename) {
  var lower = String(filename).toLowerCase();
  var dot = lower.lastIndexOf(".");
  var ext = dot >= 0 ? lower.slice(dot + 1) : "";
  var table = {
    rgd: { label: "RGD", kind: "Game data (attributes)" },
    lua: { label: "LUA", kind: "Lua script" },
    scar: { label: "SCAR", kind: "SCAR script" },
    ai: { label: "AI", kind: "AI plan" },
    tga: { label: "TGA", kind: "Texture (Targa)" },
    dds: { label: "DDS", kind: "Texture (DirectDraw)" },
    rsh: { label: "RSH", kind: "Shader / texture (Relic Chunky)" },
    wtp: { label: "WTP", kind: "Team colour texture (Relic Chunky)" },
    ucs: { label: "UCS", kind: "Localization strings (UTF-16)" },
    ptx: { label: "PTX", kind: "Texture" },
    rtm: { label: "RTM", kind: "Animation" },
    whm: { label: "WHM", kind: "Mesh (Relic WHM)" },
    whe: { label: "WHE", kind: "Animation / motion (Chunky)" },
    sgb: { label: "SGB", kind: "Map / scenario (Chunky)" },
    events: { label: "EVENTS", kind: "Events script" },
    fx: { label: "FX", kind: "Effects" },
    ogg: { label: "OGG", kind: "Audio (Vorbis)" },
    wav: { label: "WAV", kind: "Audio (PCM)" },
    mp3: { label: "MP3", kind: "Audio" },
    fda: { label: "FDA", kind: "Audio (Relic FDA)" },
    txt: { label: "TXT", kind: "Text" },
    xml: { label: "XML", kind: "XML data" },
    csv: { label: "CSV", kind: "Table data" },
    json: { label: "JSON", kind: "JSON data" },
    html: { label: "HTML", kind: "Markup" },
    doc: { label: "DOC", kind: "Document" },
    squad: { label: "SQUAD", kind: "Squad template" },
    abp: { label: "ABP", kind: "Audio project" },
    prt: { label: "PRT", kind: "Particle" },
    decal: { label: "DECAL", kind: "Decal" },
    prefab: { label: "PREFAB", kind: "Prefab" },
  };
  var row = ext ? table[ext] : null;
  if (!row) {
    row = {
      label: ext ? ext.toUpperCase() : "—",
      kind: ext ? "Data file" : "No extension",
    };
  }
  return { ext: ext, label: row.label, kind: row.kind };
}

export function createKindIconArt(contentKind) {
  var wrap = document.createElement("div");
  wrap.className = "file-card-preview-art file-card-preview-art--icon";
  wrap.innerHTML = FileKindIcons.getSvgHtml(contentKind);
  return wrap;
}

export function mimeForRasterExt(ext) {
  var m = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    ico: "image/x-icon",
  };
  return m[(ext || "").toLowerCase()] || "";
}

export function extSupportsLazyGridThumb(ext) {
  ext = (ext || "").toLowerCase();
  if (ext === "tga") return typeof TGA !== "undefined";
  if (ext === "dds") return typeof DDS !== "undefined";
  if (ext === "rsh") {
    return typeof RSH !== "undefined" && typeof DDS !== "undefined" && typeof Chunky !== "undefined";
  }
  if (ext === "wtp") {
    return (
      typeof WTP !== "undefined" &&
      typeof WTP.renderGridThumbnail === "function" &&
      typeof Chunky !== "undefined"
    );
  }
  if (ext === "rgd") {
    return (
      typeof RGD !== "undefined" &&
      typeof RGD.renderThumbCanvas === "function" &&
      typeof Chunky !== "undefined"
    );
  }
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"].indexOf(ext) >= 0) return true;
  return false;
}

/** Lazy 3D grid thumbnail via WhmPreview.renderGridThumbnail (WHM script + Three after index.html order). */
export function extSupportsLazyWhmGridThumb() {
  return (
    typeof WHM !== "undefined" &&
    typeof THREE !== "undefined" &&
    typeof WhmPreview !== "undefined" &&
    typeof WhmPreview.renderGridThumbnail === "function"
  );
}
