/**
 * Content-kind icons (Material-style SVGs) + extension → kind mapping.
 */
(function (global) {
  "use strict";

  var SVG = {
    image:
      '<svg xmlns="http://www.w3.org/2000/svg" class="file-kind-icon-svg" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm40-80h480L570-480 450-320l-90-120-120 160Zm-40 80v-560 560Z"/></svg>',
    text:
      '<svg xmlns="http://www.w3.org/2000/svg" class="file-kind-icon-svg" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M240-280 40-480l200-200 56 56-143 144 143 144-56 56Zm178 132-76-24 200-640 76 24-200 640Zm302-132-56-56 143-144-143-144 56-56 200 200-200 200Z"/></svg>',
    binary:
      '<svg xmlns="http://www.w3.org/2000/svg" class="file-kind-icon-svg" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z"/></svg>',
    model3d:
      '<svg xmlns="http://www.w3.org/2000/svg" class="file-kind-icon-svg" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M440-181 240-296q-19-11-29.5-29T200-365v-230q0-22 10.5-40t29.5-29l200-115q19-11 40-11t40 11l200 115q19 11 29.5 29t10.5 40v230q0 22-10.5 40T720-296L520-181q-19 11-40 11t-40-11Zm0-92v-184l-160-93v185l160 92Zm80 0 160-92v-185l-160 93v184ZM80-680v-120q0-33 23.5-56.5T160-880h120v80H160v120H80ZM280-80H160q-33 0-56.5-23.5T80-160v-120h80v120h120v80Zm400 0v-80h120v-120h80v120q0 33-23.5 56.5T800-80H680Zm120-600v-120H680v-80h120q33 0 56.5 23.5T880-800v120h-80ZM480-526l158-93-158-91-158 91 158 93Zm0 45Zm0-45Zm40 69Zm-80 0Z"/></svg>',
    spreadsheet:
      '<svg xmlns="http://www.w3.org/2000/svg" class="file-kind-icon-svg" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm240-240H200v160h240v-160Zm80 0v160h240v-160H520Zm-80-80v-160H200v160h240Zm80 0h240v-160H520v160ZM200-680h560v-80H200v80Z"/></svg>',
    audio:
      '<svg xmlns="http://www.w3.org/2000/svg" class="file-kind-icon-svg" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M430-200q38 0 64-26t26-64v-150h120v-80H480v155q-11-8-23.5-11.5T430-380q-38 0-64 26t-26 64q0 38 26 64t64 26ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z"/></svg>',
    video:
      '<svg xmlns="http://www.w3.org/2000/svg" class="file-kind-icon-svg" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M360-240h160q17 0 28.5-11.5T560-280v-40l80 42v-164l-80 42v-40q0-17-11.5-28.5T520-480H360q-17 0-28.5 11.5T320-440v160q0 17 11.5 28.5T360-240ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z"/></svg>',
  };

  var KIND_LABEL = {
    image: "Image",
    text: "Text",
    binary: "Binary data",
    model3d: "3D model",
    spreadsheet: "Spreadsheet",
    audio: "Audio",
    video: "Video",
  };

  function getContentKindFromExt(ext) {
    ext = (ext || "").toLowerCase();
    if (!ext) return "binary";
    if (["tga", "dds", "rsh", "wtp", "ptx", "png", "jpg", "jpeg", "gif", "bmp", "webp"].indexOf(ext) >= 0) {
      return "image";
    }
    if (["wav", "ogg", "mp3", "fda"].indexOf(ext) >= 0) return "audio";
    if (["mp4", "bik", "avi", "webm"].indexOf(ext) >= 0) return "video";
    if (ext === "xls" || ext === "xlsx") return "spreadsheet";
    if (ext === "rgd") return "spreadsheet";
    if (["whm", "fbx", "obj"].indexOf(ext) >= 0) return "model3d";
    if (
      [
        "lua",
        "scar",
        "events",
        "sgb",
        "ai",
        "nis",
        "teamcolour",
        "rml",
        "txt",
        "md",
        "xml",
        "csv",
        "json",
        "html",
        "glsl",
        "hlsl",
        "cs",
        "cpp",
        "h",
      ].indexOf(ext) >= 0
    ) {
      return "text";
    }
    return "binary";
  }

  function getSvgHtml(kind) {
    return SVG[kind] || SVG.binary;
  }

  function kindLabel(kind) {
    return KIND_LABEL[kind] || KIND_LABEL.binary;
  }

  function isTextLikeExtension(ext) {
    return getContentKindFromExt(ext) === "text";
  }

  global.FileKindIcons = {
    getSvgHtml: getSvgHtml,
    getContentKindFromExt: getContentKindFromExt,
    kindLabel: kindLabel,
    isTextLikeExtension: isTextLikeExtension,
  };
})(typeof window !== "undefined" ? window : globalThis);
