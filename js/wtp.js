/**
 * Dawn of War .wtp — team colour texture stack (FOLDTPAT, DATAPTLD / FOLDIMAG).
 * Layout follows blender_dow importer.load_wtp.
 */
(function (global) {
  "use strict";

  var LAYER_LABELS = {
    0: "Primary",
    1: "Secondary",
    2: "Trim",
    3: "Weapons",
    4: "Eyes",
    5: "Dirt",
    "-1": "Default",
  };

  function typeidKey(h) {
    return String(h.typeid || "")
      .replace(/\0/g, "")
      .trim()
      .toUpperCase();
  }

  function readImagPair(imagBody) {
    if (!imagBody || !imagBody.length || typeof Chunky === "undefined") return null;
    var attr = null;
    var dat = null;
    Chunky.forEachChunk(imagBody, 0, imagBody.length, function (h, body) {
      var t = typeidKey(h);
      if (t === "DATAATTR") attr = body;
      if (t === "DATADATA") dat = body;
    });
    if (!attr || !dat) return null;
    return { attr: attr, data: dat };
  }

  function parseDataAttr(attrBody) {
    if (!attrBody || attrBody.length < 12) return null;
    var dv = new DataView(attrBody.buffer, attrBody.byteOffset, attrBody.byteLength);
    return {
      format: dv.getInt32(0, true),
      width: dv.getInt32(4, true),
      height: dv.getInt32(8, true),
      mips: attrBody.length >= 16 ? dv.getInt32(12, true) : 0,
    };
  }

  function grayToCanvas(pixels, width, height) {
    var c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    var ctx = c.getContext("2d");
    var img = ctx.createImageData(width, height);
    var d = img.data;
    var expected = width * height;
    var len = Math.min(pixels.length, expected);
    var i;
    var p = 0;
    for (i = 0; i < len; i++, p += 4) {
      var g = pixels[i];
      d[p] = g;
      d[p + 1] = g;
      d[p + 2] = g;
      d[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function decodeFoldImagToCanvas(imagBody) {
    var pair = readImagPair(imagBody);
    if (!pair) return null;
    var meta = parseDataAttr(pair.attr);
    if (!meta || meta.width <= 0 || meta.height <= 0) return null;
    var IMG_FMT_TGA_0 = 0;
    var IMG_FMT_TGA_1 = 1;
    var IMG_FMT_TGA_2 = 2;
    var IMG_FMT_DXT1 = 8;
    var IMG_FMT_DXT3 = 10;
    var IMG_FMT_DXT5 = 11;
    var fmt = meta.format;
    if (fmt === IMG_FMT_DXT1 || fmt === IMG_FMT_DXT3 || fmt === IMG_FMT_DXT5) {
      if (typeof DDS === "undefined") return null;
      var DDS_MAGIC_LE = 0x20534444;
      var DOW_DXT_FLAGS_BASE = 0x00081007;
      var DOW_DXT_FLAG_MIPMAP = 0x20000;
      var DDPF_FOURCC = 4;
      var DOW_DDSCAPS_TEXTURE = 0x401008;
      function fourCcFromDxtFormat(f) {
        if (f === IMG_FMT_DXT1) return "DXT1";
        if (f === IMG_FMT_DXT3) return "DXT3";
        if (f === IMG_FMT_DXT5) return "DXT5";
        return null;
      }
      var cc = fourCcFromDxtFormat(fmt);
      if (!cc || typeof DDS === "undefined") return null;
      var flags = DOW_DXT_FLAGS_BASE | (meta.mips > 0 ? DOW_DXT_FLAG_MIPMAP : 0);
      var headerBuf = new ArrayBuffer(128);
      var dv = new DataView(headerBuf);
      dv.setUint32(0, DDS_MAGIC_LE, true);
      dv.setUint32(4, 124, true);
      dv.setUint32(8, flags, true);
      dv.setUint32(12, meta.height, true);
      dv.setUint32(16, meta.width, true);
      dv.setUint32(20, pair.data.byteLength, true);
      dv.setUint32(24, 0, true);
      dv.setUint32(28, meta.mips >>> 0, true);
      dv.setUint32(76, 32, true);
      dv.setUint32(80, DDPF_FOURCC, true);
      dv.setUint8(84, cc.charCodeAt(0));
      dv.setUint8(85, cc.charCodeAt(1));
      dv.setUint8(86, cc.charCodeAt(2));
      dv.setUint8(87, cc.charCodeAt(3));
      dv.setUint32(108, DOW_DDSCAPS_TEXTURE, true);
      dv.setUint32(112, 0, true);
      var hdrU8 = new Uint8Array(headerBuf);
      var ddsCombined = new Uint8Array(hdrU8.length + pair.data.length);
      ddsCombined.set(hdrU8, 0);
      ddsCombined.set(pair.data, hdrU8.length);
      var d = DDS.decodeToCanvas(ddsCombined);
      if (d.ok && d.canvas) return d.canvas;
      return null;
    }
    if (fmt === IMG_FMT_TGA_0 || fmt === IMG_FMT_TGA_1 || fmt === IMG_FMT_TGA_2) {
      var hdr = new ArrayBuffer(18);
      var hdv = new DataView(hdr);
      hdv.setUint8(0, 0);
      hdv.setUint8(1, 0);
      hdv.setUint8(2, 2);
      hdv.setUint16(3, 0, true);
      hdv.setUint16(5, 0, true);
      hdv.setUint8(7, 32);
      hdv.setUint16(8, 0, true);
      hdv.setUint16(10, 0, true);
      hdv.setUint16(12, meta.width, true);
      hdv.setUint16(14, meta.height, true);
      hdv.setUint8(16, 32);
      hdv.setUint8(17, 0);
      var head = new Uint8Array(hdr);
      var out = new Uint8Array(18 + pair.data.length);
      out.set(head, 0);
      out.set(pair.data, 18);
      if (typeof TGA !== "undefined") {
        var t = TGA.decodeToCanvas(out);
        if (t.ok && t.canvas) return t.canvas;
      }
    }
    return null;
  }

  /**
   * @param {Uint8Array} u8
   * @returns {{ ok: true, layers: { id: number, label: string, canvas: HTMLCanvasElement }[] } | { ok: false, error: string }}
   */
  function extractTeamLayers(u8) {
    if (!u8 || !u8.length || typeof Chunky === "undefined") {
      return { ok: false, error: "Chunky not available" };
    }
    if (!Chunky.startsWithRelicChunky(u8)) return { ok: false, error: "Not Relic Chunky" };
    var off = Chunky.getFirstChunkOffset(u8);
    if (off < 0) return { ok: false, error: "Invalid chunky offset" };
    var tpatBody = null;
    Chunky.forEachChunk(u8, off, u8.length, function (h, body) {
      var tid = typeidKey(h);
      if (tid.indexOf("FOLDTPAT") === 0 || tid === "FOLDTPAT") tpatBody = body;
    });
    if (!tpatBody) return { ok: false, error: "No FOLDTPAT" };
    var w = 0;
    var h = 0;
    var layers = [];
    Chunky.forEachChunk(tpatBody, 0, tpatBody.length, function (h2, body2) {
      var t = typeidKey(h2);
      if (t.indexOf("DATAINFO") === 0 && body2.length >= 8) {
        var dv = new DataView(body2.buffer, body2.byteOffset, body2.byteLength);
        w = dv.getUint32(0, true);
        h = dv.getUint32(4, true);
      } else if (t.indexOf("DATAPTLD") === 0 && body2.length >= 8) {
        var dv2 = new DataView(body2.buffer, body2.byteOffset, body2.byteLength);
        var layerIn = dv2.getInt32(0, true);
        var dataSize = dv2.getUint32(4, true);
        var pix = body2.subarray(8, Math.min(body2.length, 8 + dataSize));
        if (w > 0 && h > 0 && pix.length >= w * h) {
          var label = LAYER_LABELS[String(layerIn)] || "Layer " + layerIn;
          layers.push({ id: layerIn, label: label, canvas: grayToCanvas(pix, w, h) });
        }
      } else if (t.indexOf("FOLDIMAG") === 0) {
        var cv = decodeFoldImagToCanvas(body2);
        if (cv) {
          layers.push({ id: -1, label: LAYER_LABELS["-1"], canvas: cv });
        }
      }
    });
    if (!layers.length) return { ok: false, error: "No team colour layers found" };
    layers.sort(function (a, b) {
      var order = function (id) {
        return id === -1 ? -1 : id;
      };
      return order(a.id) - order(b.id);
    });
    return { ok: true, layers: layers };
  }

  /**
   * First usable team-colour layer as a canvas (prefers Default id -1).
   * @param {Uint8Array} u8
   * @returns {HTMLCanvasElement | null}
   */
  function renderGridThumbnail(u8) {
    var r = extractTeamLayers(u8);
    if (!r.ok || !r.layers.length) return null;
    var pick = r.layers[0];
    for (var i = 0; i < r.layers.length; i++) {
      if (r.layers[i].id === -1) {
        pick = r.layers[i];
        break;
      }
    }
    return pick.canvas || null;
  }

  global.WTP = {
    extractTeamLayers: extractTeamLayers,
    renderGridThumbnail: renderGridThumbnail,
  };
})(typeof window !== "undefined" ? window : globalThis);
