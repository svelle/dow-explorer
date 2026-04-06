/**
 * Bundled Three.js (ESM); exposes the same namespace as legacy three.min.js
 * so classic scripts (whm-preview.js, etc.) can keep using globalThis.THREE.
 */
import * as THREE from "three";

globalThis.THREE = THREE;
