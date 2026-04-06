/**
 * Dawn of War .ucs — UTF-16LE string table (numeric id + text per line).
 */
(function (global) {
  "use strict";

  /**
   * @param {Uint8Array} u8
   * @returns {{ ok: true, rows: { id: number, text: string }[] } | { ok: false, error: string }}
   */
  function parseUcs(u8) {
    if (!u8 || !u8.length) return { ok: false, error: "Empty file" };
    var td = new TextDecoder("utf-16le", { fatal: false });
    var text = td.decode(u8);
    var lines = text.split(/\r?\n/);
    var rows = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line || !String(line).trim()) continue;
      var tab = line.indexOf("\t");
      if (tab >= 0) {
        var idPart = line.slice(0, tab).trim();
        var rest = line.slice(tab + 1);
        var id = parseInt(idPart, 10);
        if (!isNaN(id)) rows.push({ id: id, text: rest });
        continue;
      }
      var m = /^(\d+)\s+(.*)$/.exec(line.trim());
      if (m) {
        rows.push({ id: parseInt(m[1], 10), text: m[2] });
        continue;
      }
      if (/^\d+$/.test(line.trim())) {
        rows.push({ id: parseInt(line.trim(), 10), text: "" });
      }
    }
    return { ok: true, rows: rows };
  }

  global.UCS = {
    parseUcs: parseUcs,
  };
})(typeof window !== "undefined" ? window : globalThis);
