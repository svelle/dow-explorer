/**
 * Relic .rsh (shader) — textures for DoW Chunky:
 * - Embedded DDS (magic + header) inside any chunk body, or
 * - FOLDIMAG → DATAATTR + DATADATA: raw DXT or TGA payload (no DDS wrapper; see blender_dow textures.write_dds / write_tga).
 */
(function (global) {
  "use strict";

  var DDS_MAGIC_LE = 0x20534444; /* 'DDS ' as little-endian uint32 */
  var DOW_DXT_FLAGS_BASE = 0x00081007;
  var DOW_DXT_FLAG_MIPMAP = 0x20000;
  var DDPF_FOURCC = 4;
  var DOW_DDSCAPS_TEXTURE = 0x401008;

  /* ATTR (DATAATTR): image_format, width, height, num_mips — blender_dow importer CH_FOLDTXTR */
  var IMG_FMT_TGA_0 = 0;
  var IMG_FMT_TGA_1 = 1;
  var IMG_FMT_TGA_2 = 2;
  var IMG_FMT_DXT1 = 8;
  var IMG_FMT_DXT3 = 10;
  var IMG_FMT_DXT5 = 11;

  function typeidKey(t) {
    return String(t || "")
      .replace(/\0/g, "")
      .trim()
      .toUpperCase();
  }

  function sliceFromDdsMagic(body) {
    if (!body || body.length < 128) return null;
    var max = body.length - 128;
    var buf = body.buffer;
    var base = body.byteOffset;
    for (var i = 0; i <= max; i++) {
      var dv = new DataView(buf, base + i, 128);
      if (dv.getUint32(0, true) !== DDS_MAGIC_LE) continue;
      if (dv.getUint32(4, true) !== 124) continue;
      return body.subarray(i);
    }
    return null;
  }

  function walkChunks(u8, start, end, out) {
    if (out.ref) return;
    Chunky.forEachChunk(u8, start, end, function (h, body) {
      if (out.ref) return;
      var dds = sliceFromDdsMagic(body);
      if (dds) {
        out.ref = dds;
        return;
      }
      if (typeidKey(h.typeid).indexOf("FOLD") === 0) {
        walkChunks(body, 0, body.length, out);
      }
    });
  }

  /**
   * @param {Uint8Array} imagBody — body of FOLDIMAG
   * @returns {{ attr: Uint8Array, data: Uint8Array } | null}
   */
  function readAttrDataPair(imagBody) {
    if (!imagBody || !imagBody.length) return null;
    var attr = null;
    var dat = null;
    Chunky.forEachChunk(imagBody, 0, imagBody.length, function (h, body) {
      var t = typeidKey(h.typeid);
      if (t === "DATAATTR") attr = body;
      if (t === "DATADATA") dat = body;
    });
    if (!attr || !dat) return null;
    return { attr: attr, data: dat };
  }

  /**
   * @param {Uint8Array} attrBody
   * @returns {{ format: number, width: number, height: number, mips: number } | null}
   */
  function parseDataAttr(attrBody) {
    if (!attrBody || attrBody.length < 12) return null;
    var dv = new DataView(attrBody.buffer, attrBody.byteOffset, attrBody.byteLength);
    var fmt = dv.getInt32(0, true);
    var width = dv.getInt32(4, true);
    var height = dv.getInt32(8, true);
    var mips = attrBody.length >= 16 ? dv.getInt32(12, true) : 0;
    if (width <= 0 || height <= 0 || width > 8192 || height > 8192) return null;
    return { format: fmt, width: width, height: height, mips: mips };
  }

  function isDxtFormat(fmt) {
    return fmt === IMG_FMT_DXT1 || fmt === IMG_FMT_DXT3 || fmt === IMG_FMT_DXT5;
  }

  function isTgaFormat(fmt) {
    return fmt === IMG_FMT_TGA_0 || fmt === IMG_FMT_TGA_1 || fmt === IMG_FMT_TGA_2;
  }

  function fourCcFromDxtFormat(fmt) {
    if (fmt === IMG_FMT_DXT1) return "DXT1";
    if (fmt === IMG_FMT_DXT3) return "DXT3";
    if (fmt === IMG_FMT_DXT5) return "DXT5";
    return null;
  }

  /**
   * DDS file header (128 bytes before pixel data) — matches blender_dow textures.write_dds struct.
   */
  function buildDowDxtDdsHeader(width, height, numMips, dataSize, imageFormat) {
    var cc = fourCcFromDxtFormat(imageFormat);
    if (!cc) return null;
    var flags = DOW_DXT_FLAGS_BASE | (numMips > 0 ? DOW_DXT_FLAG_MIPMAP : 0);
    var buf = new ArrayBuffer(128);
    var dv = new DataView(buf);
    dv.setUint32(0, DDS_MAGIC_LE, true);
    dv.setUint32(4, 124, true);
    dv.setUint32(8, flags, true);
    dv.setUint32(12, height, true);
    dv.setUint32(16, width, true);
    dv.setUint32(20, dataSize, true);
    dv.setUint32(24, 0, true);
    dv.setUint32(28, numMips >>> 0, true);
    /* 32–75 reserved */
    dv.setUint32(76, 32, true);
    dv.setUint32(80, DDPF_FOURCC, true);
    dv.setUint8(84, cc.charCodeAt(0));
    dv.setUint8(85, cc.charCodeAt(1));
    dv.setUint8(86, cc.charCodeAt(2));
    dv.setUint8(87, cc.charCodeAt(3));
    /* 88–107: bitcount + masks (zeros for FOURCC) */
    dv.setUint32(108, DOW_DDSCAPS_TEXTURE, true);
    dv.setUint32(112, 0, true);
    return new Uint8Array(buf);
  }

  /**
   * Uncompressed TGA type 2, 32 bpp — blender_dow textures.write_tga header + raw BGRA rows.
   */
  function buildTgaFromRaw(width, height, rawPixels) {
    if (!rawPixels || rawPixels.length < width * height * 4) return null;
    /* Matches blender_dow textures.write_tga: <3B 2HB 4H2B */
    var hdr = new ArrayBuffer(18);
    var dv = new DataView(hdr);
    dv.setUint8(0, 0);
    dv.setUint8(1, 0);
    dv.setUint8(2, 2);
    dv.setUint16(3, 0, true);
    dv.setUint16(5, 0, true);
    dv.setUint8(7, 32);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, width, true);
    dv.setUint16(14, height, true);
    dv.setUint8(16, 32);
    dv.setUint8(17, 0);
    var header = new Uint8Array(hdr);
    var out = new Uint8Array(18 + rawPixels.length);
    out.set(header, 0);
    out.set(rawPixels, 18);
    return out;
  }

  function walkForFoldImag(u8, start, end, out) {
    if (out.ref) return;
    Chunky.forEachChunk(u8, start, end, function (h, body) {
      if (out.ref) return;
      var tid = typeidKey(h.typeid);
      if (tid === "FOLDIMAG") {
        var pair = readAttrDataPair(body);
        if (pair) {
          out.ref = pair;
          return;
        }
      }
      if (tid.indexOf("FOLD") === 0) {
        walkForFoldImag(body, 0, body.length, out);
      }
    });
  }

  function tryEmbeddedDds(u8) {
    if (!u8 || u8.length < 128 || typeof Chunky === "undefined") return null;
    var off =
      typeof Chunky.getFirstChunkOffset === "function" ? Chunky.getFirstChunkOffset(u8) : 28;
    if (off < 0) off = 24;
    var out = { ref: null };
    walkChunks(u8, off, u8.length, out);
    if (out.ref) return out.ref;
    var tail = u8.subarray(off);
    return sliceFromDdsMagic(tail);
  }

  function tryImagPair(u8) {
    if (!u8 || typeof Chunky === "undefined") return null;
    var off =
      typeof Chunky.getFirstChunkOffset === "function" ? Chunky.getFirstChunkOffset(u8) : 28;
    if (off < 0) off = 24;
    var out = { ref: null };
    walkForFoldImag(u8, off, u8.length, out);
    return out.ref;
  }

  /**
   * @param {Uint8Array} u8 full .rsh file
   * @returns {Uint8Array | null} bytes suitable for DDS.decodeToCanvas (embedded or synthesized)
   */
  function extractDdsBytes(u8) {
    var emb = tryEmbeddedDds(u8);
    if (emb) return emb;

    var pair = tryImagPair(u8);
    if (!pair) return null;
    var meta = parseDataAttr(pair.attr);
    if (!meta || !isDxtFormat(meta.format)) return null;
    var hdr = buildDowDxtDdsHeader(meta.width, meta.height, meta.mips, pair.data.byteLength, meta.format);
    if (!hdr) return null;
    var out = new Uint8Array(hdr.length + pair.data.length);
    out.set(hdr, 0);
    out.set(pair.data, hdr.length);
    return out;
  }

  /**
   * @param {Uint8Array} u8 full .rsh file
   * @returns {Uint8Array | null} bytes suitable for TGA.decodeToCanvas
   */
  function extractTgaBytes(u8) {
    var emb = tryEmbeddedDds(u8);
    if (emb) return null;

    var pair = tryImagPair(u8);
    if (!pair) return null;
    var meta = parseDataAttr(pair.attr);
    if (!meta || !isTgaFormat(meta.format)) return null;
    return buildTgaFromRaw(meta.width, meta.height, pair.data);
  }

  /**
   * @param {Uint8Array} u8
   * @returns {{ ok: true, canvas: HTMLCanvasElement } | { ok: false, error: string }}
   */
  function decodePreviewToCanvas(u8) {
    if (!u8 || !u8.length) {
      return { ok: false, error: "Empty file" };
    }
    var ddsBytes = extractDdsBytes(u8);
    if (ddsBytes && ddsBytes.length && typeof DDS !== "undefined") {
      var d = DDS.decodeToCanvas(ddsBytes);
      if (d.ok && d.canvas) return d;
    }
    var tgaBytes = extractTgaBytes(u8);
    if (tgaBytes && tgaBytes.length && typeof TGA !== "undefined") {
      var t = TGA.decodeToCanvas(tgaBytes);
      if (t.ok && t.canvas) return t;
    }
    return {
      ok: false,
      error:
        "No usable texture (embedded DDS, or FOLDIMAG DATAATTR/DATADATA with DXT or TGA)",
    };
  }

  function formatCodeLabel(fmt) {
    if (fmt === IMG_FMT_DXT1) return "DXT1";
    if (fmt === IMG_FMT_DXT3) return "DXT3";
    if (fmt === IMG_FMT_DXT5) return "DXT5";
    if (fmt === IMG_FMT_TGA_0 || fmt === IMG_FMT_TGA_1 || fmt === IMG_FMT_TGA_2) return "TGA (fmt " + fmt + ")";
    return String(fmt);
  }

  function walkFoldSummary(u8, start, end, out) {
    Chunky.forEachChunk(u8, start, end, function (h, body) {
      var tid = typeidKey(h.typeid);
      if (tid === "DATAHEAD" && body.length >= 8) {
        var dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
        out.dataHeadImageType = dv.getInt32(0, true);
        out.dataHeadNumImages = dv.getInt32(4, true);
      }
      if (tid.indexOf("FOLD") === 0) walkFoldSummary(body, 0, body.length, out);
    });
  }

  function ddsHeaderDims(dds) {
    if (!dds || dds.length < 32) return null;
    var dv = new DataView(dds.buffer, dds.byteOffset, Math.min(dds.byteLength, 32));
    if (dv.getUint32(0, true) !== DDS_MAGIC_LE) return null;
    var height = dv.getUint32(12, true);
    var width = dv.getUint32(16, true);
    if (!width || !height || width > 8192 || height > 8192) return null;
    return { width: width, height: height };
  }

  /**
   * Human-readable lines for preview chrome (DATAHEAD + texture dimensions / format).
   * @param {Uint8Array} u8
   * @returns {string[]}
   */
  function getPreviewTextureInfoLines(u8) {
    if (!u8 || typeof Chunky === "undefined") return [];
    var off =
      typeof Chunky.getFirstChunkOffset === "function" ? Chunky.getFirstChunkOffset(u8) : 28;
    if (off < 0) off = 24;
    var out = {};
    walkFoldSummary(u8, off, u8.length, out);
    var lines = [];
    if (out.dataHeadImageType !== undefined) {
      lines.push("HEAD: image_type=" + out.dataHeadImageType + ", num_images=" + out.dataHeadNumImages);
    }
    var pair = tryImagPair(u8);
    if (pair) {
      var meta = parseDataAttr(pair.attr);
      if (meta) {
        lines.push(
          "Texture: " + meta.width + "×" + meta.height + " · " + formatCodeLabel(meta.format) + " · mips " + meta.mips
        );
      }
    }
    var hasTexLine = lines.some(function (l) { return l.indexOf("Texture:") === 0; });
    var emb = tryEmbeddedDds(u8);
    if (emb && !hasTexLine) {
      var sm = ddsHeaderDims(emb);
      if (sm) lines.push("Embedded DDS: " + sm.width + "×" + sm.height);
    }
    return lines;
  }

  global.RSH = {
    extractDdsBytes: extractDdsBytes,
    extractTgaBytes: extractTgaBytes,
    decodePreviewToCanvas: decodePreviewToCanvas,
    getPreviewTextureInfoLines: getPreviewTextureInfoLines,
  };
})(typeof window !== "undefined" ? window : globalThis);
