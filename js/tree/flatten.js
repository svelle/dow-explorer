"use strict";

import { state } from "../state.js";

export function folderKey(si, fi) {
  return si + ":" + fi;
}

export function buildFolderParentMap(arch) {
  var parent = new Array(arch.folders.length);
  arch.sections.forEach(function (sec) {
    function walk(p, fi) {
      parent[fi] = p;
      SGA.childFolderIndices(arch, fi).forEach(function (c) {
        walk(fi, c);
      });
    }
    walk(-1, sec.rootFolder);
  });
  return parent;
}

/** Expand every section and every folder that has subfolders (default when opening an archive). */
export function expandAllTreeFolders(arch) {
  if (!arch || !arch.sections) return;
  arch.sections.forEach(function (sec) {
    state.expanded.add("s" + sec.index);
    var root = sec.rootFolder;
    if (root >= arch.folders.length) return;
    function walk(fi) {
      var kids = SGA.childFolderIndices(arch, fi);
      if (kids.length) {
        state.expanded.add(folderKey(sec.index, fi));
        kids.forEach(walk);
      }
    }
    walk(root);
  });
}

export function fuzzyMatchQuery(query, text) {
  if (!query) return true;
  if (!text) return false;
  var qi = 0;
  var q = query.toLowerCase();
  var t = text.toLowerCase();
  for (var ti = 0; ti < t.length && qi < q.length; ti++) {
    if (q[qi] === t[ti]) qi++;
  }
  return qi === q.length;
}

export function fuzzyHighlightRanges(query, text) {
  if (!query || !text) return [];
  var q = query.toLowerCase();
  var t = text.toLowerCase();
  var qi = 0;
  var start = -1;
  for (var ti = 0; ti < t.length && qi < q.length; ti++) {
    if (q[qi] === t[ti]) {
      if (start < 0) start = ti;
      qi++;
      if (qi === q.length) {
        return [[start, ti + 1]];
      }
    }
  }
  return [];
}

export function applyFilterAutoExpand(arch, entry, filter, intoSet) {
  if (!filter || !entry.folderParent) return;
  var q = filter.toLowerCase();
  var parent = entry.folderParent;
  arch.sections.forEach(function (sec) {
    var root = sec.rootFolder;
    var has = {};
    function dfs(fi) {
      var selfMatch = fuzzyMatchQuery(q, SGA.folderShortName(arch, fi));
      var kids = SGA.childFolderIndices(arch, fi);
      var any = false;
      for (var i = 0; i < kids.length; i++) {
        if (dfs(kids[i])) any = true;
      }
      has[fi] = selfMatch || any;
      return has[fi];
    }
    if (!dfs(root)) return;
    intoSet.add("s" + sec.index);
    function expandPathFrom(fi) {
      if (fi === root) return;
      var x = parent[fi];
      while (x !== root && x >= 0) {
        intoSet.add(folderKey(sec.index, x));
        x = parent[x];
      }
    }
    function dfs2(fi) {
      if (has[fi]) expandPathFrom(fi);
      SGA.childFolderIndices(arch, fi).forEach(dfs2);
    }
    dfs2(root);
  });
}

/**
 * Collapse a run of folders that each have no files and exactly one subfolder
 * into one chain ending at the first "interesting" folder (branch, files, or leaf).
 */
export function compressSingleChildChain(arch, startFi) {
  var chain = [startFi];
  var cur = startFi;
  while (true) {
    if (SGA.directFileCount(arch, cur) > 0) break;
    var kids = SGA.childFolderIndices(arch, cur);
    if (kids.length !== 1) break;
    cur = kids[0];
    chain.push(cur);
  }
  return chain;
}

export function treeFlatRowMatchesSelection(row, sel) {
  if (!sel || !row || row.sectionIndex !== sel.sectionIndex) return false;
  if (row.folderIndex === sel.folderIndex) return true;
  if (row.chainFolderIndices) {
    for (var i = 0; i < row.chainFolderIndices.length; i++) {
      if (row.chainFolderIndices[i] === sel.folderIndex) return true;
    }
  }
  return false;
}

export function buildTreeFlatRows(arch, entry, filter, effectiveExpanded) {
  var rows = [];
  if (!entry.folderParent) return rows;
  var q = (filter || "").trim();

  arch.sections.forEach(function (sec) {
    var rootFi = sec.rootFolder;
    if (rootFi >= arch.folders.length) return;
    var sectionKey = "s" + sec.index;
    var secLabel =
      (sec.alias && sec.alias.trim()) || (sec.name && sec.name.trim()) || "section " + sec.index;
    var sectionHasKids = SGA.childFolderIndices(arch, rootFi).length > 0;

    var hasMatch = {};
    if (q) {
      (function dfs(fi) {
        var selfMatch = fuzzyMatchQuery(q, SGA.folderShortName(arch, fi));
        var kids = SGA.childFolderIndices(arch, fi);
        var any = false;
        for (var i = 0; i < kids.length; i++) {
          if (dfs(kids[i])) any = true;
        }
        hasMatch[fi] = selfMatch || any;
        return hasMatch[fi];
      })(rootFi);
      if (!hasMatch[rootFi]) return;
    }

    var secHighlight = fuzzyHighlightRanges(q, secLabel);
    rows.push({
      kind: "section",
      sectionIndex: sec.index,
      folderIndex: rootFi,
      depth: 0,
      expandKey: sectionHasKids ? sectionKey : "",
      label: secLabel,
      shortName: secLabel,
      hasChildren: sectionHasKids,
      fileCount: SGA.directFileCount(arch, rootFi),
      highlights: secHighlight,
      isLeaf: !sectionHasKids,
    });

    if (!effectiveExpanded.has(sectionKey)) return;

    function walkChildren(folderIdx, depth) {
      var kids = SGA.childFolderIndices(arch, folderIdx);
      kids.forEach(function (childIdx) {
        if (q && !hasMatch[childIdx]) return;
        var chain = compressSingleChildChain(arch, childIdx);
        var tip = chain[chain.length - 1];
        var sub = SGA.childFolderIndices(arch, tip);
        var fk = sub.length ? folderKey(sec.index, tip) : "";
        var nameParts = chain.map(function (fi) {
          return SGA.folderShortName(arch, fi);
        });
        var combinedLabel = nameParts.join(" / ");
        var highlights = fuzzyHighlightRanges(q, combinedLabel);
        var tipFiles = SGA.directFileCount(arch, tip);
        rows.push({
          kind: "folder",
          sectionIndex: sec.index,
          folderIndex: tip,
          chainFolderIndices: chain.length > 1 ? chain : null,
          depth: depth,
          expandKey: sub.length ? fk : "",
          label: combinedLabel,
          shortName: combinedLabel,
          hasChildren: sub.length > 0,
          isLeaf: sub.length === 0,
          fileCount: tipFiles,
          highlights: highlights,
        });
        if (sub.length && effectiveExpanded.has(fk)) {
          walkChildren(tip, depth + 1);
        }
      });
    }
    walkChildren(rootFi, 1);
  });
  return rows;
}
