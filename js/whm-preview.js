/**
 * WebGL preview for .whm meshes (Three.js, classic script + global THREE).
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
  var lastFrameTime = 0;
  var resizeObserver = null;
  var matcapTexture = null;
  var selectedMeshIndex = -1;
  var sidebarRef = null;
  /** @type {{ label: string, texture: object }[]} */
  var textureCatalog = [];
  /** @type {Record<string, number[][]>} shader key (lower) → list of [u0,v0,u1,v1,u2,v2] */
  var uvTrianglesByShader = {};
  var displaySelectHandler = null;

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
    cam.position.set(dist * 0.55, dist * 0.35, dist * 0.75);
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

  function setHighlight(THREE, meshIndex) {
    selectedMeshIndex = meshIndex;
    if (!rootGroup) return;
    rootGroup.children.forEach(function (child, i) {
      if (!(child instanceof THREE.Mesh)) return;
      var mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(function (mat) {
        var base = mat.userData.baseColor;
        if (!base) return;
        if (i === meshIndex && meshIndex >= 0) {
          mat.color.copy(base).multiplyScalar(1.38);
        } else {
          mat.color.copy(base);
        }
      });
    });
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
        var m = rootGroup && rootGroup.children[i];
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
      sidebarEl.appendChild(row);
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
    var dt = lastFrameTime > 0 ? (now - lastFrameTime) / 1000 : 0;
    lastFrameTime = now;
    if (dt > 0.05) dt = 0.05;
    if (rootGroup && turntableEnabled && !dragging && dt > 0) {
      rotY += dt * turntableRadPerSec;
    }
    if (rootGroup) {
      rootGroup.rotation.y = rotY;
      rootGroup.rotation.x = rotX;
    }
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
    turntableEnabled = false;
    lastFrameTime = 0;
    selectedMeshIndex = -1;
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
   */
  async function load(u8, canvasEl, sidebarEl, resolveTextureFile) {
    var THREE = getTHREE();
    if (!THREE || typeof global.WHM === "undefined") {
      return { ok: false, error: "THREE or WHM not loaded" };
    }
    dispose();
    canvas = canvasEl;
    sidebarRef = sidebarEl || null;
    var extracted = WHM.extractMeshes(u8);
    if (!extracted.ok) {
      return extracted;
    }

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

    rootGroup = WHM.buildThreeGroup(extracted.meshes, THREE, {
      matcapTexture: matcapTexture,
      textureMap: textureMap,
    });
    scene.add(rootGroup);

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
    lastFrameTime = global.performance && performance.now ? performance.now() : Date.now();

    var meshMetaList = extracted.meshes.map(function (m) {
      var verts = (m.positions.length / 3) | 0;
      var tris =
        m.triangleCount != null ? m.triangleCount : ((m.indices && m.indices.length) / 3) | 0;
      return { name: m.name || "mesh", vertices: verts, triangles: tris };
    });
    buildSidebar(THREE, sidebarRef, meshMetaList);
    bindDisplayModeSelect();

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
