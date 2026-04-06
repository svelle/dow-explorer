"use strict";

export var state = {
  archives: [],
  activeArchiveId: null,
  selection: null,
  selectedFileIndex: null,
  viewMode: "grid",
  expanded: new Set(),
  cachedPreview: null,
  previewImageObjectUrl: null,
  previewAudioObjectUrl: null,
  previewAudioSeekDragging: false,
  gridThumbObserver: null,
  gridThumbObjectUrls: [],
  lastTreeFlatRows: [],
  treeVirtualScrollPending: false,
  treeContextTarget: null,
  pathCrumbPopupClose: null,
  lastTreeEffectiveExpanded: new Set(),
};

export function getActiveArchive() {
  return state.archives.find(function (a) {
    return a.id === state.activeArchiveId;
  });
}
