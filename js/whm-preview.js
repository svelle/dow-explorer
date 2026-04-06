/**
 * WebGL preview for .whm meshes (Three.js via globalThis.THREE from dist/three-global.js).
 */
(function (global) {
  "use strict";

  /* npm `three` package does not publish examples/textures (404 on jsdelivr). */
  var MATCAP_URL =
    "https://threejs.org/examples/textures/matcaps/matcap-porcelain-white.jpg";

  var scene;
  var camera;
  var renderer;
  var rootGroup;
  var groundMesh;
  var viewHelper;
  var canvas;
  var rafId = 0;
  var boundResize;
  var dragging = false;
  var lastX = 0;
  var lastY = 0;
  var rotY = 0;
  var rotX = 0;
  var turntableEnabled = false;
  var turntableRadPerSec = 0.22;
  var WHM_PREVIEW_FPS_CAP = 60;
  var WHM_PREVIEW_FRAME_MIN_MS = 1000 / WHM_PREVIEW_FPS_CAP;
  /** Wall clock for 60fps cap; null until first tick after load. */
  var whmPreviewFpsGateLastMs = null;
  /** Default framing: camera in +X, +Y, +Z octant toward origin (same as fitCameraToGroup). */
  var WHM_DEFAULT_VIEW_DIR_X = 0.55;
  var WHM_DEFAULT_VIEW_DIR_Y = 0.35;
  var WHM_DEFAULT_VIEW_DIR_Z = 0.75;
  var resizeObserver = null;
  var matcapTexture = null;
  var selectedMeshIndex = -1;
  /** Maps `extracted.meshes` index → THREE.Mesh/SkinnedMesh (skips skeleton line, ground). */
  var whmMeshBySourceIndex = [];
  var sidebarRef = null;
  /** @type {{ label: string, texture: object }[]} */
  var textureCatalog = [];
  /** @type {Record<string, number[][]>} shader key (lower) → list of [u0,v0,u1,v1,u2,v2] */
  var uvTrianglesByShader = {};
  var displaySelectHandler = null;
  var skelArmature = null;
  var skelBoneObjs = null;
  /** @type {object | null} THREE.Skeleton shared by SkinnedMesh instances */
  var whmSharedSkeleton = null;
  var skelLineGeom = null;
  var skelLineSeg = null;
  var skelData = null;
  var animClips = [];
  var animClipIndex = 0;
  var animTime = 0;
  var animPlaying = false;
  var animSpeed = 1;
  var animLoop = true;
  var skelPointerMoveHandler = null;
  var skelHoverRaycaster = null;
  var skelHoverNdc = null;
  var skelHoverTmp = null;
  var _skelVA = null;
  var _skelVB = null;
  var skelAnimUi = {
    skeletonChange: null,
    animSelectChange: null,
    animPlayClick: null,
    animScrubInput: null,
    animScrubPointerDown: null,
    animSpeedInput: null,
    animLoopChange: null,
  };

  function getClipDuration(clip) {
    if (!clip) return 1;
    if (clip.duration > 1e-6) return clip.duration;
    return Math.max(1 / 30, clip.numFrames / 30);
  }

  function whmHideBoneTooltip() {
    var tip = document.getElementById("preview-whm-bone-tooltip");
    if (tip) {
      tip.hidden = true;
      tip.textContent = "";
    }
  }

  function whmApplyBindPoseToBones(THREE) {
    if (!THREE || !skelBoneObjs || !skelData || !skelData.bones) return;
    if (typeof global.WHMSkelAnim === "undefined") return;
    var b;
    for (b = 0; b < skelBoneObjs.length; b++) {
      var sb = skelData.bones[b];
      var bo = skelBoneObjs[b];
      var tr = WHMSkelAnim.relicBoneTranslationToMeshPreview(sb.pos[0], sb.pos[1], sb.pos[2]);
      bo.position.set(tr.x, tr.y, tr.z);
      WHMSkelAnim.relicBoneQuaternionToMeshPreview(THREE, sb.rot[0], sb.rot[1], sb.rot[2], sb.rot[3], bo.quaternion);
    }
  }

  function updateSkelLines(THREE) {
    if (!THREE || !skelLineGeom || !skelLineSeg || !skelBoneObjs || !skelData || !rootGroup) {
      return;
    }
    if (!_skelVA) _skelVA = new THREE.Vector3();
    if (!_skelVB) _skelVB = new THREE.Vector3();
    var attr = skelLineGeom.getAttribute("position");
    var arr = attr.array;
    var idx = 0;
    var i;
    for (i = 0; i < skelBoneObjs.length; i++) {
      var pIdx = skelData.bones[i].parentIdx;
      if (pIdx < 0) continue;
      skelBoneObjs[i].getWorldPosition(_skelVA);
      skelBoneObjs[pIdx].getWorldPosition(_skelVB);
      rootGroup.worldToLocal(_skelVA);
      rootGroup.worldToLocal(_skelVB);
      arr[idx++] = _skelVB.x;
      arr[idx++] = _skelVB.y;
      arr[idx++] = _skelVB.z;
      arr[idx++] = _skelVA.x;
      arr[idx++] = _skelVA.y;
      arr[idx++] = _skelVA.z;
    }
    attr.needsUpdate = true;
    skelLineGeom.setDrawRange(0, (idx / 3) | 0);
  }

  function buildSkeletonVisualization(THREE, root, skel) {
    skelArmature = new THREE.Group();
    skelArmature.name = "WhmSkelArmature";
    /* Visible armature: invisible groups can skip matrix updates in some cases; no meshes on this group. */
    skelArmature.visible = true;
    skelBoneObjs = [];
    var i;
    for (i = 0; i < skel.bones.length; i++) {
      var bi = skel.bones[i];
      var o = new THREE.Object3D();
      o.name = bi.name;
      if (typeof global.WHMSkelAnim !== "undefined") {
        var t0 = WHMSkelAnim.relicBoneTranslationToMeshPreview(bi.pos[0], bi.pos[1], bi.pos[2]);
        o.position.set(t0.x, t0.y, t0.z);
        WHMSkelAnim.relicBoneQuaternionToMeshPreview(
          THREE,
          bi.rot[0],
          bi.rot[1],
          bi.rot[2],
          bi.rot[3],
          o.quaternion
        );
      } else {
        o.position.set(bi.pos[0], bi.pos[1], -bi.pos[2]);
      }
      skelBoneObjs.push(o);
    }
    for (i = 0; i < skel.bones.length; i++) {
      var p = skel.bones[i].parentIdx;
      if (p >= 0 && p < skelBoneObjs.length) skelBoneObjs[p].add(skelBoneObjs[i]);
      else skelArmature.add(skelBoneObjs[i]);
    }
    root.add(skelArmature);
    var segCount = 0;
    for (i = 0; i < skel.bones.length; i++) {
      if (skel.bones[i].parentIdx >= 0) segCount++;
    }
    var maxVerts = Math.max(segCount, 1) * 2;
    var pos = new Float32Array(maxVerts * 3);
    skelLineGeom = new THREE.BufferGeometry();
    skelLineGeom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    var skelMat = new THREE.LineBasicMaterial({ color: 0x5ec8ff, toneMapped: false });
    skelLineSeg = new THREE.LineSegments(skelLineGeom, skelMat);
    skelLineSeg.name = "WhmSkelLines";
    skelLineSeg.renderOrder = 999;
    root.add(skelLineSeg);
    skelLineSeg.visible = false;
  }

  function whmSyncAnimScrubAttrs() {
    var scrub = document.getElementById("preview-whm-anim-scrub");
    if (!scrub || !animClips.length) return;
    var c = animClips[animClipIndex] || animClips[0];
    var d = getClipDuration(c);
    scrub.max = String(d);
  }

  function whmSetAnimPlayButtonPlaying(playing) {
    var btn = document.getElementById("preview-whm-anim-play");
    if (!btn) return;
    btn.textContent = playing ? "⏸" : "▶";
    btn.setAttribute("aria-pressed", playing ? "true" : "false");
  }

  function unbindSkelAnimControls() {
    animPlaying = false;
    animClips = [];
    animClipIndex = 0;
    animTime = 0;
    animSpeed = 1;
    animLoop = true;
    skelArmature = null;
    skelBoneObjs = null;
    skelLineGeom = null;
    skelLineSeg = null;
    skelData = null;
    skelHoverRaycaster = null;
    skelHoverNdc = null;
    skelHoverTmp = null;
    _skelVA = null;
    _skelVB = null;
    if (canvas && skelPointerMoveHandler) {
      canvas.removeEventListener("pointermove", skelPointerMoveHandler);
      skelPointerMoveHandler = null;
    }
    var sk = document.getElementById("preview-whm-show-skeleton");
    if (sk && skelAnimUi.skeletonChange) {
      sk.removeEventListener("change", skelAnimUi.skeletonChange);
    }
    var sel = document.getElementById("preview-whm-anim-select");
    if (sel && skelAnimUi.animSelectChange) {
      sel.removeEventListener("change", skelAnimUi.animSelectChange);
    }
    var play = document.getElementById("preview-whm-anim-play");
    if (play && skelAnimUi.animPlayClick) {
      play.removeEventListener("click", skelAnimUi.animPlayClick);
    }
    var scrub = document.getElementById("preview-whm-anim-scrub");
    if (scrub) {
      if (skelAnimUi.animScrubInput) scrub.removeEventListener("input", skelAnimUi.animScrubInput);
      if (skelAnimUi.animScrubPointerDown) scrub.removeEventListener("pointerdown", skelAnimUi.animScrubPointerDown);
    }
    var spd = document.getElementById("preview-whm-anim-speed");
    if (spd && skelAnimUi.animSpeedInput) {
      spd.removeEventListener("input", skelAnimUi.animSpeedInput);
    }
    var lp = document.getElementById("preview-whm-anim-loop");
    if (lp && skelAnimUi.animLoopChange) {
      lp.removeEventListener("change", skelAnimUi.animLoopChange);
    }
    skelAnimUi = {
      skeletonChange: null,
      animSelectChange: null,
      animPlayClick: null,
      animScrubInput: null,
      animScrubPointerDown: null,
      animSpeedInput: null,
      animLoopChange: null,
    };
    var bar = document.getElementById("preview-whm-anim-bar");
    if (bar) bar.hidden = true;
    whmHideBoneTooltip();
    var skLbl = document.querySelector(".preview-whm-skel-label");
    if (skLbl) skLbl.hidden = true;
    if (sk) sk.checked = false;
  }

  function bindSkelAnimControls(THREE, skelResult, clipList) {
    skelData = skelResult && skelResult.ok ? skelResult : null;
    animClips = clipList && clipList.length ? clipList.slice() : [];
    animClipIndex = 0;
    animTime = 0;
    animPlaying = false;
    animSpeed = 1;
    animLoop = true;
    var hasSkel = !!(skelData && skelData.bones && skelData.bones.length);
    var canAnim = hasSkel && animClips.length > 0;
    var skLbl = document.querySelector(".preview-whm-skel-label");
    if (skLbl) {
      skLbl.setAttribute("data-whm-has-skel", hasSkel ? "1" : "0");
      skLbl.hidden = !hasSkel;
      skLbl.setAttribute("aria-hidden", !hasSkel ? "true" : "false");
    }
    var bar = document.getElementById("preview-whm-anim-bar");
    if (bar) {
      bar.setAttribute("data-whm-has-anim", canAnim ? "1" : "0");
      bar.hidden = !canAnim;
      bar.setAttribute("aria-hidden", !canAnim ? "true" : "false");
    }
    var skCb = document.getElementById("preview-whm-show-skeleton");
    if (skCb) skCb.checked = false;
    var scrub = document.getElementById("preview-whm-anim-scrub");
    var spdEl = document.getElementById("preview-whm-anim-speed");
    var lpEl = document.getElementById("preview-whm-anim-loop");
    if (scrub) {
      scrub.value = "0";
      scrub.disabled = !canAnim;
    }
    if (spdEl) {
      spdEl.value = "1";
      spdEl.disabled = !canAnim;
    }
    if (lpEl) {
      lpEl.checked = true;
      lpEl.disabled = !canAnim;
    }
    whmSetAnimPlayButtonPlaying(false);
    var playBtn = document.getElementById("preview-whm-anim-play");
    if (playBtn) playBtn.disabled = !canAnim;
    var selAnim = document.getElementById("preview-whm-anim-select");
    if (selAnim) {
      selAnim.innerHTML = "";
      selAnim.disabled = !canAnim;
      var ci;
      for (ci = 0; ci < animClips.length; ci++) {
        var opt = document.createElement("option");
        opt.value = String(ci);
        opt.textContent = animClips[ci].name || "anim_" + ci;
        selAnim.appendChild(opt);
      }
    }
    whmSyncAnimScrubAttrs();
    var frameElInit = document.getElementById("preview-whm-anim-frame");
    if (frameElInit) {
      if (canAnim && animClips[animClipIndex] && animClips[animClipIndex].numFrames > 0) {
        frameElInit.textContent =
          "1 / " + String(animClips[animClipIndex].numFrames);
      } else {
        frameElInit.textContent = "—";
      }
    }
    if (!THREE || !canvas) return;
    if (hasSkel && skCb) {
      skelAnimUi.skeletonChange = function () {
        if (!skelLineSeg) return;
        skelLineSeg.visible = !!skCb.checked;
        if (!skCb.checked) whmHideBoneTooltip();
      };
      skCb.addEventListener("change", skelAnimUi.skeletonChange);
    }
    if (hasSkel && skelBoneObjs && skelBoneObjs.length) {
      skelPointerMoveHandler = function (e) {
        if (!skelLineSeg || !skelLineSeg.visible || !skelBoneObjs || !skelData || !camera || !canvas) return;
        if (dragging) {
          whmHideBoneTooltip();
          return;
        }
        var TR = getTHREE();
        if (!TR) return;
        if (!skelHoverRaycaster) skelHoverRaycaster = new TR.Raycaster();
        if (!skelHoverNdc) skelHoverNdc = new TR.Vector2();
        if (!skelHoverTmp) skelHoverTmp = new TR.Vector3();
        var rect = canvas.getBoundingClientRect();
        skelHoverNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        skelHoverNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        skelHoverRaycaster.setFromCamera(skelHoverNdc, camera);
        var best = null;
        var bestD = Math.max(0.06, camera.position.length() * 0.018);
        var i;
        for (i = 0; i < skelBoneObjs.length; i++) {
          skelBoneObjs[i].getWorldPosition(skelHoverTmp);
          var d = skelHoverRaycaster.ray.distanceToPoint(skelHoverTmp);
          if (d < bestD) {
            bestD = d;
            best = skelData.bones[i].name;
          }
        }
        var tip = document.getElementById("preview-whm-bone-tooltip");
        var wrap = document.getElementById("preview-whm-canvas-wrap");
        if (!tip || !wrap) return;
        if (best) {
          tip.textContent = best;
          tip.hidden = false;
          var wr = wrap.getBoundingClientRect();
          tip.style.left =
            Math.min(Math.max(e.clientX - wr.left - 6, 6), Math.max(6, wr.width - 100)) + "px";
          tip.style.top =
            Math.min(Math.max(e.clientY - wr.top + 12, 6), Math.max(6, wr.height - 28)) + "px";
        } else whmHideBoneTooltip();
      };
      canvas.addEventListener("pointermove", skelPointerMoveHandler);
    }
    if (!canAnim) return;
    skelAnimUi.animSelectChange = function () {
      var v = parseInt(selAnim.value, 10);
      if (!isFinite(v) || v < 0 || v >= animClips.length) return;
      animClipIndex = v;
      animTime = 0;
      animPlaying = true;
      turntableEnabled = false;
      whmSetAnimPlayButtonPlaying(true);
      if (scrub) scrub.value = "0";
      whmSyncAnimScrubAttrs();
    };
    selAnim.addEventListener("change", skelAnimUi.animSelectChange);
    skelAnimUi.animPlayClick = function (e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (!animClips.length) return;
      animPlaying = !animPlaying;
      if (animPlaying) turntableEnabled = false;
      whmSetAnimPlayButtonPlaying(animPlaying);
    };
    playBtn.addEventListener("click", skelAnimUi.animPlayClick);
    skelAnimUi.animScrubPointerDown = function () {
      animPlaying = false;
      whmSetAnimPlayButtonPlaying(false);
    };
    scrub.addEventListener("pointerdown", skelAnimUi.animScrubPointerDown);
    skelAnimUi.animScrubInput = function () {
      animTime = parseFloat(scrub.value);
      if (!isFinite(animTime)) animTime = 0;
    };
    scrub.addEventListener("input", skelAnimUi.animScrubInput);
    skelAnimUi.animSpeedInput = function () {
      animSpeed = parseFloat(spdEl.value);
      if (!isFinite(animSpeed)) animSpeed = 1;
    };
    spdEl.addEventListener("input", skelAnimUi.animSpeedInput);
    skelAnimUi.animLoopChange = function () {
      animLoop = !!lpEl.checked;
    };
    lpEl.addEventListener("change", skelAnimUi.animLoopChange);
  }

  function buildUvTrianglesByShader(meshes) {
    var map = {};
    if (!meshes || !meshes.length) return map;
    meshes.forEach(function (m) {
      var uv = m.uvs;
      var ix = m.indices;
      var mgroups = m.materialGroups;
      if (!uv || !ix || !mgroups || !mgroups.length) return;
      mgroups.forEach(function (mg) {
        var sn = (mg.shaderName || "").trim();
        if (!sn) return;
        var key = sn.toLowerCase();
        if (!map[key]) map[key] = [];
        var list = map[key];
        var start = mg.start;
        var count = mg.count;
        for (var t = 0; t + 2 < count; t += 3) {
          var i0 = ix[start + t] * 2;
          var i1 = ix[start + t + 1] * 2;
          var i2 = ix[start + t + 2] * 2;
          list.push([
            uv[i0],
            uv[i0 + 1],
            uv[i1],
            uv[i1 + 1],
            uv[i2],
            uv[i2 + 1],
          ]);
        }
      });
    });
    return map;
  }

  function getTHREE() {
    return global.THREE;
  }

  /**
   * WebGL2 rejects texImage3D / compressedTexImage3D if UNPACK_FLIP_Y_WEBGL or
   * UNPACK_PREMULTIPLY_ALPHA_WEBGL is true. Three.js sets those from 2D texture
   * uploads but framebuffer setup can call texImage3D without resetting them first
   * (e.g. WebGL array / 3D render targets), causing INVALID_OPERATION.
   */
  function patchWebGL2UnpackFor3DUploads(gl) {
    if (!gl || gl.__whmUnpack3dPatched) return;
    gl.__whmUnpack3dPatched = true;
    var names = ["texImage3D", "texSubImage3D", "compressedTexImage3D", "compressedTexSubImage3D"];
    for (var i = 0; i < names.length; i++) {
      (function (name) {
        var orig = gl[name];
        if (typeof orig !== "function") return;
        gl[name] = function () {
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          return orig.apply(gl, arguments);
        };
      })(names[i]);
    }
  }

  /**
   * Corner orientation gizmo (Three.js ViewHelper-style): ortho viewport bottom-right,
   * axes track camera × mesh rotation so orbit-the-model matches a camera orbit gizmo.
   * @param {typeof THREE} THREE
   * @param {THREE.PerspectiveCamera} cam
   * @param {HTMLElement} domElement
   * @param {function(): THREE.Object3D | null} getRootGroup
   */
  function createWhmViewHelper(THREE, cam, domElement, getRootGroup) {
    var dim = 128;
    var color1 = new THREE.Color("#ff3653");
    var color2 = new THREE.Color("#8adb00");
    var color3 = new THREE.Color("#2c8fff");

    var interactiveObjects = [];
    var raycaster = new THREE.Raycaster();
    var mouse = new THREE.Vector2();
    var dummy = new THREE.Object3D();

    var orthoCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0, 4);
    orthoCamera.position.set(0, 0, 2);

    var geometry = new THREE.BoxGeometry(0.8, 0.05, 0.05).translate(0.4, 0, 0);

    function getAxisMaterial(color) {
      return new THREE.MeshBasicMaterial({ color: color, toneMapped: false });
    }

    function getSpriteMaterial(color, text) {
      var canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      var context = canvas.getContext("2d");
      context.beginPath();
      context.arc(32, 32, 16, 0, 2 * Math.PI);
      context.closePath();
      context.fillStyle = color.getStyle();
      context.fill();
      if (text != null) {
        context.font = "24px Arial";
        context.textAlign = "center";
        context.fillStyle = "#000000";
        context.fillText(text, 32, 41);
      }
      var texture = new THREE.CanvasTexture(canvas);
      return new THREE.SpriteMaterial({ map: texture, toneMapped: false });
    }

    var xAxis = new THREE.Mesh(geometry, getAxisMaterial(color1));
    var yAxis = new THREE.Mesh(geometry, getAxisMaterial(color2));
    var zAxis = new THREE.Mesh(geometry, getAxisMaterial(color3));
    yAxis.rotation.z = Math.PI / 2;
    zAxis.rotation.y = -Math.PI / 2;

    var group = new THREE.Object3D();
    group.add(xAxis);
    group.add(zAxis);
    group.add(yAxis);

    var posXAxisHelper = new THREE.Sprite(getSpriteMaterial(color1, "X"));
    posXAxisHelper.userData.type = "posX";
    var posYAxisHelper = new THREE.Sprite(getSpriteMaterial(color2, "Y"));
    posYAxisHelper.userData.type = "posY";
    var posZAxisHelper = new THREE.Sprite(getSpriteMaterial(color3, "Z"));
    posZAxisHelper.userData.type = "posZ";
    var negXAxisHelper = new THREE.Sprite(getSpriteMaterial(color1));
    negXAxisHelper.userData.type = "negX";
    var negYAxisHelper = new THREE.Sprite(getSpriteMaterial(color2));
    negYAxisHelper.userData.type = "negY";
    var negZAxisHelper = new THREE.Sprite(getSpriteMaterial(color3));
    negZAxisHelper.userData.type = "negZ";

    posXAxisHelper.position.x = 1;
    posYAxisHelper.position.y = 1;
    posZAxisHelper.position.z = 1;
    negXAxisHelper.position.x = -1;
    negXAxisHelper.scale.setScalar(0.8);
    negYAxisHelper.position.y = -1;
    negYAxisHelper.scale.setScalar(0.8);
    negZAxisHelper.position.z = -1;
    negZAxisHelper.scale.setScalar(0.8);

    group.add(posXAxisHelper);
    group.add(posYAxisHelper);
    group.add(posZAxisHelper);
    group.add(negXAxisHelper);
    group.add(negYAxisHelper);
    group.add(negZAxisHelper);

    interactiveObjects.push(
      posXAxisHelper,
      posYAxisHelper,
      posZAxisHelper,
      negXAxisHelper,
      negYAxisHelper,
      negZAxisHelper
    );

    var point = new THREE.Vector3();
    var viewport = new THREE.Vector4();
    var center = new THREE.Vector3();

    var animating = false;
    var targetPosition = new THREE.Vector3();
    var targetQuaternion = new THREE.Quaternion();
    var q1 = new THREE.Quaternion();
    var q2 = new THREE.Quaternion();
    var radius = 0;
    var turnRate = 2 * Math.PI;

    function prepareAnimationData(object) {
      var euler;
      switch (object.userData.type) {
        case "posX":
          targetPosition.set(1, 0, 0);
          euler = new THREE.Euler(0, Math.PI * 0.5, 0);
          targetQuaternion.setFromEuler(euler);
          break;
        case "posY":
          targetPosition.set(0, 1, 0);
          euler = new THREE.Euler(-Math.PI * 0.5, 0, 0);
          targetQuaternion.setFromEuler(euler);
          break;
        case "posZ":
          targetPosition.set(0, 0, 1);
          euler = new THREE.Euler();
          targetQuaternion.setFromEuler(euler);
          break;
        case "negX":
          targetPosition.set(-1, 0, 0);
          euler = new THREE.Euler(0, -Math.PI * 0.5, 0);
          targetQuaternion.setFromEuler(euler);
          break;
        case "negY":
          targetPosition.set(0, -1, 0);
          euler = new THREE.Euler(Math.PI * 0.5, 0, 0);
          targetQuaternion.setFromEuler(euler);
          break;
        case "negZ":
          targetPosition.set(0, 0, -1);
          euler = new THREE.Euler(0, Math.PI, 0);
          targetQuaternion.setFromEuler(euler);
          break;
        default:
          return;
      }
      radius = cam.position.distanceTo(center);
      targetPosition.multiplyScalar(radius).add(center);
      dummy.position.copy(center);
      dummy.lookAt(cam.position);
      q1.copy(dummy.quaternion);
      dummy.lookAt(targetPosition);
      q2.copy(dummy.quaternion);
    }

    function render(renderer) {
      var rg = getRootGroup();
      /* Same as ViewHelper when mesh is identity; multiply mesh quat so gizmo tracks model spin. */
      group.quaternion.copy(cam.quaternion).invert();
      if (rg) {
        group.quaternion.multiply(rg.quaternion);
      }
      group.updateMatrixWorld(true);

      point.set(0, 0, 1);
      point.applyQuaternion(cam.quaternion);

      if (point.x >= 0) {
        posXAxisHelper.material.opacity = 1;
        negXAxisHelper.material.opacity = 0.5;
      } else {
        posXAxisHelper.material.opacity = 0.5;
        negXAxisHelper.material.opacity = 1;
      }
      if (point.y >= 0) {
        posYAxisHelper.material.opacity = 1;
        negYAxisHelper.material.opacity = 0.5;
      } else {
        posYAxisHelper.material.opacity = 0.5;
        negYAxisHelper.material.opacity = 1;
      }
      if (point.z >= 0) {
        posZAxisHelper.material.opacity = 1;
        negZAxisHelper.material.opacity = 0.5;
      } else {
        posZAxisHelper.material.opacity = 0.5;
        negZAxisHelper.material.opacity = 1;
      }

      var x = domElement.offsetWidth - dim;
      renderer.clearDepth();
      renderer.getViewport(viewport);
      renderer.setViewport(x, 0, dim, dim);
      /* Second render() runs background + clear; without this the framebuffer is cleared to black and the main scene disappears (three.js forum: ViewHelper + autoClear). */
      var prevAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(group, orthoCamera);
      renderer.autoClear = prevAutoClear;
      renderer.setViewport(viewport.x, viewport.y, viewport.z, viewport.w);
    }

    function update(delta) {
      var step = delta * turnRate;
      q1.rotateTowards(q2, step);
      cam.position.set(0, 0, 1).applyQuaternion(q1).multiplyScalar(radius).add(center);
      cam.quaternion.rotateTowards(targetQuaternion, step);
      if (q1.angleTo(q2) === 0) {
        animating = false;
      }
    }

    function handleClick(event) {
      if (animating) return false;
      var rect = domElement.getBoundingClientRect();
      var offsetX = rect.left + (domElement.offsetWidth - dim);
      var offsetY = rect.top + (domElement.offsetHeight - dim);
      mouse.x = ((event.clientX - offsetX) / (rect.right - offsetX)) * 2 - 1;
      mouse.y = -((event.clientY - offsetY) / (rect.bottom - offsetY)) * 2 + 1;
      raycaster.setFromCamera(mouse, orthoCamera);
      var intersects = raycaster.intersectObjects(interactiveObjects);
      if (intersects.length > 0) {
        prepareAnimationData(intersects[0].object);
        animating = true;
        return true;
      }
      return false;
    }

    function dispose() {
      geometry.dispose();
      xAxis.material.dispose();
      yAxis.material.dispose();
      zAxis.material.dispose();
      [
        posXAxisHelper,
        posYAxisHelper,
        posZAxisHelper,
        negXAxisHelper,
        negYAxisHelper,
        negZAxisHelper,
      ].forEach(function (s) {
        if (s.material.map) s.material.map.dispose();
        s.material.dispose();
      });
    }

    return {
      group: group,
      center: center,
      get animating() {
        return animating;
      },
      set animating(v) {
        animating = v;
      },
      render: render,
      update: update,
      handleClick: handleClick,
      dispose: dispose,
      gizmoPixelSize: dim,
    };
  }

  function disposeObject3D(obj) {
    if (!obj) return;
    obj.traverse(function (child) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(function (m) {
            if (m && m.dispose) m.dispose();
          });
        } else if (child.material.dispose) {
          child.material.dispose();
        }
      }
    });
  }

  function stop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function makeGroundTexture(THREE) {
    var c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    var ctx = c.getContext("2d");
    var g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(48, 50, 58, 0.5)");
    g.addColorStop(0.45, "rgba(28, 30, 36, 0.18)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    var tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace !== undefined) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    return tex;
  }

  function unionBoundsOfMeshes(THREE, group) {
    var box = new THREE.Box3();
    var union = false;
    group.updateMatrixWorld(true);
    group.traverse(function (obj) {
      if (obj.userData && obj.userData.isWhmGround) return;
      if (!obj.isMesh) return;
      var b = new THREE.Box3().setFromObject(obj);
      if (!union) {
        box.copy(b);
        union = true;
      } else {
        box.union(b);
      }
    });
    return union ? box : null;
  }

  function fitCameraToGroup(THREE, cam, group, gmesh, viewMargin) {
    if (!cam || !THREE || !group) return;
    if (!group.children || group.children.length === 0) return;
    var box = unionBoundsOfMeshes(THREE, group);
    if (!box) return;
    var sphere = box.getBoundingSphere(new THREE.Sphere());
    group.position.sub(sphere.center);
    group.updateMatrixWorld(true);
    var box2 = unionBoundsOfMeshes(THREE, group);
    if (!box2) return sphere;
    var fov = (cam.fov * Math.PI) / 180;
    /* Larger viewMargin = farther camera (more padding). Main preview 1.4; grid thumbs tighter. */
    var margin = viewMargin != null ? viewMargin : 1.4;
    var dist = (sphere.radius / Math.sin(fov / 2)) * margin;
    cam.near = Math.max(0.001, dist / 2000);
    cam.far = dist * 50;
    cam.position.set(dist * WHM_DEFAULT_VIEW_DIR_X, dist * WHM_DEFAULT_VIEW_DIR_Y, dist * WHM_DEFAULT_VIEW_DIR_Z);
    cam.lookAt(0, 0, 0);
    if (gmesh) {
      var w = Math.max(box2.max.x - box2.min.x, box2.max.z - box2.min.z, sphere.radius * 2) * 2.2;
      gmesh.scale.set(w, w, 1);
      gmesh.updateMatrixWorld(true);
      group.updateMatrixWorld(true);
      /* Bottom face center of world AABB; small -Y so the plane sits just under the lowest vertices. */
      var worldBottom = new THREE.Vector3(
        (box2.min.x + box2.max.x) * 0.5,
        box2.min.y - 0.004,
        (box2.min.z + box2.max.z) * 0.5
      );
      group.worldToLocal(worldBottom);
      gmesh.position.copy(worldBottom);
    }
    return sphere;
  }

  function fitCamera(THREE, group) {
    fitCameraToGroup(THREE, camera, group, groundMesh);
  }

  function rebuildWhmMeshBySourceIndex(root) {
    whmMeshBySourceIndex = [];
    if (!root) return;
    root.traverse(function (o) {
      if (!o.isMesh || (o.userData && o.userData.isWhmGround)) return;
      var ix = o.userData && o.userData.whmSourceMeshIndex;
      if (ix == null || !isFinite(ix)) return;
      whmMeshBySourceIndex[ix] = o;
    });
  }

  function setHighlight(THREE, meshIndex) {
    selectedMeshIndex = meshIndex;
    if (!rootGroup) return;
    var pick = meshIndex >= 0 ? whmMeshBySourceIndex[meshIndex] : null;
    rootGroup.traverse(function (child) {
      if (!child.isMesh || (child.userData && child.userData.isWhmGround)) return;
      var mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(function (mat) {
        var base = mat.userData.baseColor;
        if (!base) return;
        if (pick && child === pick) {
          mat.color.copy(base).multiplyScalar(1.38);
        } else {
          mat.color.copy(base);
        }
      });
    });
  }

  function createMeshRow(THREE, meta, i) {
    var row = document.createElement("div");
    row.className = "preview-whm-mesh-row";
    row.dataset.meshIndex = String(i);
    var label = document.createElement("label");
    label.className = "preview-whm-mesh-vis";
    var vis = document.createElement("input");
    vis.type = "checkbox";
    vis.checked = true;
    vis.setAttribute("data-vis", String(i));
    vis.addEventListener("change", function () {
      var m = whmMeshBySourceIndex[i];
      if (m) m.visible = vis.checked;
    });
    label.appendChild(vis);
    var nameSpan = document.createElement("span");
    nameSpan.className = "preview-whm-mesh-name";
    nameSpan.textContent = meta.name;
    nameSpan.title = meta.name;
    nameSpan.addEventListener("click", function (e) {
      e.preventDefault();
      setHighlight(THREE, selectedMeshIndex === i ? -1 : i);
    });
    label.appendChild(nameSpan);
    var stats = document.createElement("div");
    stats.className = "preview-whm-mesh-stats";
    stats.textContent = meta.vertices + " v · " + meta.triangles + " tri";
    row.appendChild(label);
    row.appendChild(stats);
    return row;
  }

  function buildSidebar(THREE, sidebarEl, meshMetaList) {
    if (!sidebarEl) return;
    sidebarEl.innerHTML = "";
    if (!meshMetaList || meshMetaList.length === 0) {
      sidebarEl.hidden = true;
      return;
    }
    sidebarEl.hidden = false;
    meshMetaList.forEach(function (meta, i) {
      sidebarEl.appendChild(createMeshRow(THREE, meta, i));
    });
  }

  /** Apply toolbar “Display” mode (shaded vs wireframe); extend switch for future modes. */
  function applyDisplayModeFromSelect() {
    if (!rootGroup) return;
    var sel = document.getElementById("preview-whm-display-mode");
    var mode = sel && sel.value ? sel.value : "shaded";
    var wire = mode === "wireframe";
    rootGroup.traverse(function (obj) {
      if (obj.userData && obj.userData.isWhmGround) return;
      if (!obj.isMesh) return;
      var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (var mi = 0; mi < mats.length; mi++) {
        var mat = mats[mi];
        if (mat) mat.wireframe = wire;
      }
    });
  }

  function bindDisplayModeSelect() {
    unbindDisplayModeSelect();
    var sel = document.getElementById("preview-whm-display-mode");
    if (!sel) return;
    displaySelectHandler = function () {
      applyDisplayModeFromSelect();
    };
    sel.addEventListener("change", displaySelectHandler);
    sel.value = "shaded";
    applyDisplayModeFromSelect();
  }

  function unbindDisplayModeSelect() {
    var sel = document.getElementById("preview-whm-display-mode");
    if (sel && displaySelectHandler) {
      sel.removeEventListener("change", displaySelectHandler);
    }
    displaySelectHandler = null;
    if (sel) sel.value = "shaded";
  }

  /** Canvas matcap — no network; avoids CORS/offline black mesh when remote fails. */
  function makeProceduralMatcapTexture(THREE) {
    var c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    var ctx = c.getContext("2d");
    var base = ctx.createLinearGradient(0, 0, 128, 128);
    base.addColorStop(0, "#f0f0f8");
    base.addColorStop(0.5, "#9898a8");
    base.addColorStop(1, "#383848");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 128, 128);
    var hi = ctx.createRadialGradient(40, 36, 6, 64, 64, 72);
    hi.addColorStop(0, "rgba(255,255,255,0.85)");
    hi.addColorStop(0.35, "rgba(255,255,255,0)");
    hi.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = hi;
    ctx.fillRect(0, 0, 128, 128);
    var tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace !== undefined) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    return tex;
  }

  function lookupTextureForCatalog(textureMap, shaderName) {
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
   * Bitmap snapshot for the 2D texture tab (CPU-side only). Avoids drawImage() from canvases
   * that WebGL may have aliased or invalidated.
   * @param {HTMLCanvasElement} canvas
   * @returns {ImageData | null}
   */
  function snapshotPreviewForTextureTab(canvas) {
    if (!canvas || typeof canvas.width !== "number" || typeof canvas.height !== "number") {
      return null;
    }
    if (!(canvas.width > 0) || !(canvas.height > 0)) return null;
    var maxW = 4096;
    var maxH = 4096;
    if (canvas.width > maxW || canvas.height > maxH) return null;
    try {
      var cx = canvas.getContext("2d");
      if (!cx) return null;
      return cx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (e) {
      return null;
    }
  }

  /**
   * Ordered unique textures (by mesh / material group order) for the texture preview tab.
   * @param {typeof THREE} THREE
   * @param {object[]} meshes
   * @param {Record<string, THREE.Texture>} textureMap
   */
  function buildTextureCatalog(THREE, meshes, textureMap) {
    var out = [];
    var seen = {};
    if (!meshes || !textureMap) return out;
    meshes.forEach(function (m) {
      (m.materialGroups || []).forEach(function (g) {
        var sn = g.shaderName || "";
        var tex = lookupTextureForCatalog(textureMap, sn);
        if (!tex) return;
        var previewCanvas =
          tex.userData && tex.userData.sgaPreview2d
            ? tex.userData.sgaPreview2d
            : tex.source && tex.source.data != null
              ? tex.source.data
              : tex.image;
        if (!previewCanvas) return;
        var iw =
          typeof previewCanvas.width === "number"
            ? previewCanvas.width
            : previewCanvas.naturalWidth || previewCanvas.videoWidth || 0;
        if (!(iw > 0)) return;
        var id = tex.uuid;
        if (seen[id]) return;
        seen[id] = true;
        var snap =
          typeof previewCanvas.getContext === "function"
            ? snapshotPreviewForTextureTab(previewCanvas)
            : null;
        out.push({
          label: sn || "texture",
          texture: tex,
          previewCanvas: previewCanvas,
          previewImageData: snap,
        });
      });
    });
    return out;
  }

  /**
   * Copy a bitmap canvas before Three uploads it to WebGL. Some browsers will not allow a
   * reliable 2D drawImage() from the same canvas after it has been used as a WebGL texture,
   * which left the Texture tab showing only the checkerboard background.
   * @param {HTMLCanvasElement} src
   * @returns {HTMLCanvasElement}
   */
  function forkCanvasForSgaTexturePanel(src) {
    var c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    var cx = c.getContext("2d");
    if (cx) {
      try {
        cx.drawImage(src, 0, 0);
      } catch (e) {}
    }
    return c;
  }

  function shaderMapLookupPath(shaderMap, shaderName) {
    if (!shaderMap || !shaderName) return null;
    if (shaderMap[shaderName]) return shaderMap[shaderName];
    var low = shaderName.toLowerCase();
    if (shaderMap[low]) return shaderMap[low];
    for (var k in shaderMap) {
      if (k.toLowerCase() === low) return shaderMap[k];
    }
    return null;
  }

  /**
   * @param {typeof THREE} THREE
   * @param {object[]} meshes
   * @param {Record<string, string>} shaderMap
   * @param {function(string): Promise<Uint8Array | null>} resolveFile — logical path without .rsh
   * @returns {Promise<Record<string, THREE.Texture>>}
   */
  async function loadRshTexturesForMeshes(THREE, meshes, shaderMap, resolveFile) {
    var out = {};
    if (!resolveFile || typeof resolveFile !== "function" || !shaderMap) {
      return out;
    }
    var names = {};
    meshes.forEach(function (m) {
      (m.materialGroups || []).forEach(function (g) {
        if (g.shaderName) names[g.shaderName] = true;
      });
    });
    for (var shaderName in names) {
      var basePath = shaderMapLookupPath(shaderMap, shaderName);
      if (!basePath) continue;
      try {
        var rshBytes = await resolveFile(basePath);
        if (!rshBytes || !rshBytes.length) continue;
        if (typeof RSH === "undefined") continue;
        var texCanvas = null;
        if (typeof RSH.decodePreviewToCanvas === "function") {
          var rpv = RSH.decodePreviewToCanvas(rshBytes);
          if (rpv && rpv.ok && rpv.canvas) texCanvas = rpv.canvas;
        } else if (typeof RSH.extractDdsBytes === "function" && typeof DDS !== "undefined") {
          var ddsBytes = RSH.extractDdsBytes(rshBytes);
          if (ddsBytes && ddsBytes.length) {
            var dds = DDS.decodeToCanvas(ddsBytes);
            if (dds && dds.ok && dds.canvas) texCanvas = dds.canvas;
          }
        }
        if (!texCanvas) continue;
        var panelCanvas = forkCanvasForSgaTexturePanel(texCanvas);
        var tex = new THREE.CanvasTexture(texCanvas);
        tex.userData = tex.userData || {};
        tex.userData.sgaPreview2d = panelCanvas;
        if (THREE.SRGBColorSpace !== undefined) {
          tex.colorSpace = THREE.SRGBColorSpace;
        }
        /* Default true: flip on upload so mesh UVs in file/canvas space match the 3D sampling. */
        tex.flipY = true;
        /* Tile when UVs go outside [0,1] (wrap mode / repeating texture). */
        if (THREE.RepeatWrapping !== undefined) {
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
        }
        tex.needsUpdate = true;
        out[shaderName] = tex;
        out[shaderName.toLowerCase()] = tex;
      } catch (e) {}
    }
    return out;
  }

  function loadMatcapTexture(THREE) {
    return new Promise(function (resolve) {
      var loader = new THREE.TextureLoader();
      /* Cross-origin matcaps must be loaded with CORS or WebGL upload fails / renders black. */
      if (typeof loader.setCrossOrigin === "function") {
        loader.setCrossOrigin("anonymous");
      }
      loader.load(
        MATCAP_URL,
        function (tex) {
          if (THREE.SRGBColorSpace !== undefined) {
            tex.colorSpace = THREE.SRGBColorSpace;
          }
          resolve(tex);
        },
        undefined,
        function () {
          resolve(makeProceduralMatcapTexture(THREE));
        }
      );
    });
  }

  /** Shared matcap; clones per offscreen thumb so materials can be disposed independently. */
  var gridThumbMatcapBase = null;
  var gridThumbMatcapBasePromise = null;
  function getMatcapCloneForGridThumb(THREE) {
    if (!gridThumbMatcapBasePromise) {
      gridThumbMatcapBasePromise = loadMatcapTexture(THREE).then(function (tex) {
        gridThumbMatcapBase = tex;
        return tex;
      });
    }
    return gridThumbMatcapBasePromise.then(function (base) {
      return base.clone();
    });
  }

  /**
   * Offscreen WHM shot for file grid: same fit + yaw/pitch as the interactive preview after load.
   * @param {Uint8Array} u8
   * @param {function(string): Promise<Uint8Array | null> | null} resolveTextureFile — null = matcap only
   */
  async function renderWhmGridThumbnail(u8, resolveTextureFile) {
    var THREE = getTHREE();
    if (!THREE || typeof global.WHM === "undefined" || !u8 || !u8.byteLength) return null;
    var extracted = WHM.extractMeshes(u8);
    if (!extracted.ok) return null;

    var textureMap = {};
    if (typeof resolveTextureFile === "function") {
      textureMap = await loadRshTexturesForMeshes(
        THREE,
        extracted.meshes,
        extracted.shaderMap || {},
        resolveTextureFile
      );
    }

    var thumbMatcap = await getMatcapCloneForGridThumb(THREE);
    var sceneT = new THREE.Scene();
    sceneT.background = null;
    var thumbCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
    var rendererT = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    });
    patchWebGL2UnpackFor3DUploads(rendererT.getContext());
    rendererT.setPixelRatio(1);
    rendererT.setClearColor(0x000000, 0);
    if (THREE.SRGBColorSpace !== undefined) {
      rendererT.outputColorSpace = THREE.SRGBColorSpace;
    }
    rendererT.toneMapping = THREE.LinearToneMapping;
    rendererT.toneMappingExposure = 1;
    var pix = 256;
    rendererT.setSize(pix, pix, false);

    sceneT.add(new THREE.AmbientLight(0xffffff, 0.22));
    sceneT.add(new THREE.HemisphereLight(0xc8d0e0, 0x303038, 0.65));
    var dirT = new THREE.DirectionalLight(0xffffff, 0.95);
    dirT.position.set(4, 8, 5);
    sceneT.add(dirT);
    var fillT = new THREE.DirectionalLight(0xaabbdd, 0.35);
    fillT.position.set(-5, 2, -4);
    sceneT.add(fillT);

    var thumbRoot = WHM.buildThreeGroup(extracted.meshes, THREE, {
      matcapTexture: thumbMatcap,
      textureMap: textureMap,
    });

    /* Same framing margin as the interactive preview (1.4) — avoids thumbnail clipping. */
    fitCameraToGroup(THREE, thumbCamera, thumbRoot, null);
    thumbRoot.rotation.y = 0.35;
    thumbRoot.rotation.x = 0.15;
    thumbRoot.updateMatrixWorld(true);

    sceneT.add(thumbRoot);
    rendererT.render(sceneT, thumbCamera);
    var glCanvas = rendererT.domElement;
    var outCanvas = document.createElement("canvas");
    outCanvas.width = pix;
    outCanvas.height = pix;
    var octx = outCanvas.getContext("2d", { alpha: true });
    if (octx) {
      octx.clearRect(0, 0, pix, pix);
      octx.drawImage(glCanvas, 0, 0);
    }

    disposeObject3D(thumbRoot);
    try {
      thumbMatcap.dispose();
    } catch (e) {}
    rendererT.dispose();

    return outCanvas;
  }

  function tick() {
    var THREE = getTHREE();
    if (!renderer || !scene || !camera || !THREE) return;
    rafId = requestAnimationFrame(tick);
    var now = global.performance && performance.now ? performance.now() : Date.now();
    var dt;
    if (whmPreviewFpsGateLastMs == null) {
      whmPreviewFpsGateLastMs = now;
      dt = 1 / WHM_PREVIEW_FPS_CAP;
    } else {
      var elapsedMs = now - whmPreviewFpsGateLastMs;
      if (elapsedMs < WHM_PREVIEW_FRAME_MIN_MS) return;
      whmPreviewFpsGateLastMs = now;
      dt = elapsedMs / 1000;
    }
    if (dt > 0.05) dt = 0.05;
    if (rootGroup && turntableEnabled && !dragging && dt > 0) {
      rotY += dt * turntableRadPerSec;
    }
    if (rootGroup) {
      rootGroup.rotation.y = rotY;
      rootGroup.rotation.x = rotX;
    }
    var skelAnimActive =
      skelBoneObjs &&
      skelData &&
      typeof global.WHMSkelAnim !== "undefined" &&
      animClips.length > 0 &&
      animClipIndex >= 0 &&
      animClipIndex < animClips.length;
    if (skelAnimActive) {
      var clipNow = animClips[animClipIndex];
      var durClip = getClipDuration(clipNow);
      if (animPlaying) {
        var ddt = dt > 0 ? dt : 1 / 60;
        animTime += ddt * animSpeed;
        if (animLoop) {
          animTime = ((animTime % durClip) + durClip) % durClip;
        } else if (animTime >= durClip) {
          animTime = durClip;
          animPlaying = false;
          whmSetAnimPlayButtonPlaying(false);
        }
        var scrubLive = document.getElementById("preview-whm-anim-scrub");
        if (scrubLive) scrubLive.value = String(animTime);
      }
      WHMSkelAnim.applyClip(THREE, clipNow, animTime, animLoop, skelBoneObjs, skelData);
      var frameEl = document.getElementById("preview-whm-anim-frame");
      if (frameEl && typeof global.WHMSkelAnim.clipFrameState === "function") {
        var fs = global.WHMSkelAnim.clipFrameState(clipNow, animTime, animLoop);
        frameEl.textContent =
          fs.numFrames > 0 ? String(fs.frameIndex0 + 1) + " / " + String(fs.numFrames) : "—";
      }
    } else if (skelBoneObjs && skelData) {
      whmApplyBindPoseToBones(THREE);
      var frameElOff = document.getElementById("preview-whm-anim-frame");
      if (frameElOff) frameElOff.textContent = "—";
    }
    if (rootGroup) rootGroup.updateMatrixWorld(true);
    if (skelArmature) skelArmature.updateMatrixWorld(true);
    if (whmSharedSkeleton && typeof whmSharedSkeleton.update === "function") {
      whmSharedSkeleton.update();
    }
    updateSkelLines(THREE);
    renderer.render(scene, camera);
    if (viewHelper) {
      viewHelper.render(renderer);
    }
  }

  function onResize() {
    var THREE = getTHREE();
    if (!canvas || !camera || !renderer || !THREE) return;
    var w = canvas.clientWidth || 1;
    var h = canvas.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function dispose() {
    stop();
    unbindDisplayModeSelect();
    unbindSkelAnimControls();
    whmSharedSkeleton = null;
    turntableEnabled = false;
    whmPreviewFpsGateLastMs = null;
    selectedMeshIndex = -1;
    whmMeshBySourceIndex = [];
    textureCatalog = [];
    uvTrianglesByShader = {};
    if (sidebarRef) {
      sidebarRef.innerHTML = "";
      sidebarRef.hidden = true;
      sidebarRef = null;
    }
    if (matcapTexture) {
      try {
        matcapTexture.dispose();
      } catch (e) {}
      matcapTexture = null;
    }
    if (resizeObserver) {
      try {
        resizeObserver.disconnect();
      } catch (e) {}
      resizeObserver = null;
    }
    if (canvas) {
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("touchstart", onTouchStartStopTurntable);
      global.removeEventListener("mouseup", onUp);
      global.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", prevent);
    }
    if (boundResize) {
      global.removeEventListener("resize", boundResize);
      boundResize = null;
    }
    if (viewHelper) {
      try {
        viewHelper.dispose();
      } catch (e) {}
      viewHelper = null;
    }
    if (rootGroup) {
      disposeObject3D(rootGroup);
      if (scene) scene.remove(rootGroup);
      rootGroup = null;
    }
    groundMesh = null;
    if (renderer) {
      renderer.dispose();
      renderer = null;
    }
    scene = null;
    camera = null;
    canvas = null;
  }

  function prevent(e) {
    e.preventDefault();
  }

  function onTouchStartStopTurntable() {
    turntableEnabled = false;
  }

  function onDown(e) {
    turntableEnabled = false;
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var dim = viewHelper ? viewHelper.gizmoPixelSize : 128;
    if (x >= rect.width - dim && y >= rect.height - dim) {
      dragging = false;
      return;
    }
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function onUp() {
    dragging = false;
  }

  function onMove(e) {
    if (!dragging) return;
    var dx = e.clientX - lastX;
    var dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    rotY += dx * 0.01;
    rotX += dy * 0.008;
    rotX = Math.max(-1.2, Math.min(1.2, rotX));
  }

  function onWheel(e) {
    if (!camera) return;
    e.preventDefault();
    var d = e.deltaY > 0 ? 1.06 : 0.94;
    camera.position.multiplyScalar(d);
  }

  /**
   * @param {Uint8Array} u8
   * @param {HTMLCanvasElement} canvasEl
   * @param {HTMLElement | null} sidebarEl
   * @param {function(string): Promise<Uint8Array | null>} [resolveTextureFile] — texture path without .rsh, searched across loaded archives
   * @param {{
   *   wheBytes?: Uint8Array | null,
   *   whmLogicalPath?: string | null,
   * }} [options]
   */
  async function load(u8, canvasEl, sidebarEl, resolveTextureFile, options) {
    var THREE = getTHREE();
    if (!THREE || typeof global.WHM === "undefined") {
      return { ok: false, error: "THREE or WHM not loaded" };
    }
    dispose();
    canvas = canvasEl;
    sidebarRef = sidebarEl || null;
    var opts = options || {};
    var extracted = WHM.extractMeshes(u8);
    if (!extracted.ok) {
      return extracted;
    }

    var skelResult =
      typeof global.WHMSkelAnim !== "undefined"
        ? WHMSkelAnim.extractSkeleton(u8, null)
        : { ok: false, bones: [] };
    var animFromWhm =
      typeof global.WHMSkelAnim !== "undefined"
        ? WHMSkelAnim.extractAnimations(u8, null)
        : [];
    var animFromWhe = [];
    if (opts.wheBytes && opts.wheBytes.byteLength > 0 && typeof global.WHMSkelAnim !== "undefined") {
      animFromWhe = WHMSkelAnim.extractAnimations(opts.wheBytes, null);
    }
    var animClipList = animFromWhm.slice();
    var mi;
    for (mi = 0; mi < animFromWhe.length; mi++) animClipList.push(animFromWhe[mi]);

    uvTrianglesByShader = buildUvTrianglesByShader(extracted.meshes || []);

    var textureMap = await loadRshTexturesForMeshes(
      THREE,
      extracted.meshes,
      extracted.shaderMap || {},
      resolveTextureFile
    );

    textureCatalog = buildTextureCatalog(THREE, extracted.meshes, textureMap);

    matcapTexture = await loadMatcapTexture(THREE);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1c);

    camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    patchWebGL2UnpackFor3DUploads(renderer.getContext());
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    if (THREE.SRGBColorSpace !== undefined) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    /* ACES + default tone-mapped matcaps reads as black; Linear keeps Standard + matcap preview balanced. */
    renderer.toneMapping = THREE.LinearToneMapping;
    renderer.toneMappingExposure = 1;

    /* MeshMatcapMaterial ignores lights; Hemisphere + directional help MeshStandardMaterial fallback. */
    scene.add(new THREE.AmbientLight(0xffffff, 0.22));
    var hemi = new THREE.HemisphereLight(0xc8d0e0, 0x303038, 0.65);
    scene.add(hemi);
    var dir = new THREE.DirectionalLight(0xffffff, 0.95);
    dir.position.set(4, 8, 5);
    scene.add(dir);
    var fill = new THREE.DirectionalLight(0xaabbdd, 0.35);
    fill.position.set(-5, 2, -4);
    scene.add(fill);

    rootGroup = new THREE.Group();
    scene.add(rootGroup);

    if (skelResult.ok && skelResult.bones && skelResult.bones.length) {
      buildSkeletonVisualization(THREE, rootGroup, skelResult);
    }

    whmSharedSkeleton = null;
    if (skelBoneObjs && skelBoneObjs.length) {
      skelArmature.updateMatrixWorld(true);
      whmSharedSkeleton = new THREE.Skeleton(skelBoneObjs);
      whmSharedSkeleton.calculateInverses();
    }

    WHM.buildThreeGroup(extracted.meshes, THREE, {
      matcapTexture: matcapTexture,
      textureMap: textureMap,
      appendTo: rootGroup,
      skeleton: whmSharedSkeleton,
      skelBones: skelResult.ok && skelResult.bones ? skelResult.bones : null,
    });
    rebuildWhmMeshBySourceIndex(rootGroup);

    var groundTex = makeGroundTexture(THREE);
    var groundGeo = new THREE.PlaneGeometry(1, 1);
    var groundMat = new THREE.MeshBasicMaterial({
      map: groundTex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.userData.isWhmGround = true;
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.renderOrder = -1;
    rootGroup.add(groundMesh);

    fitCamera(THREE, rootGroup);

    viewHelper = createWhmViewHelper(THREE, camera, canvas, function () {
      return rootGroup;
    });
    viewHelper.center.set(0, 0, 0);

    rotY = 0.35;
    rotX = 0.15;
    turntableEnabled = true;

    var meshMetaList = extracted.meshes.map(function (m) {
      var verts = (m.positions.length / 3) | 0;
      var tris =
        m.triangleCount != null ? m.triangleCount : ((m.indices && m.indices.length) / 3) | 0;
      return {
        name: m.name || "mesh",
        vertices: verts,
        triangles: tris,
      };
    });
    buildSidebar(THREE, sidebarRef, meshMetaList);
    bindDisplayModeSelect();
    bindSkelAnimControls(THREE, skelResult, animClipList);

    onResize();
    boundResize = onResize;
    global.addEventListener("resize", boundResize);
    if (global.ResizeObserver && canvas.parentElement) {
      resizeObserver = new global.ResizeObserver(function () {
        onResize();
      });
      resizeObserver.observe(canvas.parentElement);
    }

    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("touchstart", onTouchStartStopTurntable, { passive: true });
    global.addEventListener("mouseup", onUp);
    global.addEventListener("mousemove", onMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", prevent);

    tick();
    return { ok: true };
  }

  global.WhmPreview = {
    load: load,
    dispose: dispose,
    resize: onResize,
    /** @param {Uint8Array} u8 @param {function(string): Promise<Uint8Array | null> | null} resolveTextureFile */
    renderGridThumbnail: function (u8, resolveTextureFile) {
      return renderWhmGridThumbnail(u8, resolveTextureFile);
    },
    /** @returns {{ label: string, texture: object, previewCanvas?: object, previewImageData?: ImageData | null }[]} */
    getTextureCatalog: function () {
      return textureCatalog.slice();
    },
    /** @param {string} shaderName — same as catalog / material group shader name */
    getUvTrianglesForShader: function (shaderName) {
      var s = String(shaderName || "");
      var low = s.toLowerCase();
      if (uvTrianglesByShader[low] && uvTrianglesByShader[low].length) {
        return uvTrianglesByShader[low];
      }
      if (uvTrianglesByShader[s] && uvTrianglesByShader[s].length) {
        return uvTrianglesByShader[s];
      }
      return [];
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
