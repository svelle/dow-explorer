/**
 * Dawn of War .whm — Relic Chunky mesh extraction for preview.
 * MSLC → DATADATA layout follows amorgun/blender_dow CH_FOLDMSLC.
 */
(function (global) {
  "use strict";

  var UTF8 = new TextDecoder("utf-8", { fatal: false });

  /**
   * @param {*} x
   * @returns {Uint8Array | null}
   */
  function normalizeToUint8Array(x) {
    if (x == null) return null;
    if (x instanceof Uint8Array) return x;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (ArrayBuffer.isView(x)) {
      return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    }
    return null;
  }

  function meshGeometryOk(m) {
    return (
      m &&
      m.positions &&
      m.normals &&
      m.uvs &&
      m.indices &&
      m.positions.length >= 9 &&
      m.indices.length >= 3
    );
  }

  /**
   * @param {DataView} dv
   * @param {Uint8Array} u8
   * @param {number} off
   * @returns {{ s: string, o: number }}
   */
  function readStr(dv, u8, off) {
    if (off + 4 > u8.length) return { s: "", o: off };
    var len = dv.getInt32(off, true);
    off += 4;
    if (len <= 0) return { s: "", o: off };
    if (len > 1e8 || off + len > u8.length) return { s: "", o: off };
    var s = UTF8.decode(u8.subarray(off, off + len));
    return { s: s, o: off + len };
  }

  /**
   * Vertex float3 in file: Relic / DoW1 mesh space used successfully with three.js preview as
   * consecutive (x, y, z) plus negate Z once for right-handed Y-up (differs from blender_dow’s
   * Blender‑space swizzle (-x,-y,z) after reordering file floats as x,z,y).
   */
  function relicVec3(dv, off) {
    return {
      x: dv.getFloat32(off, true),
      y: dv.getFloat32(off + 4, true),
      z: -dv.getFloat32(off + 8, true),
      next: off + 12,
    };
  }

  /**
   * @param {Uint8Array} body - DATADATA chunk body
   * @param {string} sliceName
   * @returns {{ ok: true, name: string, positions: Float32Array, normals: Float32Array, uvs: Float32Array, indices: Uint16Array | Uint32Array } | { ok: false, error: string }}
   */
  function parseMeshSliceDatadata(body, sliceName) {
    if (body == null) return { ok: false, error: "DATADATA missing" };
    var u8 = normalizeToUint8Array(body);
    if (!u8) return { ok: false, error: "Invalid DATADATA body" };
    if (u8.byteLength < 13) return { ok: false, error: "DATADATA too small" };
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var off = 0;

    var rsv0_a = dv.getInt32(off, true);
    off += 4;
    /* Bit 0: per-vertex skin weights follow positions (blender_dow CH_FOLDMSLC DATADATA). Bone table can exist with rigid meshes. */
    var flag = u8[off];
    off += 1;
    var numPolygons = dv.getInt32(off, true);
    off += 4;
    var rsv0_b = dv.getInt32(off, true);
    off += 4;

    var numSkinBones = dv.getInt32(off, true);
    off += 4;

    var bi;
    for (bi = 0; bi < numSkinBones; bi++) {
      var bn = readStr(dv, u8, off);
      off = bn.o;
      if (off + 4 > u8.byteLength) return { ok: false, error: "Truncated skin bone table" };
      off += 4;
    }

    if (off + 8 > u8.byteLength) return { ok: false, error: "Truncated vertex header" };
    var numVertices = dv.getInt32(off, true);
    off += 4;
    var vertexSizeId = dv.getInt32(off, true);
    off += 4;

    if (numVertices < 0 || numVertices > 500000) {
      return { ok: false, error: "Bad vertex count: " + numVertices };
    }

    var pos = new Float32Array(numVertices * 3);
    var i;
    for (i = 0; i < numVertices; i++) {
      if (off + 12 > u8.byteLength) return { ok: false, error: "Truncated positions" };
      var p = relicVec3(dv, off);
      off = p.next;
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
    }

    /* blender_dow: skin block follows whenever num_skin_bones > 0 (not gated on flag bit). */
    var hasSkinVertexWeights = numSkinBones > 0;
    if (hasSkinVertexWeights) {
      /* Per vertex: 3 floats (weights) + 4 uint8 (bone indices) = 16 bytes */
      var skinSkip = numVertices * 16;
      if (off + skinSkip > u8.byteLength) return { ok: false, error: "Truncated skin data" };
      off += skinSkip;
    }

    var nor = new Float32Array(numVertices * 3);
    for (i = 0; i < numVertices; i++) {
      if (off + 12 > u8.byteLength) return { ok: false, error: "Truncated normals" };
      var n = relicVec3(dv, off);
      off = n.next;
      nor[i * 3] = n.x;
      nor[i * 3 + 1] = n.y;
      nor[i * 3 + 2] = n.z;
    }

    /*
     * File (u,v): v increases downward on the bitmap (DDS / Texture tab space).
     * Store u; use v' = 1 - v so sampling matches RSH CanvasTexture (flipY) + repeat wrap in the viewer.
     * Same effect as the former “UV debug → Flip V” default.
     */
    var uv = new Float32Array(numVertices * 2);
    for (i = 0; i < numVertices; i++) {
      if (off + 8 > u8.byteLength) return { ok: false, error: "Truncated UVs" };
      var u = dv.getFloat32(off, true);
      var v = dv.getFloat32(off + 4, true);
      off += 8;
      uv[i * 2] = u;
      uv[i * 2 + 1] = 1 - v;
    }

    /* int32: second UV count (0 in most slices — same four bytes blender_dow treats as padding before materials). */
    if (off + 4 > u8.byteLength) return { ok: false, error: "Truncated after UVs" };
    var numUvSet2 = dv.getInt32(off, true);
    off += 4;
    if (numUvSet2 < 0 || numUvSet2 > 500000) {
      return { ok: false, error: "Bad second UV count: " + numUvSet2 };
    }
    if (numUvSet2 > 0) {
      var uv2Bytes = numUvSet2 * 8;
      if (off + uv2Bytes > u8.byteLength) return { ok: false, error: "Truncated second UV stream" };
      off += uv2Bytes;
    }

    if (off + 4 > u8.byteLength) return { ok: false, error: "Truncated material count" };
    var numMaterials = dv.getInt32(off, true);
    off += 4;

    var faces = [];
    var materialGroups = [];
    var mi;
    for (mi = 0; mi < numMaterials; mi++) {
      var tex = readStr(dv, u8, off);
      off = tex.o;
      var shaderName = tex.s || "";
      if (off + 4 > u8.byteLength) return { ok: false, error: "Truncated material" };
      var numVertsTotal = dv.getInt32(off, true);
      off += 4;
      var numFaces = (numVertsTotal / 3) | 0;
      var groupStart = faces.length;
      var fi;
      for (fi = 0; fi < numFaces; fi++) {
        if (off + 6 > u8.byteLength) return { ok: false, error: "Truncated indices" };
        /* File order u0,u1,u2; winding flip for three.js */
        var u0 = dv.getUint16(off, true);
        var u1 = dv.getUint16(off + 2, true);
        var u2 = dv.getUint16(off + 4, true);
        off += 6;
        faces.push(u0, u2, u1);
      }
      materialGroups.push({
        shaderName: shaderName,
        start: groupStart,
        count: faces.length - groupStart,
      });
      if (off + 8 > u8.byteLength) return { ok: false, error: "Truncated material tail" };
      off += 8;
    }

    var idxLen = faces.length;
    var maxIdx = 0;
    for (i = 0; i < idxLen; i++) {
      if (faces[i] > maxIdx) maxIdx = faces[i];
    }
    var IndexArray = maxIdx > 65535 ? Uint32Array : Uint16Array;
    var indices = new IndexArray(idxLen);
    for (i = 0; i < idxLen; i++) indices[i] = faces[i];

    for (mi = 0; mi < materialGroups.length; mi++) {
      var mg = materialGroups[mi];
      var gslice = new IndexArray(mg.count);
      for (var gj = 0; gj < mg.count; gj++) {
        gslice[gj] = indices[mg.start + gj];
      }
      mg.indices = gslice;
    }

    var triangleCount = (idxLen / 3) | 0;
    if (numPolygons > 0 && triangleCount !== numPolygons) {
      return {
        ok: false,
        error:
          "DATADATA polygon count mismatch (header " +
          numPolygons +
          " vs " +
          triangleCount +
          " triangles from index data)",
      };
    }

    return {
      ok: true,
      name: sliceName || "mesh",
      positions: pos,
      normals: nor,
      uvs: uv,
      indices: indices,
      materialGroups: materialGroups,
      meshSliceFlag: flag,
      triangleCount: triangleCount,
      rsv0_a: rsv0_a,
      numPolygons: numPolygons,
      vertexSizeId: vertexSizeId,
    };
  }

  function typeidKey(t) {
    return String(t || "")
      .replace(/\0/g, "")
      .trim()
      .toUpperCase();
  }

  /**
   * Scan top-level chunks until FOLDRSGM (handles DATAFBIF and other chunks before the scene root).
   * @param {Uint8Array} u8 full file
   * @param {number} firstChunkOffset usually 24 (blender_dow) or 28 (some docs)
   * @returns {Uint8Array | null} body of FOLDRSGM folder
   */
  function findRsgmFolderBody(u8, firstChunkOffset) {
    if (!Chunky.startsWithRelicChunky(u8)) return null;
    if (firstChunkOffset < 0 || firstChunkOffset >= u8.length) return null;
    var off = firstChunkOffset;
    var guard = 0;
    while (off < u8.length && guard++ < 512) {
      var h = Chunky.readChunkHeader(u8, off);
      if (!h) return null;
      if (typeidKey(h.typeid) === "FOLDRSGM") {
        return u8.subarray(h.bodyStart, h.bodyEnd);
      }
      off = h.next;
    }
    return null;
  }

  /**
   * FOLDMSLC may live under FOLDMSGR or deeper nesting; recurse into every FOLD* chunk.
   * @param {Uint8Array} folderU8
   * @param {object[]} out
   */
  function walkFoldMslcRecursive(folderU8, out) {
    Chunky.forEachChunk(folderU8, 0, folderU8.length, function (h, body) {
      var tid = typeidKey(h.typeid);
      if (tid === "FOLDMSLC") {
        Chunky.forEachChunk(body, 0, body.length, function (h2, body2) {
          if (typeidKey(h2.typeid) === "DATADATA") {
            var parsed = parseMeshSliceDatadata(body2, h.name);
            if (parsed && parsed.ok && meshGeometryOk(parsed)) {
              out.push(parsed);
            }
          }
        });
      } else if (tid.indexOf("FOLD") === 0) {
        walkFoldMslcRecursive(body, out);
      }
    });
  }

  /**
   * DATA SSHR under FOLDRSGM: chunk name = shader key, body = length-prefixed texture path (no extension).
   * @param {Uint8Array} rsgmBody
   * @returns {Record<string, string>}
   */
  function extractShaderMapFromRsgm(rsgmBody) {
    var map = {};
    if (!rsgmBody || !rsgmBody.length) return map;
    function walk(folderU8) {
      Chunky.forEachChunk(folderU8, 0, folderU8.length, function (h, body) {
        var tid = typeidKey(h.typeid);
        var chunkName = (h.name || "").replace(/\0/g, "").trim();
        var isSshr =
          tid === "SSHR" ||
          tid === "DATASSHR" ||
          (tid === "DATA" && chunkName.toUpperCase() === "SSHR");
        if (isSshr && body.length >= 4) {
          var dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
          var rs = readStr(dv, body, 0);
          var path = (rs.s || "").replace(/\0/g, "").trim();
          var key = (h.name || "").replace(/\0/g, "").trim();
          if (!key && path) {
            var parts = path.replace(/\\/g, "/").split("/");
            key = parts.length ? parts[parts.length - 1] : path;
          }
          if (key && path) {
            map[key] = path;
            map[key.toLowerCase()] = path;
          }
        }
        if (tid.indexOf("FOLD") === 0) {
          walk(body);
        }
      });
    }
    walk(rsgmBody);
    return map;
  }

  /**
   * @param {Uint8Array} u8 full file
   * @returns {{ ok: true, meshes: object[] } | { ok: false, error: string }}
   */
  function extractMeshes(u8) {
    if (typeof Chunky === "undefined") {
      return { ok: false, error: "Chunky parser not loaded" };
    }
    u8 = normalizeToUint8Array(u8);
    if (!u8) {
      return { ok: false, error: "Invalid file data (expected bytes)" };
    }
    if (Chunky.skipRelicChunky(u8) < 0) {
      return { ok: false, error: 'Not a Relic Chunky file (expected "Relic Chunky")' };
    }

    var offPrimary =
      typeof Chunky.getFirstChunkOffset === "function" ? Chunky.getFirstChunkOffset(u8) : 28;
    if (offPrimary < 0) {
      return { ok: false, error: "Invalid Relic Chunky layout" };
    }
    var offAlt = offPrimary === 28 ? 24 : 28;
    var rsgmBody = findRsgmFolderBody(u8, offPrimary);
    if (!rsgmBody && u8.length >= offAlt) {
      rsgmBody = findRsgmFolderBody(u8, offAlt);
    }
    if (!rsgmBody) {
      return {
        ok: false,
        error: "Could not find FOLDRSGM chunk (tried first chunk at " + offPrimary + " and " + offAlt + " bytes)",
      };
    }

    var meshes = [];
    walkFoldMslcRecursive(rsgmBody, meshes);

    if (meshes.length === 0) {
      return {
        ok: false,
        error:
          "No usable mesh slices (FOLDMSLC/DATADATA with positions and indices) found under RSGM",
      };
    }

    var shaderMap = extractShaderMapFromRsgm(rsgmBody);

    return { ok: true, meshes: meshes, shaderMap: shaderMap };
  }

  function lookupTexture(textureMap, shaderName) {
    if (!textureMap || !shaderName) return null;
    if (textureMap[shaderName]) return textureMap[shaderName];
    var low = shaderName.toLowerCase();
    if (textureMap[low]) return textureMap[low];
    for (var k in textureMap) {
      if (k.toLowerCase() === low) return textureMap[k];
    }
    return null;
  }

  /**
   * @param {object[]} meshes from extractMeshes
   * @param {typeof THREE} THREE
   * @param {{ matcapTexture?: object | null, textureMap?: Record<string, THREE.Texture> | null }} [options]
   * @returns {THREE.Group}
   */
  function buildThreeGroup(meshes, THREE, options) {
    options = options || {};
    var matcapTexture = options.matcapTexture || null;
    var textureMap = options.textureMap || null;
    var group = new THREE.Group();
    var colorHue = 0;

    function makeMaterial(col, name, shaderName) {
      var tex = lookupTexture(textureMap, shaderName || "");
      var mat;
      if (tex) {
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          color: 0xffffff,
          metalness: 0.1,
          roughness: 0.62,
          side: THREE.DoubleSide,
          flatShading: false,
          alphaTest: 0.45,
          depthWrite: true,
        });
        mat.userData.baseColor = new THREE.Color(0xffffff);
      } else if (matcapTexture) {
        /* Matcaps are pre-lit; tone mapping + ACES otherwise crushes them to black. */
        mat = new THREE.MeshMatcapMaterial({
          matcap: matcapTexture,
          color: col,
          side: THREE.FrontSide,
          flatShading: false,
          toneMapped: false,
        });
        mat.userData.baseColor = col.clone();
      } else {
        mat = new THREE.MeshStandardMaterial({
          color: col,
          metalness: 0.12,
          roughness: 0.55,
          side: THREE.FrontSide,
          flatShading: false,
        });
        mat.userData.baseColor = col.clone();
      }
      if (name) mat.name = name;
      return mat;
    }

    meshes.forEach(function (m) {
      if (!meshGeometryOk(m)) return;
      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(m.uvs, 2));
      geo.setIndex(new THREE.BufferAttribute(m.indices, 1));

      var mats = [];
      var mg = m.materialGroups;
      if (mg && mg.length > 0) {
        var gi;
        for (gi = 0; gi < mg.length; gi++) {
          var hue = ((colorHue + gi) * 0.11) % 1;
          var col = new THREE.Color().setHSL(hue, 0.35, 0.55);
          var sn = mg[gi].shaderName || "";
          mats.push(makeMaterial(col, sn || "material_" + gi, sn));
          geo.addGroup(mg[gi].start, mg[gi].count, gi);
        }
        colorHue += mg.length;
      } else {
        var hue1 = (colorHue * 0.11) % 1;
        colorHue += 1;
        mats.push(makeMaterial(new THREE.Color().setHSL(hue1, 0.35, 0.55), null, ""));
      }

      /* Normals in the file may not match our triangle winding (u0,u2,u1); recompute for correct shading. */
      geo.computeVertexNormals();

      geo.computeBoundingBox();
      geo.computeBoundingSphere();

      var mesh = new THREE.Mesh(geo, mats.length === 1 ? mats[0] : mats);
      mesh.name = m.name || "mesh";
      mesh.userData.meshMaterials = mats;
      group.add(mesh);
    });
    return group;
  }

  global.WHM = {
    extractMeshes: extractMeshes,
    buildThreeGroup: buildThreeGroup,
    parseMeshSliceDatadata: parseMeshSliceDatadata,
    extractShaderMapFromRsgm: extractShaderMapFromRsgm,
  };
})(typeof window !== "undefined" ? window : globalThis);
