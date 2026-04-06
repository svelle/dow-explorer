/**
 * Dawn of War I .rgd — DATA KEYS + DATA AEGD attribute tree.
 * Binary layout ported from RGDReader (MIT): https://github.com/RobinKa/RGDReader
 */
(function (global) {
  "use strict";

  function u32LE(u8, o) {
    return u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24);
  }

  function u64LE(u8, o) {
    var lo = u32LE(u8, o) >>> 0;
    var hi = u32LE(u8, o + 4) >>> 0;
    return (BigInt(hi) << 32n) | BigInt(lo);
  }

  function readCString(u8, start) {
    var i = start;
    while (i < u8.length && u8[i] !== 0) i++;
    return new TextDecoder("ascii", { fatal: false }).decode(u8.subarray(start, i));
  }

  function findRgdDataChunks(u8) {
    if (typeof Chunky === "undefined") return { keysBody: null, aegdBody: null };
    if (!Chunky.startsWithRelicChunky(u8)) return { keysBody: null, aegdBody: null };
    var off = Chunky.getFirstChunkOffset(u8);
    if (off < 0) return { keysBody: null, aegdBody: null };
    var keysBody = null;
    var aegdBody = null;
    Chunky.forEachChunk(u8, off, u8.length, function (h, body) {
      var tid = (h.typeid || "").replace(/\0/g, "").trim();
      var nm = (h.name || "").replace(/\0/g, "").trim();
      var tidU = tid.toUpperCase().replace(/\s+/g, "");
      if (tid === "DATA" && nm === "KEYS") keysBody = body;
      else if (tidU === "DATAKEYS" || (tidU.indexOf("DATA") === 0 && tidU.indexOf("KEYS") >= 0)) keysBody = body;
      if (tid === "DATA" && nm === "AEGD") aegdBody = body;
      else if (tidU === "DATAAEGD" || tidU.indexOf("AEGD") >= 0) aegdBody = body;
    });
    return { keysBody: keysBody, aegdBody: aegdBody };
  }

  function parseKeysDataChunk(u8) {
    if (!u8 || u8.length < 4) return null;
    var o = 0;
    var count = u32LE(u8, o);
    o += 4;
    var map = new Map();
    for (var i = 0; i < count; i++) {
      if (o + 8 > u8.length) return null;
      var key = u64LE(u8, o);
      o += 8;
      if (o + 4 > u8.length) return null;
      var slen = u32LE(u8, o);
      o += 4;
      if (slen < 0 || o + slen > u8.length) return null;
      var str = new TextDecoder("ascii", { fatal: false }).decode(u8.subarray(o, o + slen));
      o += slen;
      map.set(key, str);
    }
    return map;
  }

  function readValueAt(u8, absOff, type, keysForNested) {
    if (absOff < 0 || absOff >= u8.length) return { err: "offset out of range" };
    if (type === 0) {
      if (absOff + 4 > u8.length) return { err: "truncated float" };
      var dv = new DataView(u8.buffer, u8.byteOffset + absOff, 4);
      return { v: dv.getFloat32(0, true) };
    }
    if (type === 1) {
      if (absOff + 4 > u8.length) return { err: "truncated int" };
      var dv1 = new DataView(u8.buffer, u8.byteOffset + absOff, 4);
      return { v: dv1.getInt32(0, true) };
    }
    if (type === 2) {
      if (absOff >= u8.length) return { err: "truncated bool" };
      return { v: u8[absOff] !== 0 };
    }
    if (type === 3) {
      return { v: readCString(u8, absOff) };
    }
    if (type === 100 || type === 101) {
      var nested = readChunkyList(u8, absOff, keysForNested);
      if (nested.err) return nested;
      return { v: nested.entries };
    }
    return { err: "unknown type " + type };
  }

  function readChunkyList(u8, start, keysInv) {
    if (start < 0 || start + 4 > u8.length) return { err: "bad list start", entries: [] };
    var o = start;
    var length = u32LE(u8, o);
    o += 4;
    if (length < 0 || length > 1e7) return { err: "bad list length", entries: [] };
    var rows = [];
    var i;
    for (i = 0; i < length; i++) {
      if (o + 16 > u8.length) return { err: "truncated list row", entries: [] };
      var key = u64LE(u8, o);
      o += 8;
      var typ = u32LE(u8, o) | 0;
      o += 4;
      var relIndex = u32LE(u8, o) | 0;
      o += 4;
      rows.push({ key: key, type: typ, relIndex: relIndex });
    }
    var dataBase = o;
    var entries = [];
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      var abs = dataBase + r.relIndex;
      var got = readValueAt(u8, abs, r.type, keysInv);
      if (got.err) return { err: got.err, entries: [] };
      entries.push({ key: r.key, type: r.type, value: got.v });
    }
    return { entries: entries };
  }

  function entryToNode(entry, keysInv) {
    var keyStr = keysInv.get(entry.key);
    if (keyStr === undefined) keyStr = "0x" + entry.key.toString(16);
    var v = entry.value;
    if (Array.isArray(v)) {
      return {
        key: keyStr,
        children: v.map(function (e) {
          return entryToNode(e, keysInv);
        }),
      };
    }
    return { key: keyStr, value: v };
  }

  function parseKeyValueDataChunk(u8, keysInv) {
    if (!u8 || u8.length < 4) return { err: "empty AEGD" };
    var o = 4;
    var list = readChunkyList(u8, o, keysInv);
    if (list.err) return { err: list.err };
    return { entries: list.entries };
  }

  /**
   * @param {Uint8Array} u8
   * @returns {{ ok: true, tree: object[] } | { ok: false, error: string }}
   */
  function parseToTree(u8) {
    if (!u8 || !u8.length) return { ok: false, error: "Empty file" };
    if (typeof Chunky === "undefined") return { ok: false, error: "Chunky parser not loaded" };
    var ch = findRgdDataChunks(u8);
    if (!ch.keysBody) return { ok: false, error: "No DATA KEYS chunk" };
    if (!ch.aegdBody) return { ok: false, error: "No DATA AEGD chunk" };
    var keyMap = parseKeysDataChunk(ch.keysBody);
    if (!keyMap) return { ok: false, error: "Invalid KEYS chunk" };
    var kvs = parseKeyValueDataChunk(ch.aegdBody, keyMap);
    if (kvs.err) return { ok: false, error: kvs.err };
    var tree = kvs.entries.map(function (e) {
      return entryToNode(e, keyMap);
    });
    return { ok: true, tree: tree };
  }

  /**
   * Flatten tree for search: [{ path: string, line: string }]
   */
  function flattenForSearch(nodes, prefix) {
    prefix = prefix || "";
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var path = prefix ? prefix + "." + n.key : n.key;
      if (n.children) {
        out.push({ path: path, line: path + " ▼" });
        out = out.concat(flattenForSearch(n.children, path));
      } else {
        var val = n.value;
        var vs =
          typeof val === "string"
            ? JSON.stringify(val)
            : val === true || val === false
            ? String(val)
            : String(val);
        out.push({ path: path, line: path + ": " + vs });
      }
    }
    return out;
  }

  var THUMB_SIZE = 256;
  var THUMB_PAD = 6;

  /**
   * Raster summary for grid thumbnails (parsed tree lines, monospace on dark field).
   * @param {Uint8Array} u8
   * @returns {HTMLCanvasElement | null}
   */
  function renderThumbCanvas(u8) {
    var r = parseToTree(u8);
    if (!r.ok || !r.tree || !r.tree.length) return null;
    var lines = flattenForSearch(r.tree, "").slice(0, 20);
    var c = document.createElement("canvas");
    c.width = THUMB_SIZE;
    c.height = THUMB_SIZE;
    var ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, THUMB_SIZE, THUMB_SIZE);
    ctx.fillStyle = "#a8b8d0";
    ctx.font = "11px ui-monospace, monospace";
    var y = 14;
    for (var i = 0; i < lines.length && y < THUMB_SIZE - THUMB_PAD; i++) {
      var t = lines[i].line;
      if (t.length > 36) t = t.slice(0, 34) + "…";
      ctx.fillText(t, THUMB_PAD, y);
      y += 14;
    }
    return c;
  }

  global.RGD = {
    parseToTree: parseToTree,
    flattenForSearch: flattenForSearch,
    renderThumbCanvas: renderThumbCanvas,
  };
})(typeof window !== "undefined" ? window : globalThis);
