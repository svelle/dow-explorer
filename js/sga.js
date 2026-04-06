/**
 * SGA v2 reader — Dawn of War archive format.
 * All multi-byte integers are little-endian.
 */
(function (global) {
  "use strict";

  var MAGIC = new TextEncoder().encode("_ARCHIVE");
  var VERSION = 2;
  /** TOC starts at byte 180 (0xB4). */
  var TOC_BASE = 0xb4;
  /** Retail DoW SGA: toc/data area sizes at 0xAC / 0xB0 (see MAK offsets if name field shorter). */
  var HEADER_TOC_DATA_SIZE = 0xac;
  var HEADER_DATA_OFFSET = 0xb0;
  /** SgaTocDriveV2: 64+64+5*uint16 + uint16 root = 138 bytes */
  var SECTION_STRIDE = 138;
  /** SgaTocFileV2Dow: name + flags + data + comp + decomp = 20 bytes */
  var FILE_STRIDE = 20;

  function u8(view, o) {
    return view.getUint8(o);
  }

  function u16(view, o) {
    return view.getUint16(o, true);
  }

  function u32(view, o) {
    return view.getUint32(o, true);
  }

  function readCString(bytes, absOffset) {
    if (absOffset < 0 || absOffset >= bytes.length) return "";
    var end = absOffset;
    while (end < bytes.length && bytes[end] !== 0) end++;
    return new TextDecoder("windows-1252", { fatal: false }).decode(
      bytes.subarray(absOffset, end)
    );
  }

  function crc32Table() {
    var t = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) {
        c = (c & 1 ? 0xedb88320 : 0) ^ (c >>> 1);
      }
      t[i] = c >>> 0;
    }
    return t;
  }

  var CRC_TABLE = crc32Table();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(2) + " MB";
  }

  function compressionRatio(comp, raw) {
    if (!comp) return "—";
    var r = raw / comp;
    return (Math.round(r * 10) / 10) + "x";
  }

  function validateMagic(view) {
    for (var i = 0; i < 8; i++) {
      if (view.getUint8(i) !== MAGIC[i]) return false;
    }
    return true;
  }

  /**
   * @param {ArrayBuffer} buffer
   * @returns {{ ok: true, archive: object } | { ok: false, error: string }}
   */
  function parseSga(buffer) {
    if (buffer.byteLength < 0xcc) {
      return { ok: false, error: "File too small" };
    }
    var view = new DataView(buffer);
    if (!validateMagic(view)) {
      return { ok: false, error: 'Not an SGA (expected magic "_ARCHIVE")' };
    }
    if (u32(view, 0x08) !== VERSION) {
      return { ok: false, error: "Only SGA version 2 is supported" };
    }

    var dataHeaderSize = u32(view, HEADER_TOC_DATA_SIZE);
    var dataOffset = u32(view, HEADER_DATA_OFFSET);

    if (dataOffset > buffer.byteLength) {
      return { ok: false, error: "Invalid data_offset" };
    }

    var sectionRel = u32(view, TOC_BASE + 0);
    var sectionCount = u16(view, TOC_BASE + 4);
    var folderRel = u32(view, TOC_BASE + 6);
    var folderCount = u16(view, TOC_BASE + 10);
    var fileRel = u32(view, TOC_BASE + 12);
    var fileCount = u16(view, TOC_BASE + 16);
    var stringRel = u32(view, TOC_BASE + 18);
    var stringCount = u16(view, TOC_BASE + 22);

    var stringBaseAbs = TOC_BASE + stringRel;
    var bytes = new Uint8Array(buffer);

    var sections = [];
    var secPos = TOC_BASE + sectionRel;
    for (var si = 0; si < sectionCount; si++) {
      var off = secPos + si * SECTION_STRIDE;
      if (off + SECTION_STRIDE > buffer.byteLength) {
        return { ok: false, error: "Section table overrun" };
      }
      var alias = readCString(bytes, off).replace(/\0.*$/, "");
      var name = readCString(bytes, off + 0x40).replace(/\0.*$/, "");
      sections.push({
        index: si,
        alias: alias,
        name: name,
        firstFolder: u16(view, off + 0x80),
        lastFolder: u16(view, off + 0x82),
        firstFile: u16(view, off + 0x84),
        lastFile: u16(view, off + 0x86),
        rootFolder: u16(view, off + 0x88),
      });
    }

    var folders = [];
    var fldPos = TOC_BASE + folderRel;
    for (var fi = 0; fi < folderCount; fi++) {
      var fo = fldPos + fi * 12;
      if (fo + 12 > buffer.byteLength) {
        return { ok: false, error: "Folder table overrun" };
      }
      folders.push({
        index: fi,
        nameOffset: u32(view, fo),
        firstSubfolder: u16(view, fo + 4),
        lastSubfolder: u16(view, fo + 6),
        firstFile: u16(view, fo + 8),
        lastFile: u16(view, fo + 10),
      });
    }

    var files = [];
    var fPos = TOC_BASE + fileRel;
    for (var fj = 0; fj < fileCount; fj++) {
      var fe = fPos + fj * FILE_STRIDE;
      if (fe + FILE_STRIDE > buffer.byteLength) {
        return { ok: false, error: "File table overrun" };
      }
      files.push({
        index: fj,
        nameOffset: u32(view, fe),
        flags: u32(view, fe + 4),
        dataOffsetRel: u32(view, fe + 8),
        compressedSize: u32(view, fe + 12),
        decompressedSize: u32(view, fe + 16),
      });
    }

    var archive = {
      buffer: buffer,
      bytes: bytes,
      view: view,
      dataHeaderSize: dataHeaderSize,
      dataOffset: dataOffset,
      stringBaseAbs: stringBaseAbs,
      stringCount: stringCount,
      sections: sections,
      folders: folders,
      files: files,
    };

    return { ok: true, archive: archive };
  }

  function folderPath(archive, folderIndex) {
    var f= archive.folders[folderIndex];
    if (!f) return "";
    return readCString(archive.bytes, archive.stringBaseAbs + f.nameOffset);
  }

  function fileName(archive, fileIndex) {
    var e = archive.files[fileIndex];
    if (!e) return "";
    return readCString(archive.bytes, archive.stringBaseAbs + e.nameOffset);
  }

  function fileFullPath(archive, folderIndex, fileIndex) {
    var dir = folderPath(archive, folderIndex);
    var leaf = fileName(archive, fileIndex);
    if (!dir) return leaf;
    if (dir.endsWith("\\")) return dir + leaf;
    return dir + "\\" + leaf;
  }

  /** @returns {number} folder index or -1 */
  function folderIndexContainingFile(archive, fileIndex) {
    for (var folderIndex = 0; folderIndex < archive.folders.length; folderIndex++) {
      var list = listFilesInFolder(archive, folderIndex);
      for (var i = 0; i < list.length; i++) {
        if (list[i].index === fileIndex) return folderIndex;
      }
    }
    return -1;
  }

  /**
   * Full path inside the archive (folder + leaf, Relic backslashes).
   * Needed for logical-path lookups such as sibling `.whe` resolution.
   */
  function logicalPathForFile(archive, fileIndex) {
    var fi = folderIndexContainingFile(archive, fileIndex);
    if (fi < 0) return fileName(archive, fileIndex);
    return fileFullPath(archive, fi, fileIndex);
  }

  /**
   * Normalize archive paths for comparison (forward slashes, lower case, trim leading slashes).
   * @param {string} p
   * @returns {string}
   */
  function normalizeLogicalPath(p) {
    return String(p || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .toLowerCase();
  }

  /**
   * Find a file entry by full path inside an archive (any folder).
   * @param {*} archive
   * @param {string} logicalPath e.g. art/foo/bar.rsh
   * @returns {typeof archive.files[0] | null}
   */
  function findFileByLogicalPath(archive, logicalPath) {
    var want = normalizeLogicalPath(logicalPath);
    if (!want) return null;
    for (var folderIndex = 0; folderIndex < archive.folders.length; folderIndex++) {
      var list = listFilesInFolder(archive, folderIndex);
      for (var i = 0; i < list.length; i++) {
        var fe = list[i];
        var full = fileFullPath(archive, folderIndex, fe.index);
        if (normalizeLogicalPath(full) === want) {
          return fe;
        }
      }
    }
    return null;
  }

  function sliceCompressed(archive, fileEntry) {
    var start = archive.dataOffset + fileEntry.dataOffsetRel;
    var end = start + fileEntry.compressedSize;
    if (start > archive.bytes.length || end > archive.bytes.length) {
      return null;
    }
    return archive.bytes.subarray(start, end);
  }

  /**
   * @param {Uint8Array} data
   * @param {string} format 'deflate' | 'deflate-raw'
   */
  async function decompressStream(data, format) {
    var stream = new Blob([data]).stream().pipeThrough(
      new DecompressionStream(format)
    );
    var out = await new Response(stream).arrayBuffer();
    return new Uint8Array(out);
  }

  /**
   * Zlib-wrapped deflate first; then raw deflate.
   */
  async function decompressIfNeeded(fileEntry, compressedBytes) {
    if (fileEntry.compressedSize === fileEntry.decompressedSize) {
      return compressedBytes;
    }
    try {
      return await decompressStream(compressedBytes, "deflate");
    } catch (e1) {
      try {
        return await decompressStream(compressedBytes, "deflate-raw");
      } catch (e2) {
        var err = new Error(
          "Decompression failed (zlib and raw deflate): " +
            (e2 && e2.message ? e2.message : e2)
        );
        err.cause = e2;
        throw err;
      }
    }
  }

  /**
   * @param {*} archive
   * @param {*} fileEntry
   * @returns {Promise<Uint8Array>}
   */
  async function readFileData(archive, fileEntry) {
    var raw = sliceCompressed(archive, fileEntry);
    if (!raw) {
      throw new Error("File data out of range");
    }
    return decompressIfNeeded(fileEntry, raw);
  }

  function listFilesInFolder(archive, folderIndex) {
    var f = archive.folders[folderIndex];
    if (!f) return [];
    var out = [];
    for (var i = f.firstFile; i < f.lastFile; i++) {
      out.push(archive.files[i]);
    }
    return out;
  }

  function childFolderIndices(archive, folderIndex) {
    var f = archive.folders[folderIndex];
    if (!f) return [];
    var out = [];
    for (var i = f.firstSubfolder; i < f.lastSubfolder; i++) {
      out.push(i);
    }
    return out;
  }

  /** Files directly in this folder (not recursive). */
  function directFileCount(archive, folderIndex) {
    var f = archive.folders[folderIndex];
    if (!f) return 0;
    return Math.max(0, f.lastFile - f.firstFile);
  }

  /** Last path segment of a folder (for tree labels). */
  function folderShortName(archive, folderIndex) {
    var full = folderPath(archive, folderIndex);
    var parts = full.replace(/\\/g, "/").split("/").filter(function (s) {
      return s.length > 0;
    });
    return parts.length ? parts[parts.length - 1] : full;
  }

  global.SGA = {
    parseSga: parseSga,
    folderPath: folderPath,
    fileName: fileName,
    fileFullPath: fileFullPath,
    folderIndexContainingFile: folderIndexContainingFile,
    logicalPathForFile: logicalPathForFile,
    normalizeLogicalPath: normalizeLogicalPath,
    findFileByLogicalPath: findFileByLogicalPath,
    readFileData: readFileData,
    sliceCompressed: sliceCompressed,
    crc32: crc32,
    formatBytes: formatBytes,
    compressionRatio: compressionRatio,
    listFilesInFolder: listFilesInFolder,
    childFolderIndices: childFolderIndices,
    directFileCount: directFileCount,
    folderShortName: folderShortName,
  };
})(typeof window !== "undefined" ? window : globalThis);
