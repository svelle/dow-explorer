/**
 * Walk a Relic Chunky file for structured preview (.whe, maps, etc.).
 */
(function (global) {
  "use strict";

  var MAX_DEPTH = 16;

  function typeidClean(t) {
    return String(t || "")
      .replace(/\0/g, "")
      .trim();
  }

  /**
   * Pull readable ASCII runs from a chunk body (paths, marker names, keys).
   */
  function extractAsciiRuns(u8, maxChars) {
    if (!u8 || !u8.length) return "";
    maxChars = maxChars || 400;
    var out = [];
    var run = [];
    var total = 0;
    for (var i = 0; i < u8.length && total < maxChars; i++) {
      var c = u8[i];
      if (c >= 32 && c < 127) {
        run.push(String.fromCharCode(c));
      } else {
        if (run.length >= 3) {
          var s = run.join("");
          out.push(s);
          total += s.length + 2;
          if (total >= maxChars) break;
        }
        run = [];
      }
    }
    if (run.length >= 3 && total < maxChars) out.push(run.join(""));
    var joined = out.join(" · ");
    if (joined.length > 320) joined = joined.slice(0, 317) + "…";
    return joined;
  }

  function walk(u8, start, end, depth) {
    if (depth > MAX_DEPTH) {
      return [
        {
          typeid: "…",
          name: "",
          version: 0,
          size: 0,
          asciiPreview: "(nesting cap — expand in hex if needed)",
        },
      ];
    }
    var list = [];
    Chunky.forEachChunk(u8, start, end, function (h, body) {
      var tid = typeidClean(h.typeid);
      var nm = String(h.name || "")
        .replace(/\0/g, "")
        .trim();
      var node = {
        typeid: tid,
        name: nm,
        version: h.version,
        size: body.length,
      };
      var tidU = tid.toUpperCase();
      if (tidU.indexOf("FOLD") === 0 && body.length > 0) {
        node.children = walk(body, 0, body.length, depth + 1);
      } else {
        var ascii = extractAsciiRuns(body, 450);
        if (ascii) node.asciiPreview = ascii;
      }
      list.push(node);
    });
    return list;
  }

  /**
   * @param {Uint8Array} u8
   * @returns {{ ok: true, nodes: object[], preamble: object | null } | { ok: false, error: string, nodes: [] }}
   */
  function parseToNodes(u8) {
    if (!u8 || !u8.length) return { ok: false, error: "Empty file", nodes: [] };
    if (typeof Chunky === "undefined") return { ok: false, error: "Chunky parser not loaded", nodes: [] };
    if (!Chunky.startsWithRelicChunky(u8))
      return { ok: false, error: 'Not Relic Chunky (expected "Relic Chunky" header)', nodes: [] };
    var off = Chunky.getFirstChunkOffset(u8);
    if (off < 0) return { ok: false, error: "Invalid Chunky layout", nodes: [] };
    var preamble =
      typeof Chunky.readRelicChunkyFileHeader === "function" ? Chunky.readRelicChunkyFileHeader(u8) : null;
    var nodes = walk(u8, off, u8.length, 0);
    return { ok: true, nodes: nodes, preamble: preamble };
  }

  global.RelicChunkyTree = {
    parseToNodes: parseToNodes,
  };
})(typeof window !== "undefined" ? window : globalThis);
