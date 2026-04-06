"use strict";

import { $ } from "../util.js";

var THEME_PALETTE_KEY = "sga-browser-palette";
var THEME_APPEARANCE_KEY = "sga-browser-appearance";
var THEME_LEGACY_KEY = "sga-browser-theme";

function normalizeThemeId(raw) {
  if (raw == null || raw === "") return "noctis";
  var s = String(raw).toLowerCase().replace(/_/g, "-");
  if (s === "light" || s === "lumen") return "lumen";
  if (s === "dark" || s === "noctis") return "noctis";
  if (["necron", "necron-light", "ork", "ork-light"].indexOf(s) >= 0) return s;
  return "noctis";
}

export function resolveThemeId(palette, appearance) {
  var p = palette === "necron" || palette === "ork" ? palette : "mechanicus";
  var light = appearance === "light";
  if (p === "mechanicus") return light ? "lumen" : "noctis";
  if (p === "necron") return light ? "necron-light" : "necron";
  if (p === "ork") return light ? "ork-light" : "ork";
  return "noctis";
}

function migrateLegacyThemeKey() {
  try {
    var legacy = localStorage.getItem(THEME_LEGACY_KEY);
    var pal = localStorage.getItem(THEME_PALETTE_KEY);
    var app = localStorage.getItem(THEME_APPEARANCE_KEY);
    if (!legacy || pal || app) return;
    var map = {
      light: ["mechanicus", "light"],
      lumen: ["mechanicus", "light"],
      dark: ["mechanicus", "dark"],
      noctis: ["mechanicus", "dark"],
      necron: ["necron", "dark"],
      "necron-light": ["necron", "light"],
      ork: ["ork", "dark"],
      "ork-light": ["ork", "light"],
    };
    var pair = map[legacy];
    if (pair) {
      localStorage.setItem(THEME_PALETTE_KEY, pair[0]);
      localStorage.setItem(THEME_APPEARANCE_KEY, pair[1]);
    }
    localStorage.removeItem(THEME_LEGACY_KEY);
  } catch (e) {}
}

export function readPaletteAppearance() {
  migrateLegacyThemeKey();
  var palette = "mechanicus";
  var appearance = "dark";
  try {
    var p = localStorage.getItem(THEME_PALETTE_KEY);
    var a = localStorage.getItem(THEME_APPEARANCE_KEY);
    if (p === "mechanicus" || p === "necron" || p === "ork") palette = p;
    if (a === "light" || a === "dark") appearance = a;
  } catch (e) {}
  return { palette: palette, appearance: appearance };
}

function writePaletteAppearance(palette, appearance) {
  try {
    localStorage.setItem(THEME_PALETTE_KEY, palette);
    localStorage.setItem(THEME_APPEARANCE_KEY, appearance);
  } catch (e) {}
}

export function setDataThemeFromId(id) {
  var t = normalizeThemeId(id);
  var root = document.documentElement;
  if (t === "noctis") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
}

export function syncThemeControls() {
  var st = readPaletteAppearance();
  var palSel = $("theme-palette-select");
  if (palSel) palSel.value = st.palette;
  var appBtn = $("theme-appearance-toggle");
  if (appBtn) {
    var dark = st.appearance === "dark";
    appBtn.textContent = dark ? "☀" : "☾";
    appBtn.title = dark ? "Switch to light appearance" : "Switch to dark appearance";
    appBtn.setAttribute("aria-label", dark ? "Switch to light appearance" : "Switch to dark appearance");
  }
}

export function applyPaletteAppearance(palette, appearance) {
  if (palette !== "mechanicus" && palette !== "necron" && palette !== "ork") palette = "mechanicus";
  if (appearance !== "light" && appearance !== "dark") appearance = "dark";
  writePaletteAppearance(palette, appearance);
  setDataThemeFromId(resolveThemeId(palette, appearance));
  syncThemeControls();
}
