/**
 * Minimal TGA (TARGA) decoder for browser previews — types 2 (uncompressed RGB) and
 * 10 (RLE RGB), 24/32 bpp, no palette / indexed modes.
 */
(function (global) {
  "use strict";

  var MAX_DIM = 8192;

  function u16LE(u8, o) {
    return u8[o] | (u8[o + 1] << 8);
  }

  function bgrToRgba(u8, src, bpp) {
    var b = u8[src];
    var g = u8[src + 1];
    var r = u8[src + 2];
    var a = bpp === 32 ? u8[src + 3] : 255;
    return [r, g, b, a];
  }

  function decodeUncompressed(u8, off, w, h, bpp, topOrigin) {
    var bytesPerPixel = bpp / 8;
    var pixelCount = w * h;
    var need = off + pixelCount * bytesPerPixel;
    if (u8.length < need) {
      return { ok: false, error: "Truncated TGA image data" };
    }
    var rgba = new Uint8ClampedArray(w * h * 4);
    for (var i = 0; i < pixelCount; i++) {
      var yFile = (i / w) | 0;
      var x = i % w;
      var yOut = topOrigin ? yFile : h - 1 - yFile;
      var dst = (yOut * w + x) * 4;
      var src = off + i * bytesPerPixel;
      var px = bgrToRgba(u8, src, bpp);
      rgba[dst] = px[0];
      rgba[dst + 1] = px[1];
      rgba[dst + 2] = px[2];
      rgba[dst + 3] = px[3];
    }
    return { ok: true, imageData: new ImageData(rgba, w, h) };
  }

  function decodeRle(u8, off, w, h, bpp, topOrigin) {
    var bytesPerPixel = bpp / 8;
    var pixelCount = w * h;
    var rgba = new Uint8ClampedArray(w * h * 4);
    var src = off;
    var pixelsWritten = 0;

    while (pixelsWritten < pixelCount && src < u8.length) {
      var packet = u8[src++];
      var isRle = (packet & 0x80) !== 0;
      var count = (packet & 0x7f) + 1;
      if (isRle) {
        if (src + bytesPerPixel > u8.length) {
          return { ok: false, error: "Truncated TGA RLE packet" };
        }
        var px = bgrToRgba(u8, src, bpp);
        src += bytesPerPixel;
        for (var k = 0; k < count && pixelsWritten < pixelCount; k++) {
          var yFile = (pixelsWritten / w) | 0;
          var x = pixelsWritten % w;
          var yOut = topOrigin ? yFile : h - 1 - yFile;
          var dst = (yOut * w + x) * 4;
          rgba[dst] = px[0];
          rgba[dst + 1] = px[1];
          rgba[dst + 2] = px[2];
          rgba[dst + 3] = px[3];
          pixelsWritten++;
        }
      } else {
        for (var k = 0; k < count && pixelsWritten < pixelCount; k++) {
          if (src + bytesPerPixel > u8.length) {
            return { ok: false, error: "Truncated TGA RLE raw packet" };
          }
          var px = bgrToRgba(u8, src, bpp);
          src += bytesPerPixel;
          var yFile = (pixelsWritten / w) | 0;
          var x = pixelsWritten % w;
          var yOut = topOrigin ? yFile : h - 1 - yFile;
          var dst = (yOut * w + x) * 4;
          rgba[dst] = px[0];
          rgba[dst + 1] = px[1];
          rgba[dst + 2] = px[2];
          rgba[dst + 3] = px[3];
          pixelsWritten++;
        }
      }
    }

    if (pixelsWritten < pixelCount) {
      return { ok: false, error: "RLE decode incomplete" };
    }
    return { ok: true, imageData: new ImageData(rgba, w, h) };
  }

  function decodeToImageData(u8) {
    if (!u8 || u8.length < 18) {
      return { ok: false, error: "File too small" };
    }
    var idLen = u8[0];
    var cmapType = u8[1];
    var imgType = u8[2];
    var cmapLen = u16LE(u8, 5);
    var cmapEntryBits = u8[7];
    var w = u16LE(u8, 12);
    var h = u16LE(u8, 14);
    var bpp = u8[16];
    var desc = u8[17];
    var off = 18 + idLen;

    if (cmapType === 1) {
      var bytesPerEntry = Math.ceil(cmapEntryBits / 8);
      off += cmapLen * bytesPerEntry;
    } else if (cmapType !== 0) {
      return { ok: false, error: "Unsupported color map type" };
    }

    if (w <= 0 || h <= 0 || w > MAX_DIM || h > MAX_DIM) {
      return { ok: false, error: "Bad or oversized dimensions" };
    }
    if (bpp !== 24 && bpp !== 32) {
      return { ok: false, error: "Unsupported bit depth (" + bpp + " bpp)" };
    }

    var topOrigin = (desc & 0x20) !== 0;

    if (imgType === 2) {
      return decodeUncompressed(u8, off, w, h, bpp, topOrigin);
    }
    if (imgType === 10) {
      return decodeRle(u8, off, w, h, bpp, topOrigin);
    }

    return { ok: false, error: "Unsupported TGA type " + imgType };
  }

  function decodeToCanvas(u8) {
    var r = decodeToImageData(u8);
    if (!r.ok) return r;
    var canvas = document.createElement("canvas");
    canvas.width = r.imageData.width;
    canvas.height = r.imageData.height;
    var ctx = canvas.getContext("2d");
    if (!ctx) {
      return { ok: false, error: "Canvas unsupported" };
    }
    ctx.putImageData(r.imageData, 0, 0);
    return { ok: true, canvas: canvas };
  }

  global.TGA = {
    decodeToCanvas: decodeToCanvas,
    decodeToImageData: decodeToImageData,
  };
})(typeof window !== "undefined" ? window : globalThis);
