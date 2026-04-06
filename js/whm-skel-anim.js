/**
 * WHM / WHE — DATASKEL + FOLDANIM extraction (layout from blender_dow importer.py CH_DATASKEL / CH_FOLDANIM).
 */
(function (global) {
  "use strict";

  var UTF8 = new TextDecoder("utf-8", { fatal: false });

  function typeidKey(t) {
    return String(t || "")
      .replace(/\0/g, "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
  }

  function readStr(dv, u8, off) {
    if (off + 4 > u8.length) return { s: "", o: off };
    var len = dv.getInt32(off, true);
    off += 4;
    if (len <= 0) return { s: "", o: off };
    if (len > 1e8 || off + len > u8.length) return { s: "", o: off };
    var s = UTF8.decode(u8.subarray(off, off + len));
    return { s: s, o: off + len };
  }

  function walkFoldAnimRecursive(folderU8, out, stats) {
    Chunky.forEachChunk(folderU8, 0, folderU8.length, function (h, body) {
      var tid = typeidKey(h.typeid);
      if (tid === "FOLDANIM") {
        if (stats) stats.foldAnimFolders = (stats.foldAnimFolders || 0) + 1;
        Chunky.forEachChunk(body, 0, body.length, function (h2, b2) {
          if (typeidKey(h2.typeid) === "DATADATA") {
            if (stats) stats.animDatadataChunks = (stats.animDatadataChunks || 0) + 1;
            var clip = parseAnimDatadata(b2, h2.version, (h2.name || h.name || "").replace(/\0/g, "").trim());
            if (clip) {
              out.push(clip);
              if (stats) stats.clipsOk = (stats.clipsOk || 0) + 1;
            } else if (stats) stats.clipsRejected = (stats.clipsRejected || 0) + 1;
          }
        });
      } else if (tid.indexOf("FOLD") === 0) {
        walkFoldAnimRecursive(body, out, stats);
      }
    });
  }

  function skipMeshAnimBlocks(dv, u8, off, numMeshes) {
    var i;
    var j;
    for (i = 0; i < numMeshes; i++) {
      var sn = readStr(dv, u8, off);
      off = sn.o;
      if (off + 4 > u8.length) return -1;
      var mode = dv.getInt32(off, true);
      off += 4;
      if (mode === 2) {
        off += 8;
        if (off + 4 > u8.length) return -1;
        var keysVis = dv.getInt32(off, true) - 1;
        off += 4;
        off += 4;
        if (off + 4 > u8.length) return -1;
        off += 4;
        for (j = 0; j < keysVis; j++) {
          if (off + 8 > u8.length) return -1;
          off += 8;
        }
      } else if (mode === 0) {
        off += 4;
        if (off + 4 > u8.length) return -1;
        off += 4;
        if (off + 4 > u8.length) return -1;
        var keysTex = dv.getInt32(off, true);
        off += 4;
        for (j = 0; j < keysTex; j++) {
          if (off + 8 > u8.length) return -1;
          off += 8;
        }
      } else {
        return -1;
      }
    }
    return off;
  }

  function skipCameraAnimBlock(dv, u8, off) {
    if (off + 4 > u8.length) return off;
    var numCams = dv.getInt32(off, true);
    off += 4;
    var ci;
    var k;
    for (ci = 0; ci < numCams; ci++) {
      var nm = readStr(dv, u8, off);
      off = nm.o;
      if (off + 4 > u8.length) return -1;
      var pk = dv.getInt32(off, true);
      off += 4;
      for (k = 0; k < pk; k++) {
        if (off + 16 > u8.length) return -1;
        off += 16;
      }
      if (off + 4 > u8.length) return -1;
      var rk = dv.getInt32(off, true);
      off += 4;
      for (k = 0; k < rk; k++) {
        if (off + 20 > u8.length) return -1;
        off += 20;
      }
    }
    return off;
  }

  /**
   * @param {Uint8Array} body - DATADATA chunk under FOLDANIM
   * @param {number} chunkVersion
   * @param {string} fallbackName
   */
  function parseAnimDatadata(body, chunkVersion, fallbackName) {
    if (!body || body.length < 12) return null;
    var u8 = body;
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var off = 0;
    var numFrames = dv.getInt32(off, true);
    off += 4;
    var duration = dv.getFloat32(off, true);
    off += 4;
    if (numFrames < 1 || !isFinite(duration) || duration <= 0) return null;
    var numBones = dv.getInt32(off, true);
    off += 4;
    if (numBones < 0 || numBones > 1024) return null;
    var bones = [];
    var bi;
    for (bi = 0; bi < numBones; bi++) {
      var bn = readStr(dv, u8, off);
      off = bn.o;
      if (off + 4 > u8.length) return null;
      var keysPos = dv.getInt32(off, true);
      off += 4;
      if (keysPos < 0 || keysPos > 100000) return null;
      var posKeys = [];
      var k;
      for (k = 0; k < keysPos; k++) {
        if (off + 16 > u8.length) return null;
        var tk = dv.getFloat32(off, true) * Math.max(0, numFrames - 1);
        off += 4;
        var x = dv.getFloat32(off, true);
        var y = dv.getFloat32(off + 4, true);
        var z = dv.getFloat32(off + 8, true);
        off += 12;
        posKeys.push({ t: tk, x: x, y: y, z: z });
      }
      if (off + 4 > u8.length) return null;
      var keysRot = dv.getInt32(off, true);
      off += 4;
      if (keysRot < 0 || keysRot > 100000) return null;
      var rotKeys = [];
      for (k = 0; k < keysRot; k++) {
        if (off + 20 > u8.length) return null;
        var tk2 = dv.getFloat32(off, true) * Math.max(0, numFrames - 1);
        off += 4;
        var qx = dv.getFloat32(off, true);
        var qy = dv.getFloat32(off + 4, true);
        var qz = dv.getFloat32(off + 8, true);
        var qw = dv.getFloat32(off + 12, true);
        off += 16;
        rotKeys.push({ t: tk2, x: qx, y: qy, z: qz, w: qw });
      }
      if (off + 1 > u8.length) return null;
      off += 1;
      bones.push({ name: bn.s || "bone_" + bi, posKeys: posKeys, rotKeys: rotKeys });
    }
    if (off + 4 > u8.length) return null;
    var numMeshes = dv.getInt32(off, true);
    off += 4;
    if (numMeshes < 0 || numMeshes > 4096) return null;
    off = skipMeshAnimBlocks(dv, u8, off, numMeshes);
    if (off < 0) return null;
    if (chunkVersion >= 2) {
      off = skipCameraAnimBlock(dv, u8, off);
      if (off < 0) return null;
    }
    var clipName = fallbackName || "anim";
    return {
      name: clipName,
      numFrames: numFrames,
      duration: duration,
      bones: bones,
    };
  }

  function extractSkeletonFromRsgm(rsgmBody) {
    if (!rsgmBody || !rsgmBody.length) return { ok: false, error: "No RSGM", bones: [] };
    var skelBody = null;
    Chunky.forEachChunk(rsgmBody, 0, rsgmBody.length, function (h, body) {
      var tid = typeidKey(h.typeid);
      var nm = (h.name || "").replace(/\0/g, "").trim().toUpperCase();
      if (tid === "DATASKEL" || (tid === "DATA" && nm === "SKEL")) skelBody = body;
    });
    if (!skelBody || skelBody.length < 4) return { ok: false, error: "No DATASKEL", bones: [] };
    var u8 = skelBody;
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var off = 0;
    var numBones = dv.getInt32(off, true);
    off += 4;
    if (numBones < 0 || numBones > 1024) return { ok: false, error: "Bad bone count", bones: [] };
    var bones = [];
    var i;
    for (i = 0; i < numBones; i++) {
      var bn = readStr(dv, u8, off);
      off = bn.o;
      if (off + 20 > u8.length) return { ok: false, error: "Truncated skeleton", bones: [] };
      var parentIdx = dv.getInt32(off, true);
      off += 4;
      var px = dv.getFloat32(off, true);
      var py = dv.getFloat32(off + 4, true);
      var pz = dv.getFloat32(off + 8, true);
      off += 12;
      var qx = dv.getFloat32(off, true);
      var qy = dv.getFloat32(off + 4, true);
      var qz = dv.getFloat32(off + 8, true);
      var qw = dv.getFloat32(off + 12, true);
      off += 16;
      bones.push({
        name: bn.s || "bone_" + i,
        parentIdx: parentIdx,
        pos: [px, py, pz],
        rot: [qx, qy, qz, qw],
      });
    }
    return { ok: true, bones: bones };
  }

  function extractAnimationsFromRsgm(rsgmBody, stats) {
    var clips = [];
    if (!rsgmBody || !rsgmBody.length) return clips;
    walkFoldAnimRecursive(rsgmBody, clips, stats || null);
    return clips;
  }

  /**
   * @param {Uint8Array} u8 - WHM or WHE (Relic Chunky with FOLDRSGM)
   */
  /**
   * @param {Uint8Array} u8
   * @param {object} [statsOut] — optional counters: relicChunkyOk, rsgmFound, rsgmByteLength, dataSkelFound
   */
  function extractSkeleton(u8, statsOut) {
    if (typeof Chunky === "undefined" || typeof WHM === "undefined" || !WHM.findRsgmFolderBody) {
      if (statsOut) statsOut.error = "Parser not loaded";
      return { ok: false, error: "Parser not loaded", bones: [] };
    }
    if (!Chunky.startsWithRelicChunky(u8)) {
      if (statsOut) statsOut.relicChunkyOk = false;
      return { ok: false, error: "Not Chunky", bones: [] };
    }
    if (statsOut) statsOut.relicChunkyOk = true;
    var off =
      typeof Chunky.getFirstChunkOffset === "function" ? Chunky.getFirstChunkOffset(u8) : 28;
    if (off < 0) off = 24;
    var rsgm = WHM.findRsgmFolderBody(u8, off);
    if (!rsgm) {
      var alt = off === 28 ? 24 : 28;
      rsgm = WHM.findRsgmFolderBody(u8, alt);
    }
    if (statsOut) {
      statsOut.rsgmFound = !!rsgm;
      statsOut.rsgmByteLength = rsgm ? rsgm.length : 0;
    }
    if (!rsgm) return { ok: false, error: "No FOLDRSGM", bones: [] };
    var sk = extractSkeletonFromRsgm(rsgm);
    if (statsOut) statsOut.dataSkelFound = sk.ok;
    return sk;
  }

  /**
   * @param {Uint8Array} u8
   * @param {object} [statsOut] — foldAnimFolders, animDatadataChunks, clipsOk, clipsRejected, rsgmFound, …
   */
  function extractAnimations(u8, statsOut) {
    if (typeof Chunky === "undefined" || typeof WHM === "undefined" || !WHM.findRsgmFolderBody) {
      return [];
    }
    if (!Chunky.startsWithRelicChunky(u8)) {
      if (statsOut) statsOut.relicChunkyOk = false;
      return [];
    }
    if (statsOut) {
      statsOut.relicChunkyOk = true;
      statsOut.foldAnimFolders = 0;
      statsOut.animDatadataChunks = 0;
      statsOut.clipsOk = 0;
      statsOut.clipsRejected = 0;
    }
    var off =
      typeof Chunky.getFirstChunkOffset === "function" ? Chunky.getFirstChunkOffset(u8) : 28;
    if (off < 0) off = 24;
    var rsgm = WHM.findRsgmFolderBody(u8, off);
    if (!rsgm) {
      var alt = off === 28 ? 24 : 28;
      rsgm = WHM.findRsgmFolderBody(u8, alt);
    }
    if (statsOut) {
      statsOut.rsgmFound = !!rsgm;
      statsOut.rsgmByteLength = rsgm ? rsgm.length : 0;
    }

    /**
     * .whe files often have no FOLDRSGM — animations sit under other top-level folders.
     * Scan each top-level chunk body for FOLDANIM (same recursive walk as inside RSGM).
     * @param {boolean} skipRsgmBodies — when true, skip FOLDRSGM (already scanned without results)
     */
    function extractAnimationsFromTopLevelChunks(skipRsgmBodies) {
      var acc = [];
      Chunky.forEachChunk(u8, off, u8.length, function (h, body) {
        if (skipRsgmBodies && typeidKey(h.typeid) === "FOLDRSGM") return;
        walkFoldAnimRecursive(body, acc, statsOut);
      });
      return acc;
    }

    if (!rsgm) {
      if (statsOut) statsOut.animScanMode = "wholeFileNoRsgm";
      return extractAnimationsFromTopLevelChunks(false);
    }

    var fromRsgm = extractAnimationsFromRsgm(rsgm, statsOut);
    if (fromRsgm.length > 0) {
      if (statsOut) statsOut.animScanMode = "rsgm";
      return fromRsgm;
    }

    if (statsOut) statsOut.animScanMode = "topLevelExcludingEmptyRsgm";
    return extractAnimationsFromTopLevelChunks(true);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Same translation mapping as WHM `relicVec3` mesh vertices: file (x,y,z) → preview (x,y,-z). */
  function relicBoneTranslationToMeshPreview(x, y, z) {
    return { x: x, y: y, z: -z };
  }

  var _relicBasis = null;
  function ensureRelicBasis(THREE) {
    if (!_relicBasis) {
      _relicBasis = {
        S: new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1),
        mRelic: new THREE.Matrix4(),
        mWork: new THREE.Matrix4(),
        qFile: new THREE.Quaternion(),
        qa: new THREE.Quaternion(),
        qb: new THREE.Quaternion(),
        qOut: new THREE.Quaternion(),
      };
    }
    return _relicBasis;
  }

  /**
   * Relic file quaternion (x,y,z,w) → three.js local quat matching mesh `relicVec3` basis (R' = S·R·S, S=diag(1,1,-1)).
   * @param {THREE.Quaternion} target — written and returned
   */
  function relicBoneQuaternionToMeshPreview(THREE, qx, qy, qz, qw, target) {
    var B = ensureRelicBasis(THREE);
    B.qFile.set(qx, qy, qz, qw);
    B.mRelic.makeRotationFromQuaternion(B.qFile);
    B.mWork.copy(B.S).multiply(B.mRelic).multiply(B.S);
    return target.setFromRotationMatrix(B.mWork);
  }

  /** Raw file-space (x,y,z) for lerping position keys. */
  function samplePosKeysRaw(keys, frameF) {
    if (!keys || !keys.length) return null;
    if (keys.length === 1) return { x: keys[0].x, y: keys[0].y, z: keys[0].z };
    if (frameF <= keys[0].t) {
      var a0 = keys[0];
      return { x: a0.x, y: a0.y, z: a0.z };
    }
    var lastP = keys[keys.length - 1];
    if (frameF >= lastP.t) return { x: lastP.x, y: lastP.y, z: lastP.z };
    var i;
    for (i = 0; i < keys.length - 1; i++) {
      if (keys[i + 1].t >= frameF) break;
    }
    var p0 = keys[i];
    var p1 = keys[i + 1];
    var span = p1.t - p0.t;
    var u = span > 1e-8 ? (frameF - p0.t) / span : 0;
    return {
      x: lerp(p0.x, p1.x, u),
      y: lerp(p0.y, p1.y, u),
      z: lerp(p0.z, p1.z, u),
    };
  }

  /** Slerp rotation keys as absolute locals in mesh preview basis (same mapping as bind). */
  function sampleRotKeysAbsoluteMesh(keys, frameF, THREE, scratch) {
    if (!keys || !keys.length || !THREE || !scratch) return null;
    if (keys.length === 1) {
      return relicBoneQuaternionToMeshPreview(
        THREE,
        keys[0].x,
        keys[0].y,
        keys[0].z,
        keys[0].w,
        scratch.qOut
      );
    }
    if (frameF <= keys[0].t) {
      var k0 = keys[0];
      return relicBoneQuaternionToMeshPreview(THREE, k0.x, k0.y, k0.z, k0.w, scratch.qOut);
    }
    var lastK = keys[keys.length - 1];
    if (frameF >= lastK.t) {
      return relicBoneQuaternionToMeshPreview(
        THREE,
        lastK.x,
        lastK.y,
        lastK.z,
        lastK.w,
        scratch.qOut
      );
    }
    var i;
    for (i = 0; i < keys.length - 1; i++) {
      if (keys[i + 1].t >= frameF) break;
    }
    var r0 = keys[i];
    var r1 = keys[i + 1];
    var span = r1.t - r0.t;
    var u = span > 1e-8 ? (frameF - r0.t) / span : 0;
    relicBoneQuaternionToMeshPreview(THREE, r0.x, r0.y, r0.z, r0.w, scratch.qKeyA);
    relicBoneQuaternionToMeshPreview(THREE, r1.x, r1.y, r1.z, r1.w, scratch.qKeyB);
    scratch.qKeyA.slerp(scratch.qKeyB, u);
    return scratch.qOut.copy(scratch.qKeyA);
  }

  var _applyClipScratch = null;
  function ensureApplyClipScratch(THREE) {
    if (_applyClipScratch && _applyClipScratch._three === THREE) return _applyClipScratch;
    _applyClipScratch = {
      _three: THREE,
      qBind: new THREE.Quaternion(),
      qKeyA: new THREE.Quaternion(),
      qKeyB: new THREE.Quaternion(),
      qOut: new THREE.Quaternion(),
    };
    return _applyClipScratch;
  }

  /**
   * @param {*} THREE
   * @param {object} clip
   * @param {number} timeSec
   * @param {boolean} loop
   * @param {THREE.Object3D[]} boneObjs - same order as skeleton
   * @param {{ bones: object[] }} skel - bind skeleton
   */
  function boneNameNorm(s) {
    return String(s || "")
      .replace(/\0/g, "")
      .trim()
      .toLowerCase();
  }

  function boneNameLoose(s) {
    var n = boneNameNorm(s);
    var pipe = n.lastIndexOf("|");
    if (pipe >= 0) n = n.slice(pipe + 1);
    return n;
  }

  /**
   * When skeleton and clip list the same bones in different orders, pairing by index scrambles tracks.
   * If counts match and sorted names line up pairwise, return skelIndex → clipIndex; else null.
   */
  function buildSkelToClipIndexMap(skelBones, clipBones) {
    if (!skelBones || !clipBones || skelBones.length !== clipBones.length) return null;
    var n = skelBones.length;
    var si = new Array(n);
    var ci = new Array(n);
    var i;
    for (i = 0; i < n; i++) {
      si[i] = i;
      ci[i] = i;
    }
    function skelKey(idx) {
      return boneNameNorm(skelBones[idx].name);
    }
    function clipKey(idx) {
      return boneNameNorm(clipBones[idx].name);
    }
    si.sort(function (a, b) {
      var c = skelKey(a).localeCompare(skelKey(b));
      return c !== 0 ? c : a - b;
    });
    ci.sort(function (a, b) {
      var c = clipKey(a).localeCompare(clipKey(b));
      return c !== 0 ? c : a - b;
    });
    for (i = 0; i < n; i++) {
      if (skelKey(si[i]) !== clipKey(ci[i])) return null;
    }
    var map = new Array(n);
    for (i = 0; i < n; i++) map[si[i]] = ci[i];
    return map;
  }

  /**
   * Pose each bone using absolute locals in mesh preview space: same (x,y,-z) translation and S·R·S
   * rotation as DATASKEL / buildSkeletonVisualization. Tracks must be authored as absolute bone locals.
   */
  function applyClip(THREE, clip, timeSec, loop, boneObjs, skel) {
    if (!clip || !boneObjs || !skel || !skel.bones) return;
    var S = ensureApplyClipScratch(THREE);
    var dur = clip.duration > 1e-6 ? clip.duration : clip.numFrames / 30;
    var t = timeSec;
    if (loop) t = ((t % dur) + dur) % dur;
    else t = Math.max(0, Math.min(dur, t));
    var nF = Math.max(1, clip.numFrames);
    var frameF = (t / dur) * (nF - 1);
    var skelToClip = buildSkelToClipIndexMap(skel.bones, clip.bones);
    var nameToAnimBone = {};
    var b;
    for (b = 0; b < clip.bones.length; b++) {
      var cBone = clip.bones[b];
      var rawNm = cBone.name;
      nameToAnimBone[rawNm] = cBone;
      var nn = boneNameNorm(rawNm);
      nameToAnimBone[nn] = cBone;
      nameToAnimBone[boneNameLoose(rawNm)] = cBone;
    }
    for (b = 0; b < boneObjs.length; b++) {
      var sb = skel.bones[b];
      var bo = boneObjs[b];
      var ab = null;
      if (skelToClip) {
        ab = clip.bones[skelToClip[b]];
      } else {
        ab =
          nameToAnimBone[sb.name] ||
          nameToAnimBone[boneNameNorm(sb.name)] ||
          nameToAnimBone[boneNameLoose(sb.name)] ||
          null;
      }
      var bp = relicBoneTranslationToMeshPreview(sb.pos[0], sb.pos[1], sb.pos[2]);
      relicBoneQuaternionToMeshPreview(THREE, sb.rot[0], sb.rot[1], sb.rot[2], sb.rot[3], S.qBind);
      if (!ab) {
        bo.position.set(bp.x, bp.y, bp.z);
        bo.quaternion.copy(S.qBind);
        continue;
      }
      var pRaw = samplePosKeysRaw(ab.posKeys, frameF);
      var rq = sampleRotKeysAbsoluteMesh(ab.rotKeys, frameF, THREE, S);
      if (pRaw) {
        var pm = relicBoneTranslationToMeshPreview(pRaw.x, pRaw.y, pRaw.z);
        bo.position.set(pm.x, pm.y, pm.z);
      } else {
        bo.position.set(bp.x, bp.y, bp.z);
      }
      if (rq) {
        bo.quaternion.copy(rq).normalize();
      } else {
        bo.quaternion.copy(S.qBind);
      }
    }
  }

  /**
   * @param {object} clip
   * @param {number} timeSec
   * @param {boolean} loop
   * @returns {{ frameIndex0: number, frameFloat: number, numFrames: number }}
   */
  function clipFrameState(clip, timeSec, loop) {
    if (!clip || clip.numFrames < 1) {
      return { frameIndex0: 0, frameFloat: 0, numFrames: 0 };
    }
    var dur = clip.duration > 1e-6 ? clip.duration : clip.numFrames / 30;
    var t = timeSec;
    if (loop) t = ((t % dur) + dur) % dur;
    else t = Math.max(0, Math.min(dur, t));
    var nF = Math.max(1, clip.numFrames);
    var frameF = (t / dur) * (nF - 1);
    var fi = Math.round(frameF);
    if (fi < 0) fi = 0;
    if (fi > nF - 1) fi = nF - 1;
    return { frameIndex0: fi, frameFloat: frameF, numFrames: nF };
  }

  global.WHMSkelAnim = {
    extractSkeleton: extractSkeleton,
    extractAnimations: extractAnimations,
    applyClip: applyClip,
    clipFrameState: clipFrameState,
    relicBoneTranslationToMeshPreview: relicBoneTranslationToMeshPreview,
    relicBoneQuaternionToMeshPreview: relicBoneQuaternionToMeshPreview,
  };
})(typeof window !== "undefined" ? window : globalThis);
