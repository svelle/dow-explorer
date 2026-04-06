/**
 * DDS (DirectDraw Surface) decoder for browser previews — BC1/DXT1, BC2/DXT3, BC3/DXT5,
 * DX10 header + DXGI BC / 32bpp RGBA, first mip level only.
 */
(function (global) {
  "use strict";

  var MAX_DIM = 8192;

  var DXGI_BC1_UNORM = 71;
  var DXGI_BC2_UNORM = 74;
  var DXGI_BC3_UNORM = 75;
  var DXGI_BC4_UNORM = 80;
  var DXGI_BC5_UNORM = 83;
  var DXGI_R8G8B8A8_UNORM = 28;
  var DXGI_B8G8R8A8_UNORM = 87;
  var DXGI_R8G8B8A8_UNORM_SRGB = 29;
  var DXGI_B8G8R8A8_UNORM_SRGB = 91;

  function u16LE(u8, o) {
    return u8[o] | (u8[o + 1] << 8);
  }

  function u32LE(u8, o) {
    return u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24);
  }

  function fourCCStr(u8, o) {
    return String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  }

  function expand565(c) {
    var r = ((c >> 11) & 0x1f) << 3;
    var g = ((c >> 5) & 0x3f) << 2;
    var b = (c & 0x1f) << 3;
    r |= r >> 5;
    g |= g >> 6;
    b |= b >> 5;
    return [r, g, b];
  }

  function readBits3(u8, base, bitStart) {
    var v = 0;
    for (var b = 0; b < 3; b++) {
      var byteIdx = base + ((bitStart + b) >> 3);
      var bitIdx = (bitStart + b) & 7;
      if ((u8[byteIdx] >> bitIdx) & 1) v |= 1 << b;
    }
    return v;
  }

  function readBits4(u8, base, bitStart) {
    var v = 0;
    for (var b = 0; b < 4; b++) {
      var byteIdx = base + ((bitStart + b) >> 3);
      var bitIdx = (bitStart + b) & 7;
      if ((u8[byteIdx] >> bitIdx) & 1) v |= 1 << b;
    }
    return v;
  }

  function decodeBC3Alphas(a0, a1) {
    var a = new Array(8);
    a[0] = a0;
    a[1] = a1;
    if (a0 > a1) {
      a[2] = ((6 * a0 + 1 * a1) / 7) | 0;
      a[3] = ((5 * a0 + 2 * a1) / 7) | 0;
      a[4] = ((4 * a0 + 3 * a1) / 7) | 0;
      a[5] = ((3 * a0 + 4 * a1) / 7) | 0;
      a[6] = ((2 * a0 + 5 * a1) / 7) | 0;
      a[7] = ((1 * a0 + 6 * a1) / 7) | 0;
    } else {
      a[2] = ((4 * a0 + 1 * a1) / 5) | 0;
      a[3] = ((3 * a0 + 2 * a1) / 5) | 0;
      a[4] = ((2 * a0 + 3 * a1) / 5) | 0;
      a[5] = ((1 * a0 + 4 * a1) / 5) | 0;
      a[6] = 0;
      a[7] = 255;
    }
    return a;
  }

  /** Write 4×4 BC1 color block into rgba at (ox, oy), clipped to w×h. */
  function writeBC1ColorBlock(u8, blockOff, rgba, w, h, ox, oy) {
    var c0 = u16LE(u8, blockOff);
    var c1 = u16LE(u8, blockOff + 2);
    var idx = u32LE(u8, blockOff + 4);
    var rgb0 = expand565(c0);
    var rgb1 = expand565(c1);
    var r0 = rgb0[0];
    var g0 = rgb0[1];
    var b0 = rgb0[2];
    var r1 = rgb1[0];
    var g1 = rgb1[1];
    var b1 = rgb1[2];
    var cr = new Array(4);
    var cg = new Array(4);
    var cb = new Array(4);
    var ca = new Array(4);
    cr[0] = r0;
    cg[0] = g0;
    cb[0] = b0;
    ca[0] = 255;
    cr[1] = r1;
    cg[1] = g1;
    cb[1] = b1;
    ca[1] = 255;
    if (c0 > c1) {
      cr[2] = ((2 * r0 + r1) / 3) | 0;
      cg[2] = ((2 * g0 + g1) / 3) | 0;
      cb[2] = ((2 * b0 + b1) / 3) | 0;
      ca[2] = 255;
      cr[3] = ((r0 + 2 * r1) / 3) | 0;
      cg[3] = ((g0 + 2 * g1) / 3) | 0;
      cb[3] = ((b0 + 2 * b1) / 3) | 0;
      ca[3] = 255;
    } else {
      cr[2] = ((r0 + r1) / 2) | 0;
      cg[2] = ((g0 + g1) / 2) | 0;
      cb[2] = ((b0 + b1) / 2) | 0;
      ca[2] = 255;
      cr[3] = 0;
      cg[3] = 0;
      cb[3] = 0;
      ca[3] = 0;
    }
    for (var py = 0; py < 4; py++) {
      for (var px = 0; px < 4; px++) {
        var pi = py * 4 + px;
        var sel = (idx >> (pi * 2)) & 3;
        var x = ox + px;
        var y = oy + py;
        if (x >= w || y >= h) continue;
        var d = (y * w + x) * 4;
        rgba[d] = cr[sel];
        rgba[d + 1] = cg[sel];
        rgba[d + 2] = cb[sel];
        rgba[d + 3] = ca[sel];
      }
    }
  }

  /** BC3: alpha block at blockOff, color block at blockOff+8 */
  function writeBC3Block(u8, blockOff, rgba, w, h, ox, oy) {
    var a0 = u8[blockOff];
    var a1 = u8[blockOff + 1];
    var alphas = decodeBC3Alphas(a0, a1);
    var alpha = new Array(16);
    for (var i = 0; i < 16; i++) {
      var code = readBits3(u8, blockOff + 2, i * 3);
      alpha[i] = alphas[code];
    }
    writeBC1ColorBlock(u8, blockOff + 8, rgba, w, h, ox, oy);
    for (var py = 0; py < 4; py++) {
      for (var px = 0; px < 4; px++) {
        var pi = py * 4 + px;
        var x = ox + px;
        var y = oy + py;
        if (x >= w || y >= h) continue;
        var d = (y * w + x) * 4;
        rgba[d + 3] = alpha[pi];
      }
    }
  }

  /** BC2/DXT3: 8 bytes explicit 4-bit alpha, then BC1 color (color first, then alpha overwrite). */
  function writeBC2Block(u8, blockOff, rgba, w, h, ox, oy) {
    writeBC1ColorBlock(u8, blockOff + 8, rgba, w, h, ox, oy);
    for (var i = 0; i < 16; i++) {
      var a = readBits4(u8, blockOff, i * 4);
      var px = i & 3;
      var py = (i / 4) | 0;
      var x = ox + px;
      var y = oy + py;
      if (x >= w || y >= h) continue;
      var d = (y * w + x) * 4;
      rgba[d + 3] = (a << 4) | a;
    }
  }

  function decodeBC1Surface(u8, dataOff, w, h) {
    var rgba = new Uint8ClampedArray(w * h * 4);
    rgba.fill(0);
    var bx = Math.ceil(w / 4);
    var by = Math.ceil(h / 4);
    var off = dataOff;
    for (var yb = 0; yb < by; yb++) {
      for (var xb = 0; xb < bx; xb++) {
        writeBC1ColorBlock(u8, off, rgba, w, h, xb * 4, yb * 4);
        off += 8;
      }
    }
    return rgba;
  }

  function decodeBC3Surface(u8, dataOff, w, h) {
    var rgba = new Uint8ClampedArray(w * h * 4);
    rgba.fill(0);
    var bx = Math.ceil(w / 4);
    var by = Math.ceil(h / 4);
    var off = dataOff;
    for (var yb = 0; yb < by; yb++) {
      for (var xb = 0; xb < bx; xb++) {
        writeBC3Block(u8, off, rgba, w, h, xb * 4, yb * 4);
        off += 16;
      }
    }
    return rgba;
  }

  function decodeBC2Surface(u8, dataOff, w, h) {
    var rgba = new Uint8ClampedArray(w * h * 4);
    rgba.fill(0);
    var bx = Math.ceil(w / 4);
    var by = Math.ceil(h / 4);
    var off = dataOff;
    for (var yb = 0; yb < by; yb++) {
      for (var xb = 0; xb < bx; xb++) {
        writeBC2Block(u8, off, rgba, w, h, xb * 4, yb * 4);
        off += 16;
      }
    }
    return rgba;
  }

  function decodeBGRA32(u8, dataOff, w, h, pitch) {
    var rgba = new Uint8ClampedArray(w * h * 4);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var o = dataOff + y * pitch + x * 4;
        var b = u8[o];
        var g = u8[o + 1];
        var r = u8[o + 2];
        var a = u8[o + 3];
        var d = (y * w + x) * 4;
        rgba[d] = r;
        rgba[d + 1] = g;
        rgba[d + 2] = b;
        rgba[d + 3] = a;
      }
    }
    return rgba;
  }

  function decodeRGBA32(u8, dataOff, w, h, pitch) {
    var rgba = new Uint8ClampedArray(w * h * 4);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var o = dataOff + y * pitch + x * 4;
        rgba[(y * w + x) * 4] = u8[o];
        rgba[(y * w + x) * 4 + 1] = u8[o + 1];
        rgba[(y * w + x) * 4 + 2] = u8[o + 2];
        rgba[(y * w + x) * 4 + 3] = u8[o + 3];
      }
    }
    return rgba;
  }

  /** BC4: one channel in R, used for single-channel (e.g. height) — expand to grayscale RGBA */
  function decodeBC4Surface(u8, dataOff, w, h) {
    var rgba = new Uint8ClampedArray(w * h * 4);
    rgba.fill(0);
    var bx = Math.ceil(w / 4);
    var by = Math.ceil(h / 4);
    var off = dataOff;
    for (var yb = 0; yb < by; yb++) {
      for (var xb = 0; xb < bx; xb++) {
        var a0 = u8[off];
        var a1 = u8[off + 1];
        var vals = decodeBC3Alphas(a0, a1);
        var v = new Array(16);
        for (var i = 0; i < 16; i++) {
          v[i] = vals[readBits3(u8, off + 2, i * 3)];
        }
        for (var py = 0; py < 4; py++) {
          for (var px = 0; px < 4; px++) {
            var pi = py * 4 + px;
            var x = xb * 4 + px;
            var y = yb * 4 + py;
            if (x >= w || y >= h) continue;
            var g = v[pi];
            var d = (y * w + x) * 4;
            rgba[d] = g;
            rgba[d + 1] = g;
            rgba[d + 2] = g;
            rgba[d + 3] = 255;
          }
        }
        off += 8;
      }
    }
    return rgba;
  }

  /** BC5: RG two BC4 blocks — often normal maps (XY), show as R in red, G in green */
  function decodeBC5Surface(u8, dataOff, w, h) {
    var rgba = new Uint8ClampedArray(w * h * 4);
    rgba.fill(0);
    var bx = Math.ceil(w / 4);
    var by = Math.ceil(h / 4);
    var off = dataOff;
    for (var yb = 0; yb < by; yb++) {
      for (var xb = 0; xb < bx; xb++) {
        var r0 = u8[off];
        var r1 = u8[off + 1];
        var reds = decodeBC3Alphas(r0, r1);
        var rch = new Array(16);
        for (var i = 0; i < 16; i++) rch[i] = reds[readBits3(u8, off + 2, i * 3)];
        off += 8;
        var g0 = u8[off];
        var g1 = u8[off + 1];
        var greens = decodeBC3Alphas(g0, g1);
        var gch = new Array(16);
        for (var j = 0; j < 16; j++) gch[j] = greens[readBits3(u8, off + 2, j * 3)];
        off += 8;
        for (var py = 0; py < 4; py++) {
          for (var px = 0; px < 4; px++) {
            var pi = py * 4 + px;
            var x = xb * 4 + px;
            var y = yb * 4 + py;
            if (x >= w || y >= h) continue;
            var rr = rch[pi];
            var gg = gch[pi];
            var nx = rr / 255 * 2 - 1;
            var ny = gg / 255 * 2 - 1;
            var zz = 1 - nx * nx - ny * ny;
            var nz = zz > 0 ? Math.sqrt(zz) : 0;
            var zb = Math.min(255, Math.max(0, (nz * 0.5 + 0.5) * 255 | 0));
            var d = (y * w + x) * 4;
            rgba[d] = rr;
            rgba[d + 1] = gg;
            rgba[d + 2] = zb;
            rgba[d + 3] = 255;
          }
        }
      }
    }
    return rgba;
  }

  function decodeFromFormat(u8, dataOff, w, h, format, rowPitch) {
    if (format === "dxt1") {
      return new ImageData(decodeBC1Surface(u8, dataOff, w, h), w, h);
    }
    if (format === "dxt2" || format === "dxt3") {
      return new ImageData(decodeBC2Surface(u8, dataOff, w, h), w, h);
    }
    if (format === "dxt4" || format === "dxt5") {
      return new ImageData(decodeBC3Surface(u8, dataOff, w, h), w, h);
    }
    if (format === "bc4") {
      return new ImageData(decodeBC4Surface(u8, dataOff, w, h), w, h);
    }
    if (format === "bc5") {
      return new ImageData(decodeBC5Surface(u8, dataOff, w, h), w, h);
    }
    if (format === "bgra32") {
      var pitch = w * 4;
      if (typeof rowPitch === "number" && rowPitch >= w * 4) pitch = rowPitch;
      return new ImageData(decodeBGRA32(u8, dataOff, w, h, pitch), w, h);
    }
    if (format === "rgba32") {
      var pitch2 = w * 4;
      if (typeof rowPitch === "number" && rowPitch >= w * 4) pitch2 = rowPitch;
      return new ImageData(decodeRGBA32(u8, dataOff, w, h, pitch2), w, h);
    }
    return null;
  }

  function dxgiToFormat(dxgi) {
    if (dxgi === DXGI_BC1_UNORM) return "dxt1";
    if (dxgi === DXGI_BC2_UNORM) return "dxt2";
    if (dxgi === DXGI_BC3_UNORM) return "dxt5";
    if (dxgi === DXGI_BC4_UNORM) return "bc4";
    if (dxgi === DXGI_BC5_UNORM) return "bc5";
    if (
      dxgi === DXGI_R8G8B8A8_UNORM ||
      dxgi === DXGI_R8G8B8A8_UNORM_SRGB ||
      dxgi === DXGI_B8G8R8A8_UNORM ||
      dxgi === DXGI_B8G8R8A8_UNORM_SRGB
    ) {
      return dxgi === DXGI_R8G8B8A8_UNORM || dxgi === DXGI_R8G8B8A8_UNORM_SRGB ? "rgba32" : "bgra32";
    }
    return null;
  }

  function fourCCtoFormat(cc) {
    if (cc === "DXT1") return "dxt1";
    if (cc === "DXT2") return "dxt2";
    if (cc === "DXT3") return "dxt3";
    if (cc === "DXT4") return "dxt4";
    if (cc === "DXT5") return "dxt5";
    if (cc === "ATI1" || cc === "BC4U") return "bc4";
    if (cc === "ATI2" || cc === "BC5U") return "bc5";
    return null;
  }

  function decodeToImageData(u8) {
    if (!u8 || u8.length < 128) {
      return { ok: false, error: "File too small for DDS" };
    }
    if (u8[0] !== 0x44 || u8[1] !== 0x44 || u8[2] !== 0x53 || u8[3] !== 0x20) {
      return { ok: false, error: "Not a DDS file (missing magic)" };
    }
    var headerSize = u32LE(u8, 4);
    if (headerSize !== 124) {
      return { ok: false, error: "Unsupported DDS header size" };
    }
    var height = u32LE(u8, 12);
    var width = u32LE(u8, 16);
    var fourCC = fourCCStr(u8, 84);

    if (width <= 0 || height <= 0 || width > MAX_DIM || height > MAX_DIM) {
      return { ok: false, error: "Bad or oversized dimensions" };
    }

    var dataOff = 128;
    var format = null;

    if (fourCC === "DX10") {
      if (u8.length < 148) {
        return { ok: false, error: "Truncated DX10 DDS" };
      }
      var dxgi = u32LE(u8, 128);
      format = dxgiToFormat(dxgi);
      dataOff = 128 + 20;
    } else {
      format = fourCCtoFormat(fourCC);
      if (!format) {
        var bpp = u32LE(u8, 88);
        var rmask = u32LE(u8, 92);
        var gmask = u32LE(u8, 96);
        var bmask = u32LE(u8, 100);
        var amask = u32LE(u8, 104);
        if (bpp === 32 && rmask === 0xff0000 && gmask === 0xff00 && bmask === 0xff && amask === 0xff000000) {
          format = "bgra32";
        } else if (bpp === 32 && rmask === 0xff && gmask === 0xff00 && bmask === 0xff0000 && amask === 0xff000000) {
          format = "rgba32";
        }
      }
    }

    if (!format) {
      return {
        ok: false,
        error: "Unsupported DDS pixel format (" + fourCC + ")",
      };
    }

    if (dataOff >= u8.length) {
      return { ok: false, error: "Truncated DDS payload" };
    }

    var rowPitch = null;
    if (format === "bgra32" || format === "rgba32") {
      var pol = u32LE(u8, 20);
      if (pol >= width * 4) rowPitch = pol;
    }

    var img = decodeFromFormat(u8, dataOff, width, height, format, rowPitch);
    if (!img) {
      return { ok: false, error: "Decode failed for format " + format };
    }
    return { ok: true, imageData: img };
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

  global.DDS = {
    decodeToCanvas: decodeToCanvas,
    decodeToImageData: decodeToImageData,
  };
})(typeof window !== "undefined" ? window : globalThis);
