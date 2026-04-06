/**
 * Relic Chunky v1.1 (DoW1) — container reader.
 * Chunk headers match blender_dow/chunky.py: 8-byte ASCII typeid + int32 version + int32 size + int32 name_len + name bytes.
 */
(function (global) {
  "use strict";

  var RELIC = new TextEncoder().encode("Relic Chunky");
  var UTF8 = new TextDecoder("utf-8", { fatal: false });

  /**
   * 8-byte ASCII tag; strip null padding so comparisons match tools that pad with 0.
   * @param {Uint8Array} u8
   * @param {number} o
   * @returns {string}
   */
  function normalizeChunkTypeid(u8, o) {
    var raw = String.fromCharCode(
      u8[o],
      u8[o + 1],
      u8[o + 2],
      u8[o + 3],
      u8[o + 4],
      u8[o + 5],
      u8[o + 6],
      u8[o + 7]
    );
    return raw.replace(/\0/g, "").trim();
  }

  function startsWithRelicChunky(u8) {
    if (u8.length < 12) return false;
    for (var i = 0; i < 12; i++) {
      if (u8[i] !== RELIC[i]) return false;
    }
    return true;
  }

  /**
   * DoW1 Relic Chunky file preamble after the 12-byte tag:
   * uint32 version stamp, int32 platform, int32 major, int32 minor (v1.1 = 28 bytes total before first chunk).
   * @param {Uint8Array} u8
   * @returns {{ versionStamp: number, platform: number, majorVersion: number, minorVersion: number | null, preambleBytes: number } | null}
   */
  function readRelicChunkyFileHeader(u8) {
    if (!startsWithRelicChunky(u8) || u8.length < 24) return null;
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var preambleBytes = u8.length >= 28 ? 28 : 24;
    return {
      versionStamp: dv.getUint32(12, true),
      platform: dv.getInt32(16, true),
      majorVersion: dv.getInt32(20, true),
      minorVersion: u8.length >= 28 ? dv.getInt32(24, true) : null,
      preambleBytes: preambleBytes,
    };
  }

  /**
   * First chunk offset: prefer a successful chunk read at 28 (full v1.1 preamble), else 24.
   * @returns {number} byte offset of first chunk, or -1
   */
  function getFirstChunkOffset(u8) {
    if (!startsWithRelicChunky(u8) || u8.length < 24) return -1;
    if (u8.length >= 28) {
      var h28 = readChunkHeader(u8, 28);
      if (h28) return 28;
    }
    var h24 = readChunkHeader(u8, 24);
    if (h24) return 24;
    if (u8.length >= 28) return 28;
    return -1;
  }

  /**
   * @returns {number} first chunk offset on success, or -1
   */
  function skipRelicChunky(u8) {
    return getFirstChunkOffset(u8);
  }

  /**
   * @param {Uint8Array} u8
   * @param {number} o
   * @returns {{ typeid: string, version: number, size: number, name: string, bodyStart: number, bodyEnd: number, next: number } | null}
   */
  function readChunkHeader(u8, o) {
    if (!u8) return null;
    var len = typeof u8.byteLength === "number" ? u8.byteLength : u8.length;
    if (typeof len !== "number" || o < 0 || o + 20 > len) return null;
    var typeid = normalizeChunkTypeid(u8, o);
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var version = dv.getInt32(o + 8, true);
    var size = dv.getInt32(o + 12, true);
    if (size < 0) return null;
    var nameLen = dv.getInt32(o + 16, true);
    if (nameLen < 0 || nameLen > 1 << 20) return null;
    var headerEnd = o + 20 + nameLen;
    if (headerEnd > len) return null;
    var nameBytes = u8.subarray(o + 20, headerEnd);
    var name = UTF8.decode(nameBytes).replace(/\0+$/, "");
    var bodyStart = headerEnd;
    var bodyEnd = bodyStart + size;
    if (bodyEnd > len) return null;
    return {
      typeid: typeid,
      version: version,
      size: size,
      name: name,
      bodyStart: bodyStart,
      bodyEnd: bodyEnd,
      next: bodyEnd,
    };
  }

  /**
   * Iterate top-level chunks from offset `start` to `end` (exclusive).
   * @param {(h: ReturnType<typeof readChunkHeader>, body: Uint8Array) => void} fn
   */
  function forEachChunk(u8, start, end, fn) {
    var o = start;
    while (o < end) {
      var h = readChunkHeader(u8, o);
      if (!h) break;
      var body = u8.subarray(h.bodyStart, h.bodyEnd);
      fn(h, body);
      o = h.next;
    }
  }

  /**
   * @param {Uint8Array} u8
   * @param {number} start
   * @param {number} end
   * @param {string} expectedTypeid
   * @returns {{ header: NonNullable<ReturnType<typeof readChunkHeader>>, body: Uint8Array } | null}
   */
  function readChunk(u8, start, end, expectedTypeid) {
    var h = readChunkHeader(u8, start);
    if (!h || h.next > end) return null;
    if (h.typeid !== expectedTypeid) return null;
    return { header: h, body: u8.subarray(h.bodyStart, h.bodyEnd) };
  }

  global.Chunky = {
    readRelicChunkyFileHeader: readRelicChunkyFileHeader,
    getFirstChunkOffset: getFirstChunkOffset,
    skipRelicChunky: skipRelicChunky,
    readChunkHeader: readChunkHeader,
    forEachChunk: forEachChunk,
    readChunk: readChunk,
    startsWithRelicChunky: startsWithRelicChunky,
    normalizeChunkTypeid: normalizeChunkTypeid,
  };
})(typeof window !== "undefined" ? window : globalThis);
