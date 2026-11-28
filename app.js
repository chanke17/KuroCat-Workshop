/* KuroCat Skin Workshop Interactive Studio Controller */
(function () {
  'use strict';

  const Spec = window.KuroSpec;
  const Renderer = window.KuroRenderer;
  const Analyzer = window.KuroPhotoAnalyzer;
  const DecoLib = window.KuroDecorations;
  const PixelLayers = window.KuroPixelLayers || null;

  // --- Application State ---
  let rawSkin = deepClone(Spec.EXTRA_PRESETS[0].spec); // Start with a charming tuxedo cat (or loaded template)
  if (!rawSkin.decorations) rawSkin.decorations = [];
  let resolvedSkin = Spec.resolveSkin(rawSkin);
  const animState = Renderer.createDefaultState();

  let currentPose = 'idle'; // optional API override; default 'idle' runs full live interactive mode
  let showWhiteOutline = false; // default OFF for clean canvas preview
  let kbTheme = 'classicMilk';
  let eyeTheme = 'neonChartreuse';
  let pointerTarget = { yaw: 0, pitch: 0, gazeX: 0, gazeY: 0, active: false };
  let editingRegionIdx = -1;
  let draggingHandle = null; // { anchorIdx, kind: 'main'|'in'|'out' }
  let selectedDecoIdx = -1;
  let draggingDeco = null; // { mode: 'move'|'scale'|'rotate', startPos, origOffsetX, origOffsetY, origScale, origRot, center, startDist, startAngle }
  let decoFilterCat = 'all';
  let lastRenderTransforms = { seatX: 184, seatY: 226, headCenter: { x: 184, y: 126 } };

  // Live interactive state (real keyboard typing, petting, hunting shake, scruff dragging, idle sleep)
  const pressedKeyCaps = new Map(); // KeyboardEvent.code -> KEYCAPS item
  const live = {
    lastActivity: performance.now(),
    lastKeyTime: 0,
    lastMouseClickTime: 0,
    huntEnergy: 0,
    petHead: 0,
    petBody: 0,
    lastClientX: 0,
    lastClientY: 0,
    lastClientTime: 0,
    draggingCat: null, // { pointerId, startClientX, startClientY, lastClientX, lastClientY, lastTime, downTime, engaged, startZone, startRegionIdx }
    dragOffsetX: 0,
    dragOffsetY: 0,
    dragVelX: 0,
    dragVelY: 0
  };

  // Photo state
  let photoImg = null;
  let photoCrop = { x: 0.12, y: 0.06, w: 0.76, h: 0.86 }; // normalized [0..1]
  let photoOpts = {
    sourceType: 'photo',
    colorCount: 3,
    smoothness: 1.0,
    tone: 'balanced',
    addTabby: 'auto',
    softColorpoint: true,
    includeNose: true,
    includePads: true,
    includeIris: true
  };
  let photoEyedropTarget = null; // null | 'iris' | 'body'
  let photoDragging = false;
  let photoDragStart = null;
  let photoFilename = '';
  // Framing: after an upload the user presses on the cat's nose and drags to the cheek edge ('nose' step);
  // that fixes where the face is and how big it is, which the colour analysis depends on.
  let framingStep = 'none'; // 'none' | 'nose' | 'framed'
  let faceGesture = null;   // { x, y, r } in photo-canvas pixels while the nose gesture is in progress

  // Pen tool (钢笔画分区) — see the "Pen Tool" section below
  let penSpace = 'head';
  let penMode = 'split';
  let penColor = '#FAF4EA';
  let penMirror = false;
  let penWidth = 2.2;
  let pen = null;          // active drawing session, null when the pen is off
  let penPreviewSkin = null; // resolved skin with the side / shape under the cursor added, for live preview

  // Blink & typing timers
  let nextBlinkAt = 2.6;
  let typingTimer = 0;

  // DOM References
  const catCanvas = document.getElementById('cat-canvas');
  const catCtx = catCanvas.getContext('2d');
  const canvasFrame = document.getElementById('canvas-frame');
  const skinNameInput = document.getElementById('skin-name');
  const skinAuthorInput = document.getElementById('skin-author');
  const validationPill = document.getElementById('validation-pill');
  const stageCoatBadge = document.getElementById('stage-coat-badge');
  const stageCard = canvasFrame ? canvasFrame.closest('.stage-card') : null;
  const stageColumn = canvasFrame ? canvasFrame.closest('.stage-column') : null;
  const editModeBanner = document.getElementById('btn-exit-region-edit') || { hidden: true };
  const decoBanner = document.getElementById('deco-banner');
  const toastEl = document.getElementById('toast');

  // Floating transparent desktop pet layout controller (active when workbench is in .mode-editing)
  const PET_LAYOUT_KEY = 'kurocat_floating_pet_v1';
  const defaultPetLayout = () => ({ x: null, y: null, width: 228, minimized: false });
  let petLayout = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PET_LAYOUT_KEY) || 'null');
      if (saved && typeof saved.width === 'number') {
        return {
          x: typeof saved.x === 'number' && isFinite(saved.x) ? saved.x : null,
          y: typeof saved.y === 'number' && isFinite(saved.y) ? saved.y : null,
          width: Spec.clamp(saved.width, 136, 480),
          minimized: Boolean(saved.minimized)
        };
      }
    } catch (_) {}
    return defaultPetLayout();
  })();

  function savePetLayout() {
    try { localStorage.setItem(PET_LAYOUT_KEY, JSON.stringify(petLayout)); } catch (_) {}
  }

  function isFloatingPetMode() {
    const wb = document.getElementById('workshop-view');
    return !!(wb && wb.classList.contains('mode-editing') && stageColumn);
  }

  function applyFloatingPetLayout() {
    if (!stageColumn) return;
    const isFloat = isFloatingPetMode();
    const toolbar = document.getElementById('floating-pet-toolbar');
    const resizeBtn = document.getElementById('btn-pet-resize');
    const bubble = document.getElementById('floating-pet-bubble');
    const settingsPop = document.getElementById('floating-pet-settings');
    const sizeValEl = document.getElementById('fpet-size-val');
    if (sizeValEl) sizeValEl.textContent = Math.round(petLayout.width) + 'px';

    if (!isFloat) {
      stageColumn.classList.remove('is-minimized', 'is-floating-active');
      stageColumn.style.width = '';
      stageColumn.style.left = '';
      stageColumn.style.top = '';
      stageColumn.style.right = '';
      stageColumn.style.bottom = '';
      if (toolbar) toolbar.hidden = true;
      if (resizeBtn) resizeBtn.hidden = true;
      if (bubble) bubble.hidden = true;
      if (settingsPop) settingsPop.hidden = true;
      return;
    }

    if (toolbar) toolbar.hidden = false;
    if (resizeBtn) resizeBtn.hidden = false;
    stageColumn.classList.toggle('is-minimized', !!petLayout.minimized);
    if (bubble) bubble.hidden = !petLayout.minimized;

    const w = Spec.clamp(Math.round(petLayout.width), 136, 480);
    const h = Math.round((w * 320) / 360);
    stageColumn.style.width = w + 'px';
    if (typeof petLayout.x === 'number' && typeof petLayout.y === 'number') {
      const clampedX = Spec.clamp(petLayout.x, 8, Math.max(8, window.innerWidth - w - 8));
      const clampedY = Spec.clamp(petLayout.y, 38, Math.max(38, window.innerHeight - h - 8));
      petLayout.x = clampedX;
      petLayout.y = clampedY;
      stageColumn.style.left = clampedX + 'px';
      stageColumn.style.top = clampedY + 'px';
      stageColumn.style.right = 'auto';
      stageColumn.style.bottom = 'auto';
    } else {
      stageColumn.style.left = '';
      stageColumn.style.top = '';
      stageColumn.style.right = '22px';
      stageColumn.style.bottom = '18px';
    }
  }

  const photoCanvas = document.getElementById('photo-canvas');
  const photoCtx = photoCanvas.getContext('2d');
  const photoDropzone = document.getElementById('photo-dropzone');
  const photoFileInput = document.getElementById('photo-file-input');

  function deepClone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  let toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  // --- Core Sync ---
  function syncSkin(skipInputs, syncOpts) {
    const fastPaint = !!(syncOpts && syncOpts.fastPaint);
    if (!skipInputs) {
      skinNameInput.value = rawSkin.name || '';
      skinAuthorInput.value = rawSkin.author || '';
    }
    if (!rawSkin.decorations) rawSkin.decorations = [];
    if (selectedDecoIdx >= rawSkin.decorations.length) selectedDecoIdx = -1;
    resolvedSkin = Spec.resolveSkin(rawSkin);
    if (PixelLayers) PixelLayers.attachToResolvedSkin(resolvedSkin);
    Renderer.preloadDecorations(resolvedSkin.decorations);

    if (!fastPaint) {
      let exportObj = Spec.sanitizeForExport(rawSkin);
      if (PixelLayers) exportObj = PixelLayers.applyToExportObject(exportObj);
      const check = Spec.validateRawSkin(exportObj);
      const jsonStr = JSON.stringify(exportObj, null, 2);
      const kb = (new Blob([jsonStr]).size / 1024).toFixed(1);

      if (check.ok) {
        const req = Spec.requiredAppVersion(exportObj);
        if (req.webOnly.length) {
          validationPill.className = 'validation-pill warn';
          validationPill.textContent = `⚠ 桌宠暂不支持「${req.webOnly.join('、')}」造型 · ${kb} KB`;
          validationPill.title = '这个造型目前只有网页能画，导进桌宠会显示成普通小猫';
        } else {
          validationPill.className = 'validation-pill ok';
          validationPill.textContent = `✓ 桌宠 ${req.version}+ 可用 · ${kb} KB`;
          validationPill.title = req.reasons.length
            ? `需要 KuroCat ${req.version} 或更新版本：${[...new Set(req.reasons.filter((r) => r.version === req.version).map((r) => r.what))].join('、')}`
            : '所有支持皮肤的 KuroCat 版本（1.4.0 起）都能用';
        }
      } else {
        validationPill.className = 'validation-pill err';
        validationPill.textContent = `✕ ${check.error}`;
        validationPill.title = check.error;
      }

      const jsonPre = document.getElementById('json-preview');
      if (jsonPre) jsonPre.textContent = jsonStr;
      const jsonNote = document.getElementById('json-size-note');
      if (jsonNote) jsonNote.textContent = `${kb} KB（导出时将附带 preview 缩略图）`;

      renderTurnCheck();
      renderPaletteUI();
      renderShapeUI();
      renderDecorationsUI();
      scheduleHistory();
      if (PixelLayers) PixelLayers.scheduleSave();
    }
    if (window.KuroExplodedStudio && typeof window.KuroExplodedStudio.onSkinSynced === 'function') {
      window.KuroExplodedStudio.onSkinSynced(syncOpts);
    }
    updateHistoryButtons();
  }

  function updateSkullBanner() {}

  // --- Undo / Redo: unified pixel layer deltas + rawSkin metadata history ---
  const history = { undo: [], redo: [], current: null, timer: null, restoring: false };

  function updateHistoryButtons() {
    const canU = (PixelLayers && PixelLayers.canUndo()) || history.undo.length > 0;
    const canR = (PixelLayers && PixelLayers.canRedo()) || history.redo.length > 0;
    const btnU = document.getElementById('btn-undo');
    const btnR = document.getElementById('btn-redo');
    if (btnU) btnU.disabled = !canU;
    if (btnR) btnR.disabled = !canR;
  }

  function commitHistoryNow() {
    clearTimeout(history.timer);
    history.timer = null;
    const now = JSON.stringify(rawSkin);
    if (history.current === null || now === history.current) {
      history.current = now;
      return;
    }
    history.undo.push(history.current);
    if (history.undo.length > 80) history.undo.shift();
    history.current = now;
    history.redo = [];
    updateHistoryButtons();
  }

  function scheduleHistory() {
    if (history.restoring) return;
    clearTimeout(history.timer);
    history.timer = setTimeout(commitHistoryNow, 350);
  }

  function restoreHistory(json) {
    history.restoring = true;
    rawSkin = JSON.parse(json);
    if (!rawSkin.decorations) rawSkin.decorations = [];
    editingRegionIdx = -1;
    selectedDecoIdx = -1;
    editModeBanner.hidden = true;
    decoBanner.hidden = true;
    syncSkin();
    history.restoring = false;
    updateHistoryButtons();
  }

  function undo() {
    if (PixelLayers && PixelLayers.undo()) {
      syncSkin(true);
      showToast('已撤销画布操作');
      return;
    }
    commitHistoryNow();
    if (!history.undo.length) return;
    history.redo.push(history.current);
    history.current = history.undo.pop();
    restoreHistory(history.current);
    showToast('已撤销');
  }

  function redo() {
    if (PixelLayers && PixelLayers.redo()) {
      syncSkin(true);
      showToast('已重做画布操作');
      return;
    }
    commitHistoryNow();
    if (!history.redo.length) return;
    history.undo.push(history.current);
    history.current = history.redo.pop();
    restoreHistory(history.current);
    showToast('已重做');
  }

  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);

  // --- Top Bar & Export / Import ---
  skinNameInput.addEventListener('input', () => {
    rawSkin.name = skinNameInput.value.slice(0, 40);
    syncSkin(true);
  });

  skinAuthorInput.addEventListener('input', () => {
    rawSkin.author = skinAuthorInput.value.slice(0, 40);
    syncSkin(true);
  });

  function buildExportObjectWithPreview() {
    const previewB64 = Renderer.renderPreviewBase64(resolvedSkin, kbTheme, eyeTheme);
    let exportObj = Spec.sanitizeForExport(rawSkin, previewB64);
    if (PixelLayers) exportObj = PixelLayers.applyToExportObject(exportObj);
    return exportObj;
  }

  document.getElementById('btn-export').addEventListener('click', () => {
    const exportObj = buildExportObjectWithPreview();
    const check = Spec.validateRawSkin(exportObj);
    if (!check.ok) {
      showToast('导出失败：' + check.error);
      return;
    }
    const jsonText = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
    const safeName = (exportObj.name || 'kurocat-skin').replace(/[\\/:*?"<>|]/g, '_');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.kurocat`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`已导出 ${safeName}.kurocat（v${Spec.requiredAppVersion(exportObj).version}+ 兼容），可直接拖进桌宠！`);
  });

  function loadAndRasterizeSkin(parsed, badgeText, toastText) {
    rawSkin = parsed;
    if (!rawSkin.regions) rawSkin.regions = [];
    if (!rawSkin.marks) rawSkin.marks = [];
    if (!rawSkin.decorations) rawSkin.decorations = [];
    if (!rawSkin.shape) rawSkin.shape = { build: 'standard' };
    Spec.migrateSkullToHead(rawSkin);
    editingRegionIdx = -1;
    selectedDecoIdx = -1;
    editModeBanner.hidden = true;
    decoBanner.hidden = true;
    if (stageCoatBadge && badgeText) stageCoatBadge.textContent = badgeText;
    if (PixelLayers) {
      const done = PixelLayers.rasterizeFromSkin(rawSkin, Spec.resolveSkin(rawSkin), eyeTheme, true);
      if (done && typeof done.then === 'function') {
        done.then(() => {
          syncSkin();
          commitHistoryNow();
          PixelLayers.scheduleSave();
        });
      } else {
        PixelLayers.scheduleSave();
      }
    }
    syncSkin();
    commitHistoryNow();
    if (toastText) showToast(toastText);
  }

  document.getElementById('import-kurocat-input').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const check = Spec.validateRawSkin(parsed);
        if (!check.ok) {
          showToast('导入失败：' + check.error);
          return;
        }
        loadAndRasterizeSkin(parsed, '已导入皮肤', `已载入皮肤「${parsed.name}」并自动光栅化为透明纸图层`);
      } catch (err) {
        showToast('不是有效的 .kurocat JSON 文件');
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  });

  // Layered source project export / import (.kurocat-layers.json)
  const btnExportProject = document.getElementById('btn-export-project');
  if (btnExportProject && PixelLayers) {
    btnExportProject.addEventListener('click', () => {
      const proj = PixelLayers.serializeProject(rawSkin);
      const blob = new Blob([JSON.stringify(proj)], { type: 'application/json;charset=utf-8' });
      const safeName = (rawSkin.name || 'kurocat-project').replace(/[\\/:*?"<>|]/g, '_');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.kurocat-layers.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`已导出多层原稿 ${safeName}.kurocat-layers.json`);
    });
  }

  const importProjectInput = document.getElementById('import-project-input');
  if (importProjectInput && PixelLayers) {
    importProjectInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          if (!parsed || !parsed.parts) {
            showToast('导入失败：这不是有效的 .kurocat-layers.json 多层原稿文件');
            return;
          }
          if (parsed.skin && Spec.validateRawSkin(parsed.skin).ok) {
            rawSkin = parsed.skin;
            if (!rawSkin.decorations) rawSkin.decorations = [];
            if (!rawSkin.shape) rawSkin.shape = { build: 'standard' };
          }
          await PixelLayers.restoreProject(parsed);
          syncSkin();
          commitHistoryNow();
          PixelLayers.scheduleSave();
          showToast(`已导入多层原稿「${rawSkin.name || '皮肤工程'}」（保留全部分层与蒙版）`);
        } catch (_) {
          showToast('导入多层原稿失败：文件解析出错');
        }
      };
      reader.readAsText(file, 'utf-8');
      e.target.value = '';
    });
  }

  document.getElementById('btn-snapshot').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `${(rawSkin.name || 'kurocat').replace(/[\\/:*?"<>|]/g, '_')}-preview.png`;
    link.href = catCanvas.toDataURL('image/png');
    link.click();
    showToast('已保存当前高清预览图 PNG');
  });

  // --- Tabs ---
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${target}`));
    });
  });

  // --- Stage Controls ---
  document.querySelectorAll('.backdrop-pills .chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.backdrop-pills .chip').forEach((b) => b.classList.toggle('active', b === btn));
      canvasFrame.className = `canvas-frame bg-${btn.dataset.bg}`;
    });
  });

  document.getElementById('keyboard-theme-select').addEventListener('change', (e) => {
    kbTheme = e.target.value;
  });

  document.getElementById('eye-theme-select').addEventListener('change', (e) => {
    eyeTheme = e.target.value;
  });

  function enterRegionEdit() {}
  function exitRegionEdit() {}

  document.getElementById('btn-exit-deco-edit').addEventListener('click', () => {
    selectedDecoIdx = -1;
    decoBanner.hidden = true;
    renderDecorationsUI();
  });

  function pointInPolygon(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < ((xj - xi) * (pt.y - yi)) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function hitTestRegion(pos) {
    const regs = resolvedSkin.regions || [];
    const T = lastRenderTransforms;
    for (let i = regs.length - 1; i >= 0; i--) {
      if (!rawSkin.regions[i] || !regs[i].flat || regs[i].flat.length < 3) continue;
      const space = regs[i].space;
      const poly = regs[i].flat.map((pt) =>
        Renderer.mapPointToCanvas(pt, space, resolvedSkin, T.seatX, T.seatY, T.headCenter, animState)
      );
      if (pointInPolygon(pos, poly)) return i;
    }
    return -1;
  }

  function isWorkshopVisible() {
    const view = document.getElementById('workshop-view');
    const playModal = document.getElementById('play-modal');
    if (view && view.hidden) return false;
    if (playModal && !playModal.hidden) return false;
    return true;
  }

  function setCatDragClasses(active) {
    canvasFrame.classList.toggle('is-dragging-cat', active);
    if (stageCard) stageCard.classList.toggle('is-dragging-cat', active);
    if (stageColumn) stageColumn.classList.toggle('is-dragging-cat', active);
    catCanvas.classList.toggle('cat-dragging', active);
  }

  function hitTestDecoration(pos, deco) {
    const T = lastRenderTransforms;
    const g = Renderer.getDecorationOverlayGeometry(deco, resolvedSkin, T.seatX, T.seatY, T.headCenter, animState, T.decoAnchors);
    if (g.hidden) return false;
    const dx = pos.x - g.center.x, dy = pos.y - g.center.y;
    const c = Math.cos(-g.rot), s = Math.sin(-g.rot);
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    return Math.abs(lx) <= g.hw + 4 && Math.abs(ly) <= g.hh + 4;
  }

  // --- Interactive Cat Canvas (Mouse Tracking + Click Typing + Region Handle Dragging) ---
  function getCanvasLogicalPos(evt) {
    const rect = catCanvas.getBoundingClientRect();
    return {
      x: ((evt.clientX - rect.left) / rect.width) * 360,
      y: ((evt.clientY - rect.top) / rect.height) * 320
    };
  }

  catCanvas.addEventListener('contextmenu', (e) => {
    if (!pen && editingRegionIdx < 0 && !draggingDeco) {
      e.preventDefault();
    }
  });

  catCanvas.addEventListener('pointerdown', (e) => {
    const pos = getCanvasLogicalPos(e);
    live.lastActivity = performance.now();
    if (window.KuroExplodedStudio && window.KuroExplodedStudio.handleLiveCanvasPointerDown(pos, lastRenderTransforms, animState)) {
      catCanvas.setPointerCapture(e.pointerId);
      return;
    }
    if (pen) {
      penPointerDown(e, pos);
      return;
    }
    if (editingRegionIdx >= 0 && rawSkin.regions[editingRegionIdx]) {
      const reg = rawSkin.regions[editingRegionIdx];
      const map = (pt) => Renderer.mapPointToCanvas(
        pt, reg.space, resolvedSkin,
        lastRenderTransforms.seatX, lastRenderTransforms.seatY,
        lastRenderTransforms.headCenter, animState
      );
      for (let i = 0; i < reg.anchors.length; i++) {
        const a = reg.anchors[i];
        const pMain = map(a);
        if (Math.hypot(pos.x - pMain.x, pos.y - pMain.y) < 10) {
          draggingHandle = { anchorIdx: i, kind: 'main' };
          catCanvas.setPointerCapture(e.pointerId);
          return;
        }
        const pIn = map({ x: a.inX !== undefined ? a.inX : a.x, y: a.inY !== undefined ? a.inY : a.y });
        if (Math.hypot(pos.x - pIn.x, pos.y - pIn.y) < 8) {
          draggingHandle = { anchorIdx: i, kind: 'in' };
          catCanvas.setPointerCapture(e.pointerId);
          return;
        }
        const pOut = map({ x: a.outX !== undefined ? a.outX : a.x, y: a.outY !== undefined ? a.outY : a.y });
        if (Math.hypot(pos.x - pOut.x, pos.y - pOut.y) < 8) {
          draggingHandle = { anchorIdx: i, kind: 'out' };
          catCanvas.setPointerCapture(e.pointerId);
          return;
        }
      }
      // Clicking another pattern region switches editing to it; clicking empty space confirms & exits editing!
      const hitReg = hitTestRegion(pos);
      if (hitReg >= 0 && hitReg !== editingRegionIdx) {
        enterRegionEdit(hitReg);
      } else if (hitReg < 0) {
        exitRegionEdit();
      }
      return;
    }

    // Decoration direct canvas manipulation (handles + body drag when selected or on Decorations tab)
    const decos = resolvedSkin.decorations || [];
    if (selectedDecoIdx >= 0 && decos[selectedDecoIdx] && rawSkin.decorations[selectedDecoIdx]) {
      const T = lastRenderTransforms;
      const g = Renderer.getDecorationOverlayGeometry(decos[selectedDecoIdx], resolvedSkin, T.seatX, T.seatY, T.headCenter, animState, T.decoAnchors);
      const rawD = rawSkin.decorations[selectedDecoIdx];
      if (!g.hidden && Math.hypot(pos.x - g.rotateHandle.x, pos.y - g.rotateHandle.y) < 10) {
        draggingDeco = {
          mode: 'rotate',
          center: g.center,
          origRot: rawD.rotation || 0,
          startAngle: Math.atan2(pos.y - g.center.y, pos.x - g.center.x)
        };
        catCanvas.setPointerCapture(e.pointerId);
        return;
      }
      if (!g.hidden && Math.hypot(pos.x - g.scaleHandle.x, pos.y - g.scaleHandle.y) < 10) {
        draggingDeco = {
          mode: 'scale',
          center: g.center,
          origScale: rawD.scale || 1,
          startDist: Math.max(8, Math.hypot(pos.x - g.center.x, pos.y - g.center.y))
        };
        catCanvas.setPointerCapture(e.pointerId);
        return;
      }
      if (hitTestDecoration(pos, decos[selectedDecoIdx])) {
        draggingDeco = {
          mode: 'move',
          startPos: pos,
          origOffsetX: rawD.offsetX || 0,
          origOffsetY: rawD.offsetY || 0,
          baseRot: g.baseRot || 0,
          offsetScaleX: g.offsetScaleX || 1,
          offsetScaleY: g.offsetScaleY || 1
        };
        catCanvas.setPointerCapture(e.pointerId);
        return;
      }
      // Clicking outside the selected decoration confirms & exits decoration fine-tuning
      selectedDecoIdx = -1;
      decoBanner.hidden = true;
      renderDecorationsUI();
    }

    const decoTabEl = document.getElementById('tab-decorations');
    const onDecoTab = decoTabEl && decoTabEl.classList.contains('active');
    if (onDecoTab) {
      const T = lastRenderTransforms;
      const layerGroups = [['face', 'headTop'], ['neck'], ['tailTip']];
      for (const group of layerGroups) {
        for (let i = decos.length - 1; i >= 0; i--) {
          if (!group.includes(decos[i].anchor)) continue;
          if (hitTestDecoration(pos, decos[i]) && rawSkin.decorations[i]) {
            selectedDecoIdx = i;
            decoBanner.hidden = false;
            const rawD = rawSkin.decorations[i];
            const g = Renderer.getDecorationOverlayGeometry(decos[i], resolvedSkin, T.seatX, T.seatY, T.headCenter, animState, T.decoAnchors);
            draggingDeco = {
              mode: 'move',
              startPos: pos,
              origOffsetX: rawD.offsetX || 0,
              origOffsetY: rawD.offsetY || 0,
              baseRot: g.baseRot || 0,
              offsetScaleX: g.offsetScaleX || 1,
              offsetScaleY: g.offsetScaleY || 1
            };
            renderDecorationsUI();
            catCanvas.setPointerCapture(e.pointerId);
            return;
          }
        }
      }
    }

    const activeSkinNow = penPreviewSkin || resolvedSkin;
    const zone = Renderer.hitTestCat(pos, activeSkinNow, animState);

    // Right click -> RMB mouse click preview
    if (e.button === 2) {
      Renderer.triggerMouseClick(animState, activeSkinNow, true);
      live.lastMouseClickTime = performance.now();
      return;
    }

    if (zone === 'mouse') {
      Renderer.triggerMouseClick(animState, activeSkinNow, false);
      live.lastMouseClickTime = performance.now();
      return;
    }

    if (zone === 'keyboard') {
      const cap = Renderer.findNearestKeycap(pos, activeSkinNow);
      Renderer.triggerKeyTap(animState, activeSkinNow, cap);
      live.lastKeyTime = performance.now();
      catCanvas.focus({ preventScroll: true });
      return;
    }

    if (zone === 'head' || zone === 'body') {
      live.draggingCat = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        lastTime: performance.now(),
        downTime: performance.now(),
        engaged: false,
        startZone: zone
      };
      catCanvas.setPointerCapture(e.pointerId);
      catCanvas.focus({ preventScroll: true });
      return;
    }

    // Clicking empty background focuses canvas for easy keyboard testing
    catCanvas.focus({ preventScroll: true });
  });

  catCanvas.addEventListener('pointermove', (e) => {
    const pos = getCanvasLogicalPos(e);
    if (window.KuroExplodedStudio && window.KuroExplodedStudio.isSkeletonMode()) {
      const hitSkel = window.KuroExplodedStudio.handleLiveCanvasPointerMove(pos, lastRenderTransforms, animState);
      catCanvas.style.cursor = hitSkel ? 'grab' : 'default';
      return;
    }
    if (pen) {
      penPointerMove(pos);
      return;
    }
    if (draggingHandle && editingRegionIdx >= 0 && rawSkin.regions[editingRegionIdx]) {
      const reg = rawSkin.regions[editingRegionIdx];
      const a = reg.anchors[draggingHandle.anchorIdx];
      const sp = Renderer.mapCanvasToSpace(
        pos, reg.space, resolvedSkin,
        lastRenderTransforms.seatX, lastRenderTransforms.seatY,
        lastRenderTransforms.headCenter, animState
      );
      if (draggingHandle.kind === 'main') {
        const dx = sp.x - a.x, dy = sp.y - a.y;
        a.x = Spec.round2(Spec.clamp(sp.x, -400, 400));
        a.y = Spec.round2(Spec.clamp(sp.y, -400, 400));
        if (a.inX !== undefined) { a.inX = Spec.round2(a.inX + dx); a.inY = Spec.round2(a.inY + dy); }
        if (a.outX !== undefined) { a.outX = Spec.round2(a.outX + dx); a.outY = Spec.round2(a.outY + dy); }
      } else if (draggingHandle.kind === 'in') {
        a.inX = Spec.round2(Spec.clamp(sp.x, -400, 400));
        a.inY = Spec.round2(Spec.clamp(sp.y, -400, 400));
      } else if (draggingHandle.kind === 'out') {
        a.outX = Spec.round2(Spec.clamp(sp.x, -400, 400));
        a.outY = Spec.round2(Spec.clamp(sp.y, -400, 400));
      }
      if (reg._twin) {
        const twin = rawSkin.regions.find((o) => o !== reg && o._twin === reg._twin);
        if (twin) twin.anchors = Spec.mirrorRegion(reg).anchors;
      }
      resolvedSkin = Spec.resolveSkin(rawSkin);
      return;
    }

    if (draggingDeco && selectedDecoIdx >= 0 && rawSkin.decorations[selectedDecoIdx]) {
      const rawD = rawSkin.decorations[selectedDecoIdx];
      if (draggingDeco.mode === 'move') {
        const sdx = pos.x - draggingDeco.startPos.x;
        const sdy = pos.y - draggingDeco.startPos.y;
        const c = Math.cos(-(draggingDeco.baseRot || 0));
        const s = Math.sin(-(draggingDeco.baseRot || 0));
        const ldx = sdx * c - sdy * s;
        const ldy = sdx * s + sdy * c;
        const osx = Math.max(0.2, draggingDeco.offsetScaleX || 1);
        const osy = Math.max(0.2, draggingDeco.offsetScaleY || 1);
        rawD.offsetX = Spec.round2(Spec.clamp(draggingDeco.origOffsetX + ldx / osx, -120, 120));
        rawD.offsetY = Spec.round2(Spec.clamp(draggingDeco.origOffsetY + ldy / osy, -120, 120));
      } else if (draggingDeco.mode === 'scale') {
        const curDist = Math.max(4, Math.hypot(pos.x - draggingDeco.center.x, pos.y - draggingDeco.center.y));
        rawD.scale = Spec.round2(Spec.clamp(draggingDeco.origScale * (curDist / draggingDeco.startDist), 0.15, 3.0));
      } else if (draggingDeco.mode === 'rotate') {
        const ang = Math.atan2(pos.y - draggingDeco.center.y, pos.x - draggingDeco.center.x);
        let deg = draggingDeco.origRot + ((ang - draggingDeco.startAngle) * 180) / Math.PI;
        while (deg > 180) deg -= 360;
        while (deg < -180) deg += 360;
        rawD.rotation = Math.round(Spec.clamp(deg, -180, 180));
      }
      resolvedSkin = Spec.resolveSkin(rawSkin);
      updateDecoInspectorValues();
      return;
    }

    if (live.draggingCat) {
      const now = performance.now();
      const totalDist = Math.hypot(e.clientX - live.draggingCat.startClientX, e.clientY - live.draggingCat.startClientY);
      if (!live.draggingCat.engaged && totalDist > 5) {
        live.draggingCat.engaged = true;
        setCatDragClasses(true);
      }
      if (live.draggingCat.engaged) {
        const dx = e.clientX - live.draggingCat.lastClientX;
        const dy = e.clientY - live.draggingCat.lastClientY;
        const dtMs = Math.max(8, now - live.draggingCat.lastTime);
        const vx = (dx / dtMs) * 1000;
        const vy = (dy / dtMs) * 1000;
        if (isFloatingPetMode()) {
          if (typeof petLayout.x !== 'number' || typeof petLayout.y !== 'number') {
            const r = stageColumn.getBoundingClientRect();
            petLayout.x = r.left;
            petLayout.y = r.top;
          }
          petLayout.x += dx;
          petLayout.y += dy;
          applyFloatingPetLayout();
        } else {
          live.dragOffsetX = e.clientX - live.draggingCat.startClientX;
          live.dragOffsetY = e.clientY - live.draggingCat.startClientY;
        }
        animState.dragSwingTarget = Spec.clamp(-vx * 0.00052, -0.92, 0.92);
        animState.dragSwingYTarget = Spec.clamp(-vy * 0.00046, -0.78, 0.78);
      }
      live.draggingCat.lastClientX = e.clientX;
      live.draggingCat.lastClientY = e.clientY;
      live.draggingCat.lastTime = now;
      live.lastActivity = now;
      return;
    }

    // Hover interactions inside the canvas (petting head/body, tail brush flick, mini-mouse wiggle, grab cursor)
    if (editingRegionIdx < 0) {
      const activeSkinNow = penPreviewSkin || resolvedSkin;
      const zone = Renderer.hitTestCat(pos, activeSkinNow, animState);
      catCanvas.classList.toggle('cat-grabbable', zone === 'head' || zone === 'body');
      const now = performance.now();
      const moveDist = live.lastClientTime ? Math.hypot(e.clientX - live.lastClientX, e.clientY - live.lastClientY) : 0;
      if (moveDist > 0.8 && moveDist < 65) {
        if (zone === 'head') {
          live.petHead = Math.min(1, live.petHead + moveDist * 0.015);
          live.lastActivity = now;
        } else if (zone === 'body') {
          live.petBody = Math.min(0.9, live.petBody + moveDist * 0.012);
          live.lastActivity = now;
        } else if (zone === 'mouse') {
          animState.mouseOffsetX = Spec.clamp((pos.x - Renderer.MOUSE_BASE.x) * 0.25, -5, 5);
          animState.mouseOffsetY = Spec.clamp((pos.y - Renderer.MOUSE_BASE.y) * 0.25, -4, 4);
        } else if (Renderer.updateTailHover) {
          Renderer.updateTailHover(animState, activeSkinNow, pos);
        }
      }
    } else {
      catCanvas.classList.remove('cat-grabbable');
    }
  });

  function finishCatDrag() {
    const dc = live.draggingCat;
    if (!dc) return;
    live.draggingCat = null;
    if (dc.engaged) {
      if (isFloatingPetMode()) savePetLayout();
    } else {
      if (dc.startZone === 'head') {
        animState.earTwitch = 1.6;
        animState.bodySquash = 0.94;
        live.petHead = Math.min(1, live.petHead + 0.55);
      } else if (dc.startZone === 'body') {
        animState.bodySquash = 0.95;
        live.petBody = Math.min(0.85, live.petBody + 0.5);
      }
    }
  }

  catCanvas.addEventListener('pointerup', () => {
    if (window.KuroExplodedStudio && window.KuroExplodedStudio.handleLiveCanvasPointerUp()) {
      return;
    }
    if (pen) {
      if (pen.mode === 'brushFill' || pen.mode === 'brushStroke') {
        finishFreehandStroke();
        return;
      }
      pen.drag = null;
      updatePenPreview();
      return;
    }
    if (draggingHandle) {
      draggingHandle = null;
      syncSkin(true);
    }
    if (draggingDeco) {
      draggingDeco = null;
      syncSkin(true);
    }
    if (live.draggingCat) {
      finishCatDrag();
    }
  });

  catCanvas.addEventListener('pointercancel', () => {
    if (live.draggingCat) {
      live.draggingCat = null;
    }
  });

  catCanvas.addEventListener('pointerleave', () => {
    catCanvas.classList.remove('cat-grabbable');
    if (pen && !pen.drag) {
      pen.hover = null;
      pen.closeHint = false;
      updatePenPreview();
    }
  });

  // Track cursor across the entire webpage so the cat follows your mouse & detects rapid hunting shakes!
  window.addEventListener('pointermove', (e) => {
    if (!isWorkshopVisible()) return;
    const now = performance.now();
    if (live.lastClientTime > 0) {
      const dtSec = Math.max(0.008, (now - live.lastClientTime) / 1000);
      const speed = Math.hypot(e.clientX - live.lastClientX, e.clientY - live.lastClientY) / dtSec;
      if (speed > 1750 && !live.draggingCat && !pen && editingRegionIdx < 0 && !draggingDeco && live.petHead < 0.25) {
        live.huntEnergy = Math.min(1.0, live.huntEnergy + Math.min(0.35, (speed - 1750) / 3600));
        live.lastActivity = now;
      }
    }
    live.lastClientX = e.clientX;
    live.lastClientY = e.clientY;
    live.lastClientTime = now;

    if (pen || editingRegionIdx >= 0 || draggingDeco || (live.draggingCat && live.draggingCat.engaged)) return;
    const rect = catCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const lx = ((e.clientX - rect.left) / rect.width) * 360;
    const ly = ((e.clientY - rect.top) / rect.height) * 320;
    pointerTarget.active = true;
    pointerTarget.yaw = Spec.clamp((lx - 184) / 210, -1, 1);
    pointerTarget.pitch = Spec.clamp((ly - 130) / 190, -1, 1);
    pointerTarget.gazeX = Spec.clamp((lx - 184) / 150, -1, 1);
    pointerTarget.gazeY = Spec.clamp((ly - 130) / 150, -1, 1);
    if (lx >= -30 && lx <= 390 && ly >= -30 && ly <= 350) {
      live.lastActivity = now;
    }
  });

  // --- Pen Tool (钢笔画分区) ---
  // 「分割线」: draw an open curve across a part, then click the side to fill (Spec.pickSplitSide turns that
  // side into an ordinary closed region). 「闭合色块」: draw the outline and click the first anchor to close.
  // Click = corner anchor; press and drag = smooth anchor with mirrored handles. The head and tail hold still
  // while the pen is on so anchors land where they are clicked.
  function startPen() {}
  function exitPen() {}
  function renderPenSwatches() {}
  function penPointerDown() {}
  function penPointerMove() {}
  function finishFreehandStroke() {}
  function updatePenPreview() {}

  function isEditableElement(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT' && el.type !== 'color' && el.type !== 'range' && el.type !== 'checkbox' && el.type !== 'button') return true;
    return false;
  }

  document.addEventListener('keydown', (e) => {
    const typingInField = isEditableElement(e.target);
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y')) {
      if (typingInField) return;
      e.preventDefault();
      if (e.key === 'y' || e.key === 'Y' || e.shiftKey) redo(); else undo();
      return;
    }
    if (pen && !typingInField) {
      if (e.key === 'Escape') {
        e.preventDefault();
        exitPen();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        finishPen();
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        penBack();
      }
      return;
    }
    if (editingRegionIdx >= 0 && !typingInField && (e.key === 'Escape' || e.key === 'Enter')) {
      e.preventDefault();
      exitRegionEdit();
      return;
    }
    // Live keyboard typing preview directly inside the Workshop page!
    if (typingInField || !isWorkshopVisible() || editingRegionIdx >= 0 || draggingDeco) return;
    if ((e.ctrlKey || e.metaKey || e.altKey) && !['ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight', 'AltLeft', 'AltRight'].includes(e.code)) {
      return;
    }
    if (document.activeElement === catCanvas && (e.code === 'Space' || e.code.startsWith('Arrow'))) {
      e.preventDefault();
    }
    const now = performance.now();
    live.lastActivity = now;
    live.lastKeyTime = now;
    if (!e.repeat) {
      const activeSkin = penPreviewSkin || resolvedSkin;
      const cap = Renderer.mapKeyboardEventToCap(e);
      pressedKeyCaps.set(e.code, cap);
      Renderer.triggerKeyTap(animState, activeSkin, cap);
    }
  });

  document.addEventListener('keyup', (e) => {
    pressedKeyCaps.delete(e.code);
  });

  window.addEventListener('blur', () => {
    pressedKeyCaps.clear();
    if (live.draggingCat) {
      live.draggingCat = null;
    }
  });

  function triggerRandomKeyTap() {
    const activeSkin = penPreviewSkin || resolvedSkin;
    const isDouniTyping = activeSkin && (activeSkin.typingStyle === 'douni' || activeSkin.renderStyle === 'douni');
    Renderer.triggerKeyTap(animState, activeSkin);
    if (!isDouniTyping) {
      setTimeout(() => {
        if (currentPose !== 'typing') {
          animState.leftPawActive = false;
          animState.rightPawActive = false;
        }
      }, 220);
    }
  }

  // --- Photo Upload, Framing, Eyedropper & Analysis ---
  // Crop geometry shared with the analyzer: the cat's face (cheek to cheek) spans half the crop width,
  // the head centre sits at 33% of the crop height and the crop has the analyzer grid's 72:84 shape.
  const FACE_HALF_W = 0.25;
  const FACE_CENTER_Y = 0.33;
  const NOSE_BELOW = 0.25;   // the nose is this many cheek half-widths below the head centre
  const FACE_ASPECT = 0.88;  // face height / width, for the on-photo face ring only
  const CROP_ASPECT = 84 / 72;

  function defaultPhotoCrop(img) {
    const ar = img.naturalWidth / img.naturalHeight;
    if (ar > 1.25) {
      const w = Math.min(0.86, 0.86 / ar * 1.05);
      return { x: (1 - w) * 0.5, y: 0.06, w, h: 0.88 };
    }
    return { x: 0.08, y: 0.06, w: 0.84, h: 0.88 };
  }

  // head centre (hx, hy) and cheek half-width r in image pixels -> normalized crop box
  function cropFromFace(img, hx, hy, r) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    let cw = Math.max(48, r / FACE_HALF_W), chh = cw * CROP_ASPECT;
    const fit = Math.min(1, iw / cw, ih / chh);
    cw *= fit; chh *= fit;
    const x0 = Spec.clamp(hx - 0.5 * cw, 0, iw - cw);
    const y0 = Spec.clamp(hy - FACE_CENTER_Y * chh, 0, ih - chh);
    return { x: x0 / iw, y: y0 / ih, w: cw / iw, h: chh / ih };
  }

  function framingTip() {
    if (framingStep === 'nose') return '在猫鼻子上按住，拖到脸颊边缘松开（单击也行）';
    return '橙色圈对准猫脸 · 拖动平移 · 滚轮缩放';
  }

  function setFramingStep(step) {
    framingStep = step;
    faceGesture = null;
    const tip = document.getElementById('photo-overlay-tip');
    tip.textContent = framingTip();
    tip.classList.toggle('prompt', step === 'nose');
    photoCanvas.classList.toggle('pick-face', step === 'nose');
    document.getElementById('btn-skip-face').hidden = step !== 'nose';
  }

  function strokeFaceRing(cx, cy, r) {
    photoCtx.save();
    photoCtx.setLineDash([]);
    photoCtx.lineWidth = 4;
    photoCtx.strokeStyle = 'rgba(30, 20, 12, 0.45)';
    photoCtx.beginPath();
    photoCtx.ellipse(cx, cy, r, r * FACE_ASPECT, 0, 0, Math.PI * 2);
    photoCtx.stroke();
    photoCtx.lineWidth = 2;
    photoCtx.strokeStyle = '#F39A4C';
    photoCtx.stroke();
    photoCtx.restore();
  }

  function drawPhotoWorkspace() {
    if (!photoImg) return;
    const cw = photoCanvas.width, ch = photoCanvas.height;
    photoCtx.clearRect(0, 0, cw, ch);

    const iw = photoImg.naturalWidth, ih = photoImg.naturalHeight;
    const scale = Math.min(cw / iw, ch / ih);
    const dw = iw * scale, dh = ih * scale;
    const ox = (cw - dw) * 0.5, oy = (ch - dh) * 0.5;

    photoCtx.fillStyle = '#231E1A';
    photoCtx.fillRect(0, 0, cw, ch);
    photoCtx.drawImage(photoImg, ox, oy, dw, dh);

    if (framingStep === 'nose') {
      photoCanvas._layout = { ox, oy, dw, dh, rx: ox, ry: oy, rw: dw, rh: dh };
      if (faceGesture) {
        const r = Math.max(faceGesture.r, 3);
        const hcx = faceGesture.x, hcy = faceGesture.y - NOSE_BELOW * r;
        if (faceGesture.r >= 6) {
          // preview of the crop this face will produce
          const c = cropFromFace(photoImg, (hcx - ox) / scale, (hcy - oy) / scale, r / scale);
          photoCtx.save();
          photoCtx.strokeStyle = 'rgba(247, 194, 129, 0.85)';
          photoCtx.lineWidth = 1.5;
          photoCtx.setLineDash([6, 4]);
          photoCtx.strokeRect(ox + c.x * dw, oy + c.y * dh, c.w * dw, c.h * dh);
          photoCtx.restore();
          strokeFaceRing(hcx, hcy, r);
        }
        photoCtx.save();
        photoCtx.fillStyle = '#F39A4C';
        photoCtx.strokeStyle = '#FFFFFF';
        photoCtx.lineWidth = 2;
        photoCtx.beginPath();
        photoCtx.arc(faceGesture.x, faceGesture.y, 4.5, 0, Math.PI * 2);
        photoCtx.fill();
        photoCtx.stroke();
        photoCtx.restore();
      }
      return;
    }

    // Dim outside crop rectangle
    const rx = ox + photoCrop.x * dw;
    const ry = oy + photoCrop.y * dh;
    const rw = photoCrop.w * dw;
    const rh = photoCrop.h * dh;

    photoCtx.save();
    photoCtx.fillStyle = 'rgba(20, 14, 10, 0.42)';
    photoCtx.beginPath();
    photoCtx.rect(0, 0, cw, ch);
    photoCtx.rect(rx, ry, rw, rh);
    photoCtx.fill('evenodd');

    // Framing box + cat head/torso alignment guide matching the exact pixel-to-vector coordinate grid
    photoCtx.strokeStyle = '#F7C281';
    photoCtx.lineWidth = 2;
    photoCtx.setLineDash([6, 4]);
    photoCtx.strokeRect(rx, ry, rw, rh);

    // Torso oval guide (matches insideBody: center 0.5, 0.74, rx 0.38, ry 0.25)
    photoCtx.strokeStyle = 'rgba(255, 252, 245, 0.48)';
    photoCtx.lineWidth = 1.3;
    photoCtx.setLineDash([3, 3]);
    photoCtx.beginPath();
    photoCtx.ellipse(rx + rw * 0.50, ry + rh * 0.74, rw * 0.38, rh * 0.24, 0, 0, Math.PI * 2);
    photoCtx.stroke();
    photoCtx.restore();
    // Face ring: where the cat's face (cheek to cheek) should sit inside this crop
    strokeFaceRing(rx + rw * 0.5, ry + rh * FACE_CENTER_Y, rw * FACE_HALF_W);

    photoCanvas._layout = { ox, oy, dw, dh, rx, ry, rw, rh };
  }

  const drawingOpts = {
    renderMode: 'original', // 'original' | 'vector'
    eyeMode: 'keep',        // 'keep' | 'live'
    removeBg: true,
    hideBase: true,
    userAdjustedCrop: false
  };

  function runPhotoAnalysis(silent) {
    if (!photoImg) return;
    const baseName = photoFilename ? photoFilename.replace(/\.[^.]+$/, '').slice(0, 24) : '照片小猫';
    const useOriginalDrawing = photoOpts.sourceType === 'drawing' && drawingOpts.renderMode === 'original' && Analyzer.buildOriginalDrawingSkin;
    const result = useOriginalDrawing
      ? Analyzer.buildOriginalDrawingSkin(photoImg, photoCrop, {
          removeBg: drawingOpts.removeBg,
          eyeMode: drawingOpts.eyeMode,
          hideBase: drawingOpts.hideBase,
          useCustomCrop: drawingOpts.userAdjustedCrop,
          name: baseName
        })
      : Analyzer.analyzeCatPhoto(photoImg, photoCrop, {
          ...photoOpts,
          name: `${baseName}`
        });

    rawSkin = result.spec;
    if (!rawSkin.decorations) rawSkin.decorations = [];
    Spec.migrateSkullToHead(rawSkin);
    editingRegionIdx = -1;
    selectedDecoIdx = -1;
    editModeBanner.hidden = true;
    decoBanner.hidden = true;

    const tag = document.getElementById('photo-archetype-tag');
    tag.textContent = result.modeLabel;
    stageCoatBadge.textContent = useOriginalDrawing
      ? `手绘原图直用 · ${result.modeLabel}`
      : `照片色块生成 · ${result.modeLabel}`;

    const summary = document.getElementById('photo-summary-box');
    const irisNote = !useOriginalDrawing && result.diagnostics && result.diagnostics.irisDetected
      ? '，并自动提取了照片瞳色。'
      : (useOriginalDrawing ? '' : '。');
    summary.innerHTML = `${result.reason}${irisNote}`;

    const segImg = document.getElementById('photo-seg-img');
    if (segImg && result.segDataUrl) segImg.src = result.segDataUrl;

    const swatchRow = document.getElementById('photo-swatches');
    swatchRow.innerHTML = result.swatches.map((s) => `
      <div class="swatch-item">
        <div class="swatch-dot" style="background:${s.hex}"></div>
        <span class="swatch-name">${s.label}</span>
        <span class="swatch-hex">${s.hex.slice(0, 7)}</span>
      </div>
    `).join('');

    const vecCtrl = document.getElementById('photo-vector-controls');
    if (vecCtrl) vecCtrl.hidden = useOriginalDrawing;
    document.getElementById('photo-controls').hidden = false;
    if (PixelLayers) PixelLayers.rasterizeFromSkin(rawSkin, Spec.resolveSkin(rawSkin), eyeTheme, true);
    syncSkin();
    commitHistoryNow();
    if (!silent) {
      showToast(useOriginalDrawing
        ? `已保留手绘原图生成「${baseName}」，已转化为透明纸图层`
        : `已从照片提取色块生成「${baseName}」透明纸图层`);
    }
  }

  function handlePhotoFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('请选择 JPG / PNG / WebP 格式的猫咪照片');
      return;
    }
    photoFilename = file.name || '我的猫咪';
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        photoImg = img;
        drawingOpts.userAdjustedCrop = false;
        document.getElementById('dropzone-empty').hidden = true;
        document.getElementById('photo-workspace').hidden = false;
        if (photoOpts.sourceType === 'drawing') {
          photoCrop = Analyzer.detectDrawingCrop ? Analyzer.detectDrawingCrop(img) : defaultPhotoCrop(img);
          setFramingStep('framed');
          drawPhotoWorkspace();
          runPhotoAnalysis(false);
        } else {
          photoCrop = defaultPhotoCrop(img);
          setFramingStep('nose');
          document.getElementById('photo-archetype-tag').textContent = '等待定位猫脸';
          document.getElementById('photo-summary-box').innerHTML =
            '<b>先定位猫脸：</b>在上方照片里的<b>猫鼻子</b>上按住，拖到<b>脸颊边缘</b>再松开。取色只看这只猫，背景（草地、地板、沙发）就不会混进毛色。';
          drawPhotoWorkspace();
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  document.getElementById('btn-choose-photo').addEventListener('click', (e) => {
    e.stopPropagation();
    photoFileInput.click();
  });
  document.getElementById('dropzone-empty').addEventListener('click', () => photoFileInput.click());
  document.getElementById('btn-change-photo').addEventListener('click', () => photoFileInput.click());
  photoFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) handlePhotoFile(e.target.files[0]);
    e.target.value = '';
  });

  ['dragenter', 'dragover'].forEach((ev) => {
    photoDropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      photoDropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    photoDropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      photoDropzone.classList.remove('dragover');
    });
  });
  photoDropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handlePhotoFile(file);
  });

  // Photo canvas drag to pan crop box, wheel to zoom, or eyedropper click
  photoCanvas.addEventListener('pointerdown', (e) => {
    if (!photoImg || !photoCanvas._layout) return;
    const rect = photoCanvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * photoCanvas.width;
    const cy = ((e.clientY - rect.top) / rect.height) * photoCanvas.height;

    if (photoEyedropTarget) {
      const px = photoCtx.getImageData(Math.round(cx), Math.round(cy), 1, 1).data;
      const hex = Spec.rgbToHex(px[0], px[1], px[2]);
      if (photoEyedropTarget === 'iris') {
        rawSkin.palette.iris = hex;
        showToast(`已从照片吸取瞳色 ${hex}`);
      } else {
        rawSkin.palette.body = hex;
        rawSkin.palette.legs = hex;
        rawSkin.palette.earOuter = hex;
        rawSkin.palette.tail = hex;
        showToast(`已从照片吸取主毛色 ${hex}`);
      }
      photoEyedropTarget = null;
      photoCanvas.classList.remove('eyedropper');
      document.getElementById('btn-eyedrop-iris').classList.remove('active');
      document.getElementById('btn-eyedrop-body').classList.remove('active');
      document.getElementById('photo-overlay-tip').textContent = framingTip();
      syncSkin(true);
      return;
    }

    if (framingStep === 'nose') {
      faceGesture = { x: cx, y: cy, r: 0 };
      photoCanvas.setPointerCapture(e.pointerId);
      drawPhotoWorkspace();
      return;
    }

    photoDragging = true;
    photoDragStart = { cx, cy, cropX: photoCrop.x, cropY: photoCrop.y };
    photoCanvas.setPointerCapture(e.pointerId);
  });

  photoCanvas.addEventListener('pointermove', (e) => {
    if (faceGesture) {
      const rect = photoCanvas.getBoundingClientRect();
      const cx = ((e.clientX - rect.left) / rect.width) * photoCanvas.width;
      const cy = ((e.clientY - rect.top) / rect.height) * photoCanvas.height;
      // nose -> cheek edge is ~1.03 cheek half-widths (the nose sits a little below the head centre)
      faceGesture.r = Math.hypot(cx - faceGesture.x, cy - faceGesture.y) / 1.03;
      drawPhotoWorkspace();
      return;
    }
    if (!photoDragging || !photoDragStart || !photoCanvas._layout) return;
    const rect = photoCanvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * photoCanvas.width;
    const cy = ((e.clientY - rect.top) / rect.height) * photoCanvas.height;
    const { dw, dh } = photoCanvas._layout;
    photoCrop.x = Spec.clamp(photoDragStart.cropX + (cx - photoDragStart.cx) / dw, 0, 1 - photoCrop.w);
    photoCrop.y = Spec.clamp(photoDragStart.cropY + (cy - photoDragStart.cy) / dh, 0, 1 - photoCrop.h);
    drawPhotoWorkspace();
  });

  function finishFaceGesture() {
    const g = faceGesture;
    const L = photoCanvas._layout;
    if (!g || !L || !photoImg) return;
    const iw = photoImg.naturalWidth, ih = photoImg.naturalHeight;
    const scale = L.dw / iw;
    const noseX = (g.x - L.ox) / scale, noseY = (g.y - L.oy) / scale;
    // a plain click gets the typical size of a cat face in a phone photo; the wheel fine-tunes it
    const r = g.r >= 6 ? g.r / scale : 0.19 * Math.min(iw, ih);
    photoCrop = cropFromFace(photoImg, noseX, noseY - NOSE_BELOW * r, r);
    setFramingStep('framed');
    drawPhotoWorkspace();
    runPhotoAnalysis(false);
  }

  photoCanvas.addEventListener('pointerup', () => {
    if (faceGesture) {
      finishFaceGesture();
      return;
    }
    if (photoDragging) {
      photoDragging = false;
      drawingOpts.userAdjustedCrop = true;
      runPhotoAnalysis(true);
    }
  });

  photoCanvas.addEventListener('pointercancel', () => {
    faceGesture = null;
    photoDragging = false;
    drawPhotoWorkspace();
  });

  photoCanvas.addEventListener('wheel', (e) => {
    if (!photoImg || framingStep === 'nose') return;
    e.preventDefault();
    // zoom about the face ring so the face stays put; keep the crop's shape
    let factor = e.deltaY > 0 ? 1.07 : 0.93;
    factor = Math.min(factor, 1 / photoCrop.w, 1 / photoCrop.h);
    factor = Math.max(factor, 0.06 / photoCrop.w, 0.06 / photoCrop.h);
    const fx = photoCrop.x + photoCrop.w * 0.5;
    const fy = photoCrop.y + photoCrop.h * FACE_CENTER_Y;
    photoCrop.w *= factor;
    photoCrop.h *= factor;
    photoCrop.x = Spec.clamp(fx - photoCrop.w * 0.5, 0, 1 - photoCrop.w);
    photoCrop.y = Spec.clamp(fy - photoCrop.h * FACE_CENTER_Y, 0, 1 - photoCrop.h);
    drawPhotoWorkspace();
    runPhotoAnalysis(true);
  }, { passive: false });

  document.getElementById('btn-recenter-frame').addEventListener('click', () => {
    if (!photoImg) return;
    setFramingStep('nose');
    drawPhotoWorkspace();
  });

  document.getElementById('btn-skip-face').addEventListener('click', () => {
    if (!photoImg) return;
    photoCrop = defaultPhotoCrop(photoImg);
    setFramingStep('framed');
    drawPhotoWorkspace();
    runPhotoAnalysis(false);
  });

  function toggleEyedropper(mode) {
    photoEyedropTarget = photoEyedropTarget === mode ? null : mode;
    photoCanvas.classList.toggle('eyedropper', Boolean(photoEyedropTarget));
    document.getElementById('btn-eyedrop-iris').classList.toggle('active', photoEyedropTarget === 'iris');
    document.getElementById('btn-eyedrop-body').classList.toggle('active', photoEyedropTarget === 'body');
    const tip = document.getElementById('photo-overlay-tip');
    tip.textContent = photoEyedropTarget
      ? `吸管模式：请在照片上点击要吸取的${photoEyedropTarget === 'iris' ? '眼睛虹膜' : '主毛色'}位置`
      : framingTip();
    tip.classList.toggle('prompt', !photoEyedropTarget && framingStep === 'nose');
  }
  document.getElementById('btn-eyedrop-iris').addEventListener('click', () => toggleEyedropper('iris'));
  document.getElementById('btn-eyedrop-body').addEventListener('click', () => toggleEyedropper('body'));

  function updatePhotoSourceModeUI(mode) {
    const isDrawing = mode === 'drawing';
    const isOriginal = isDrawing && drawingOpts.renderMode === 'original';
    const dropzone = document.getElementById('photo-dropzone');
    const iconEl = document.getElementById('photo-drop-icon');
    const titleEl = document.getElementById('photo-drop-title');
    const subEl = document.getElementById('photo-drop-sub');
    const btnEl = document.getElementById('btn-choose-photo');
    const tagEl = document.getElementById('photo-archetype-tag');
    const summaryEl = document.getElementById('photo-summary-box');
    const drawPanel = document.getElementById('drawing-mode-panel');
    const origOpts = document.getElementById('drawing-original-opts');
    const resTitle = document.getElementById('photo-result-title');
    const vecCtrl = document.getElementById('photo-vector-controls');

    if (dropzone) dropzone.dataset.source = mode;
    if (drawPanel) drawPanel.hidden = !isDrawing;
    if (origOpts) origOpts.hidden = !isOriginal;
    if (resTitle) resTitle.textContent = isOriginal ? '手绘原图直用' : '色块向量化提取';
    if (vecCtrl && photoImg) vecCtrl.hidden = isOriginal;

    if (iconEl) {
      iconEl.innerHTML = isDrawing
        ? `<svg viewBox="0 0 48 48" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 38l4.5-1.5L35 16l-3-3L11.5 33.5 10 38z"/>
            <path d="M29 16l3 3"/>
            <path d="M22 38h16"/>
            <circle cx="15" cy="14" r="3"/>
          </svg>`
        : `<svg viewBox="0 0 48 48" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="6" y="10" width="36" height="28" rx="6"/>
            <circle cx="18" cy="21" r="3.5"/>
            <path d="M8 33l10-9 7 6 6-5 9 8"/>
          </svg>`;
    }
    if (titleEl) {
      titleEl.textContent = isDrawing
        ? '拖入你的手绘 / 板绘小猫图，或点击上传'
        : '拖入真实猫咪照片，或点击上传';
    }
    if (subEl) {
      subEl.textContent = isDrawing
        ? (isOriginal
            ? '支持透明底 PNG / 白底手绘图 · 直接保留原画笔触，按底图画可精准 1:1 对齐'
            : '支持透明底 PNG / 白底插画 · 自动抠底裁切并转为可编辑贝塞尔色块')
        : '推荐正面清晰拍到花色与毛色 · 纯本地识别，不上传服务器';
    }
    if (btnEl) {
      btnEl.textContent = isDrawing ? '选择手绘 / 板绘图' : '选择真实猫照片';
    }
    if (!photoImg) {
      if (tagEl) {
        tagEl.textContent = isDrawing
          ? (isOriginal ? '原图直用 · 待上传' : '绘稿向量化 · 待上传')
          : '照片模式 · 待上传';
      }
      if (summaryEl) {
        summaryEl.textContent = isDrawing
          ? (isOriginal
              ? '可直接下载上方 720×640 原版手绘底图垫底绘制，也可直接拖入已有画作：系统会完整保留你的原画笔触（自动拆分为 2.5D 跟随头部 + 躯干两层），并自动匹配打字手与摇尾颜色，导出 .kurocat 即可在桌面端使用。'
              : '将你的手绘/板绘图按像素硬边提取为可编辑的贝塞尔曲线色块分区（免点鼻尖、原图直取、关闭自动虎斑），适合后续在「手绘花纹」里继续微调。')
          : '上传真实猫咪照片后点一下猫鼻尖对齐头部，系统会自动过滤背景与光影噪点，识别虎斑/重点色并提取为可编辑的贝塞尔曲线分区。';
      }
    }
  }

  const btnDownloadTemplate = document.getElementById('btn-download-template');
  if (btnDownloadTemplate) {
    btnDownloadTemplate.addEventListener('click', () => {
      if (!Renderer.generateHandDrawTemplateDataUrl) return;
      const dataUrl = Renderer.generateHandDrawTemplateDataUrl(resolvedSkin);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'kurocat-handdraw-template-720x640.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('已下载 720×640 原版手绘底图 PNG，在画图软件中新建图层垫底绘制即可！');
    });
  }

  document.querySelectorAll('#drawing-render-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#drawing-render-pills .pill').forEach((b) => b.classList.toggle('active', b === btn));
      drawingOpts.renderMode = btn.dataset.dmode || 'original';
      updatePhotoSourceModeUI(photoOpts.sourceType);
      if (photoImg && framingStep === 'framed') runPhotoAnalysis(true);
    });
  });

  document.querySelectorAll('#drawing-eye-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#drawing-eye-pills .pill').forEach((b) => b.classList.toggle('active', b === btn));
      drawingOpts.eyeMode = btn.dataset.deye || 'keep';
      if (photoImg && photoOpts.sourceType === 'drawing' && drawingOpts.renderMode === 'original') {
        runPhotoAnalysis(true);
      }
    });
  });

  const chkDrawBg = document.getElementById('drawing-opt-remove-bg');
  if (chkDrawBg) {
    chkDrawBg.addEventListener('change', () => {
      drawingOpts.removeBg = chkDrawBg.checked;
      if (photoImg && photoOpts.sourceType === 'drawing' && drawingOpts.renderMode === 'original') {
        runPhotoAnalysis(true);
      }
    });
  }
  const chkDrawBase = document.getElementById('drawing-opt-hide-base');
  if (chkDrawBase) {
    chkDrawBase.addEventListener('change', () => {
      drawingOpts.hideBase = chkDrawBase.checked;
      if (photoImg && photoOpts.sourceType === 'drawing' && drawingOpts.renderMode === 'original') {
        runPhotoAnalysis(true);
      }
    });
  }

  document.querySelectorAll('#photo-source-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#photo-source-pills .pill').forEach((b) => b.classList.toggle('active', b === btn));
      const mode = btn.dataset.source || 'photo';
      photoOpts.sourceType = mode;
      if (mode === 'drawing') {
        photoOpts.tone = 'faithful';
        photoOpts.addTabby = 'off';
        document.querySelectorAll('#tone-pills .pill').forEach((b) => b.classList.toggle('active', b.dataset.tone === 'faithful'));
        document.querySelectorAll('#tabby-pills .pill').forEach((b) => b.classList.toggle('active', b.dataset.tabby === 'off'));
      } else {
        photoOpts.tone = 'balanced';
        photoOpts.addTabby = 'auto';
        document.querySelectorAll('#tone-pills .pill').forEach((b) => b.classList.toggle('active', b.dataset.tone === 'balanced'));
        document.querySelectorAll('#tabby-pills .pill').forEach((b) => b.classList.toggle('active', b.dataset.tabby === 'auto'));
      }
      updatePhotoSourceModeUI(mode);
      if (photoImg) {
        if (mode === 'drawing' && framingStep === 'nose') {
          photoCrop = Analyzer.detectDrawingCrop ? Analyzer.detectDrawingCrop(photoImg) : defaultPhotoCrop(photoImg);
          setFramingStep('framed');
          drawPhotoWorkspace();
        }
        if (framingStep === 'framed') runPhotoAnalysis(true);
      }
    });
  });
  updatePhotoSourceModeUI(photoOpts.sourceType || 'photo');

  document.querySelectorAll('#color-count-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#color-count-pills .pill').forEach((b) => b.classList.toggle('active', b === btn));
      photoOpts.colorCount = parseInt(btn.dataset.k, 10) || 3;
      runPhotoAnalysis(true);
    });
  });

  document.querySelectorAll('#tone-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tone-pills .pill').forEach((b) => b.classList.toggle('active', b === btn));
      photoOpts.tone = btn.dataset.tone;
      runPhotoAnalysis(true);
    });
  });

  document.querySelectorAll('#tabby-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tabby-pills .pill').forEach((b) => b.classList.toggle('active', b === btn));
      photoOpts.addTabby = btn.dataset.tabby;
      runPhotoAnalysis(true);
    });
  });

  const smoothSlider = document.getElementById('photo-smoothness');
  smoothSlider.addEventListener('input', () => {
    photoOpts.smoothness = parseFloat(smoothSlider.value);
    document.getElementById('photo-smoothness-val').textContent = photoOpts.smoothness.toFixed(1);
    runPhotoAnalysis(true);
  });

  document.getElementById('photo-opt-colorpoint').addEventListener('change', (e) => {
    photoOpts.softColorpoint = e.target.checked;
    runPhotoAnalysis(true);
  });
  document.getElementById('photo-opt-nose').addEventListener('change', (e) => {
    photoOpts.includeNose = e.target.checked;
    runPhotoAnalysis(true);
  });
  document.getElementById('photo-opt-pads').addEventListener('change', (e) => {
    photoOpts.includePads = e.target.checked;
    runPhotoAnalysis(true);
  });
  document.getElementById('photo-opt-iris').addEventListener('change', (e) => {
    photoOpts.includeIris = e.target.checked;
    runPhotoAnalysis(true);
  });
  document.getElementById('btn-regenerate-photo').addEventListener('click', () => runPhotoAnalysis(false));

  // --- Templates Tab ---
  async function loadTemplatesUI() {
    const officialGrid = document.getElementById('official-template-grid');
    const presetGrid = document.getElementById('preset-template-grid');
    officialGrid.innerHTML = '';
    presetGrid.innerHTML = '';

    for (const tpl of Spec.OFFICIAL_TEMPLATES) {
      let specObj = deepClone(tpl.fallback);
      try {
        const res = await fetch(tpl.file);
        if (res.ok) {
          const loaded = await res.json();
          if (Spec.validateRawSkin(loaded).ok) specObj = loaded;
        }
      } catch (_) {}
      officialGrid.appendChild(createTemplateCard(specObj, tpl.tag));
    }

    // Also try loading the official curve-regions demo
    try {
      const res = await fetch('./skins/samples/curve-regions-demo.kurocat');
      if (res.ok) {
        const demo = await res.json();
        if (Spec.validateRawSkin(demo).ok) {
          presetGrid.appendChild(createTemplateCard(demo, '官方曲线示例'));
        }
      }
    } catch (_) {}

    for (const p of Spec.EXTRA_PRESETS) {
      presetGrid.appendChild(createTemplateCard(deepClone(p.spec), p.tag));
    }
  }

  function createTemplateCard(specObj, tag) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tpl-card';

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'tpl-thumb';
    const c = document.createElement('canvas');
    c.width = 108;
    c.height = 96;
    const ctx = c.getContext('2d');
    const st = Renderer.createDefaultState();
    st.time = 0.4;
    Renderer.drawScene(ctx, Spec.resolveSkin(specObj), st, { kbTheme: 'classicMilk' });
    thumbWrap.appendChild(c);

    const info = document.createElement('div');
    info.className = 'tpl-info';
    info.innerHTML = `<strong>${specObj.name}</strong><span>${tag}</span>`;

    btn.appendChild(thumbWrap);
    btn.appendChild(info);
    btn.addEventListener('click', () => {
      loadAndRasterizeSkin(deepClone(specObj), `模板 · ${specObj.name}`, `已载入模板「${specObj.name}」并生成透明纸图层`);
    });
    return btn;
  }

  // --- Palette Tab ---
  const PALETTE_GROUPS = [
    {
      title: '主体毛色',
      items: [
        ['body', '主毛色 (必填)', true],
        ['bodyShade', '身体渐变底色', false],
        ['belly', '胸腹底色', false],
        ['legs', '四肢颜色', false],
        ['paws', '爪子/白手套', false],
        ['pawPads', '肉垫颜色', false]
      ]
    },
    {
      title: '耳朵与尾巴',
      items: [
        ['earOuter', '耳背毛色', false],
        ['earInner', '内耳肉色', false],
        ['tail', '尾巴毛色', false],
        ['tailTip', '尾尖双色', false],
        ['stripes', '默认条纹色', false]
      ]
    },
    {
      title: '五官与重点色',
      items: [
        ['iris', '双眼默认虹膜色', false],
        ['irisLeft', '左眼虹膜色（异瞳）', false],
        ['irisRight', '右眼虹膜色（异瞳）', false],
        ['pupil', '瞳孔颜色', false],
        ['nose', '小鼻头', false],
        ['mouth', '猫咪 ω 嘴巴', false],
        ['points', '重点色面罩', false],
        ['pointsMid', '重点色过渡', false]
      ]
    },
    {
      title: '线条细节',
      items: [
        ['whiskers', '胡须颜色', false],
        ['crease', '手臂折痕线', false],
        ['outline', '外轮廓柔边', false]
      ]
    }
  ];

  function sameHexRgb(a, b) {
    if (!a || !b) return false;
    return String(a).trim().slice(0, 7).toUpperCase() === String(b).trim().slice(0, 7).toUpperCase();
  }

  function applyPaletteChange(key, nextHex) {
    const prevHex = rawSkin.palette[key] || null;
    if (nextHex) rawSkin.palette[key] = nextHex;
    else delete rawSkin.palette[key];

    if (key === 'belly') {
      rawSkin.regions = rawSkin.regions || [];
      rawSkin.marks = rawSkin.marks || [];
      const isBellyRegion = (r) => r && r.space === 'body' && (
        r._fromBelly ||
        (r._label && /肚皮|胸腹/.test(r._label)) ||
        (prevHex && sameHexRgb(r.fill, prevHex) && !sameHexRgb(r.fill, rawSkin.palette.body))
      );
      const isBellyMark = (m) => m && m.space === 'body' && m.kind === 'polygon' && (
        m._fromBelly ||
        (prevHex && sameHexRgb(m.color, prevHex) && !sameHexRgb(m.color, rawSkin.palette.body))
      );

      if (nextHex) {
        let updated = false;
        for (const r of rawSkin.regions) {
          if (isBellyRegion(r)) {
            r.fill = nextHex;
            r._fromBelly = true;
            updated = true;
          }
        }
        for (const m of rawSkin.marks) {
          if (isBellyMark(m)) {
            m.color = nextHex;
            m._fromBelly = true;
            updated = true;
          }
        }
        if (!updated && !sameHexRgb(nextHex, rawSkin.palette.body)) {
          const bellyReg = Spec.makePresetRegion('whiteBelly', nextHex);
          bellyReg._label = '胸腹底色';
          bellyReg._fromBelly = true;
          // Insert after any full-width base body coat region, but before side patches/spots
          let insertAt = 0;
          for (let i = 0; i < rawSkin.regions.length; i++) {
            const r = rawSkin.regions[i];
            if (r && r.space === 'body' && r.anchors && r.anchors.length) {
              let minX = Infinity, maxX = -Infinity;
              for (const a of r.anchors) {
                if (a.x < minX) minX = a.x;
                if (a.x > maxX) maxX = a.x;
              }
              if (minX < -25 && maxX > 25 && (maxX - minX) > 80) insertAt = i + 1;
            }
          }
          rawSkin.regions.splice(insertAt, 0, bellyReg);
          if (editingRegionIdx >= insertAt) editingRegionIdx++;
        }
      } else {
        for (let i = rawSkin.regions.length - 1; i >= 0; i--) {
          if (isBellyRegion(rawSkin.regions[i])) {
            rawSkin.regions.splice(i, 1);
            if (editingRegionIdx === i) { editingRegionIdx = -1; editModeBanner.hidden = true; }
            else if (editingRegionIdx > i) editingRegionIdx--;
          }
        }
        for (let i = rawSkin.marks.length - 1; i >= 0; i--) {
          if (isBellyMark(rawSkin.marks[i])) rawSkin.marks.splice(i, 1);
        }
      }
    }

    if (key === 'stripes' && nextHex && prevHex && rawSkin.marks && rawSkin.marks.length) {
      for (const m of rawSkin.marks) {
        if (m && (m._fromStripes || sameHexRgb(m.color, prevHex))) {
          m.color = nextHex;
          m._fromStripes = true;
        }
      }
    }

    syncSkin(true);
  }

  function renderPaletteUI() {
    const root = document.getElementById('palette-editor');
    root.innerHTML = '';
    for (const grp of PALETTE_GROUPS) {
      const box = document.createElement('div');
      box.className = 'palette-group';
      box.innerHTML = `<div class="palette-group-title">${grp.title}</div>`;
      const grid = document.createElement('div');
      grid.className = 'palette-grid';

      for (const [key, label, required] of grp.items) {
        const val = rawSkin.palette[key];
        const active = Boolean(val);
        const cell = document.createElement('div');
        cell.className = 'color-cell' + (active ? '' : ' disabled');

        const left = document.createElement('div');
        left.className = 'color-cell-left';
        if (!required) {
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.checked = active;
          chk.addEventListener('change', () => {
            if (chk.checked) {
              const fallbackMap = {
                belly: '#FAF4EA',
                iris: '#D9B252', nose: '#E58D99', mouth: '#9B7F73', pawPads: '#EAA1A7',
                earInner: '#EBB6B0', tailTip: '#35261F', points: '#35261F', pointsMid: '#6A5041',
                outline: '#B8A69266', bodyShade: '#E8DFD1'
              };
              applyPaletteChange(key, fallbackMap[key] || rawSkin.palette.body || '#FAF5EC');
            } else {
              applyPaletteChange(key, null);
            }
          });
          left.appendChild(chk);
        }
        const lbl = document.createElement('label');
        lbl.textContent = label;
        left.appendChild(lbl);

        const right = document.createElement('div');
        right.className = 'color-cell-right';
        const displayHex = active ? val.slice(0, 7) : '#D8C7B4';

        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = Spec.isValidHex(displayHex) ? displayHex : '#D8C7B4';
        picker.addEventListener('input', () => {
          const curVal = rawSkin.palette[key];
          const alphaSuffix = curVal && curVal.length === 9 ? curVal.slice(7, 9) : '';
          applyPaletteChange(key, picker.value.toUpperCase() + alphaSuffix);
        });

        const hexIn = document.createElement('input');
        hexIn.type = 'text';
        hexIn.className = 'hex-input';
        hexIn.value = active ? val.toUpperCase() : '';
        hexIn.placeholder = '默认';
        hexIn.addEventListener('change', () => {
          const v = hexIn.value.trim();
          if (!v && !required) {
            applyPaletteChange(key, null);
          } else if (Spec.isValidHex(v)) {
            applyPaletteChange(key, v.toUpperCase());
          } else {
            showToast('颜色必须是 #RRGGBB 或 #RRGGBBAA');
            hexIn.value = active ? val.toUpperCase() : '';
          }
        });

        right.appendChild(picker);
        right.appendChild(hexIn);
        cell.appendChild(left);
        cell.appendChild(right);
        grid.appendChild(cell);
      }

      box.appendChild(grid);
      root.appendChild(box);
    }
  }

  // --- Shape Tab ---
  const SHAPE_LABELS = [
    ['bodyWidth', '身宽圆润度'],
    ['headScale', '头部大小'],
    ['cheekFullness', '腮帮饱满度'],
    ['neckWidth', '脖子宽度'],
    ['earSize', '耳朵大小'],
    ['earBaseWidth', '耳朵底部宽度'],
    ['earPointiness', '耳尖尖度'],
    ['tailLength', '尾巴长度'],
    ['tailThickness', '尾巴粗细'],
    ['pawStagger', '后爪错落度']
  ];

  function renderShapeUI() {
    const sh = rawSkin.shape || (rawSkin.shape = { build: 'standard' });
    document.querySelectorAll('#build-segmented .seg-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.build === (sh.build || 'standard'));
    });
    document.querySelectorAll('#surface-segmented .seg-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.surface === (rawSkin.headSurface || 'dome'));
    });

    const container = document.getElementById('shape-sliders');
    container.innerHTML = '';
    for (const [key, label] of SHAPE_LABELS) {
      const [lo, hi, def] = Spec.SHAPE_RANGES[key];
      const val = typeof sh[key] === 'number' ? sh[key] : def;
      const row = document.createElement('div');
      row.className = 'slider-row';
      row.innerHTML = `<label>${label}</label><input type="range" min="${lo}" max="${hi}" step="0.02" value="${val}" /><span class="slider-val">${val.toFixed(2)}</span>`;
      const input = row.querySelector('input');
      const valSpan = row.querySelector('.slider-val');
      input.addEventListener('input', () => {
        const nv = parseFloat(input.value);
        rawSkin.shape[key] = nv;
        valSpan.textContent = nv.toFixed(2);
        resolvedSkin = Spec.resolveSkin(rawSkin);
      });
      input.addEventListener('change', () => syncSkin(true));
      container.appendChild(row);
    }
  }

  document.querySelectorAll('#build-segmented .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      rawSkin.shape = rawSkin.shape || {};
      rawSkin.shape.build = btn.dataset.build;
      syncSkin(true);
    });
  });

  document.querySelectorAll('#surface-segmented .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      rawSkin.headSurface = btn.dataset.surface;
      syncSkin(true);
    });
  });

  document.getElementById('btn-reset-shape').addEventListener('click', () => {
    rawSkin.shape = { build: 'standard' };
    rawSkin.headSurface = 'dome';
    syncSkin(true);
    showToast('已恢复默认体型');
  });

  // --- Regions & Marks Tab ---
  const SPACE_NAMES = {
    head: '脸部 head', skull: '头壳 skull · 不随转头', body: '身体 body',
    tail: '尾巴 tail', leftEar: '左耳', rightEar: '右耳',
    leftArm: '左胳膊', rightArm: '右胳膊'
  };

  function makeSkullFixButton(migrate) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mini-btn';
    btn.textContent = '改为随转头';
    btn.title = '头壳花纹转头时不动，眼睛会滑出花纹；改成跟着转头（正脸外观不变）';
    btn.addEventListener('click', () => {
      migrate();
      syncSkin(true);
      showToast('已改为随转头，可以晃晃鼠标看看');
    });
    return btn;
  }

  function renderRegionsAndMarksUI() {}

  const btnCopyJson = document.getElementById('btn-copy-json');
  if (btnCopyJson) {
    btnCopyJson.addEventListener('click', async () => {
      const txt = (document.getElementById('json-preview') || {}).textContent || '';
      try {
        await navigator.clipboard.writeText(txt);
        showToast('已复制 .kurocat JSON 到剪贴板');
      } catch (_) {
        showToast('复制失败，请手动选中复制');
      }
    });
  }

  // --- Accessories & Custom Sticker Upload Tab (配饰装扮) ---
  function selectDecoration(idx) {
    if (pen) exitPen();
    editingRegionIdx = -1;
    editModeBanner.hidden = true;
    selectedDecoIdx = idx;
    decoBanner.hidden = selectedDecoIdx < 0;
    renderDecorationsUI();
  }

  function updateDecoInspectorValues() {
    const inspector = document.getElementById('deco-inspector');
    if (!inspector) return;
    const decos = rawSkin.decorations || [];
    if (selectedDecoIdx < 0 || !decos[selectedDecoIdx]) {
      inspector.hidden = true;
      decoBanner.hidden = true;
      return;
    }
    const d = decos[selectedDecoIdx];
    inspector.hidden = false;
    decoBanner.hidden = false;
    document.getElementById('deco-inspector-title').textContent = `微调：${d._label || `配饰 #${selectedDecoIdx + 1}`}`;
    document.querySelectorAll('#deco-anchor-pills .pill').forEach((b) => {
      b.classList.toggle('active', b.dataset.anchor === d.anchor);
    });
    const ox = Math.round(d.offsetX || 0);
    const oy = Math.round(d.offsetY || 0);
    const sc = typeof d.scale === 'number' ? d.scale : 1;
    const rot = Math.round(d.rotation || 0);
    document.getElementById('deco-offset-x').value = ox;
    document.getElementById('deco-offset-x-val').textContent = ox;
    document.getElementById('deco-offset-y').value = oy;
    document.getElementById('deco-offset-y-val').textContent = oy;
    document.getElementById('deco-scale').value = sc;
    document.getElementById('deco-scale-val').textContent = sc.toFixed(2);
    document.getElementById('deco-rotation').value = rot;
    document.getElementById('deco-rotation-val').textContent = `${rot}°`;
  }

  function renderDecorationsUI() {
    const decos = rawSkin.decorations || (rawSkin.decorations = []);
    const countEl = document.getElementById('decos-count');
    if (countEl) countEl.textContent = `${decos.length} / 8`;
    const dockCountEl = document.getElementById('deco-dock-count');
    if (dockCountEl) dockCountEl.textContent = String(decos.length);
    const decoDrawerBtn = document.getElementById('btn-open-deco-drawer');
    if (decoDrawerBtn) decoDrawerBtn.classList.toggle('active', decos.length > 0);

    const activeList = document.getElementById('decos-active-list');
    if (activeList) {
      activeList.innerHTML = '';
      if (decos.length === 0) {
        activeList.innerHTML = '<div class="layer-empty">小猫还没戴配饰：在下方装扮库点选，或上传自己的透明 PNG / 贴纸</div>';
      } else {
        decos.forEach((d, idx) => {
          const item = document.createElement('div');
          item.className = 'layer-item' + (idx === selectedDecoIdx ? ' editing' : '');

          const meta = document.createElement('div');
          meta.className = 'layer-meta';
          const thumb = document.createElement('div');
          thumb.className = 'deco-item-thumb';
          const img = document.createElement('img');
          img.src = d.png.startsWith('data:') ? d.png : `data:image/png;base64,${d.png}`;
          img.alt = d._label || '配饰';
          thumb.appendChild(img);

          const anchorName = (DecoLib.ANCHOR_META[d.anchor] && DecoLib.ANCHOR_META[d.anchor].label) || d.anchor;
          const txt = document.createElement('div');
          txt.innerHTML = `<div class="layer-title">${d._label || `配饰 #${idx + 1}`}</div><div class="layer-sub">${anchorName} · 缩放 ${(d.scale || 1).toFixed(2)}x</div>`;
          meta.appendChild(thumb);
          meta.appendChild(txt);

          const acts = document.createElement('div');
          acts.className = 'layer-actions';

          if (idx > 0) {
            const upBtn = document.createElement('button');
            upBtn.type = 'button';
            upBtn.className = 'mini-btn';
            upBtn.textContent = '↑';
            upBtn.title = '往底层移';
            upBtn.addEventListener('click', () => {
              const tmp = decos[idx - 1];
              decos[idx - 1] = decos[idx];
              decos[idx] = tmp;
              if (selectedDecoIdx === idx) selectedDecoIdx = idx - 1;
              else if (selectedDecoIdx === idx - 1) selectedDecoIdx = idx;
              syncSkin(true);
            });
            acts.appendChild(upBtn);
          }

          if (idx < decos.length - 1) {
            const downBtn = document.createElement('button');
            downBtn.type = 'button';
            downBtn.className = 'mini-btn';
            downBtn.textContent = '↓';
            downBtn.title = '往顶层移';
            downBtn.addEventListener('click', () => {
              const tmp = decos[idx + 1];
              decos[idx + 1] = decos[idx];
              decos[idx] = tmp;
              if (selectedDecoIdx === idx) selectedDecoIdx = idx + 1;
              else if (selectedDecoIdx === idx + 1) selectedDecoIdx = idx;
              syncSkin(true);
            });
            acts.appendChild(downBtn);
          }

          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'mini-btn' + (idx === selectedDecoIdx ? ' active' : '');
          editBtn.textContent = idx === selectedDecoIdx ? '微调中' : '微调';
          editBtn.addEventListener('click', () => selectDecoration(selectedDecoIdx === idx ? -1 : idx));
          acts.appendChild(editBtn);

          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'mini-btn danger';
          delBtn.textContent = '摘下';
          delBtn.addEventListener('click', () => {
            decos.splice(idx, 1);
            if (selectedDecoIdx === idx) selectedDecoIdx = -1;
            else if (selectedDecoIdx > idx) selectedDecoIdx--;
            syncSkin(true);
          });
          acts.appendChild(delBtn);

          item.appendChild(meta);
          item.appendChild(acts);
          activeList.appendChild(item);
        });
      }
    }

    updateDecoInspectorValues();

    // Built-in Wardrobe Gallery
    const gallery = document.getElementById('deco-gallery');
    if (gallery && DecoLib) {
      const builtins = DecoLib.getBuiltins();
      const filtered = decoFilterCat === 'all' ? builtins : builtins.filter((b) => b.category === decoFilterCat);
      gallery.innerHTML = '';
      for (const b of filtered) {
        const wornIdx = decos.findIndex((d) => d._builtinId === b.id);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'deco-card' + (wornIdx >= 0 ? ' worn' : '');
        const aLabel = (DecoLib.ANCHOR_META[b.anchor] && DecoLib.ANCHOR_META[b.anchor].short) || b.anchor;
        card.innerHTML = `
          <div class="deco-card-thumb"><img src="${b.dataUrl}" alt="${b.name}" /></div>
          <span class="deco-card-name">${b.name}</span>
          <span class="deco-card-tag">${wornIdx >= 0 ? '✓ 已佩戴' : aLabel}</span>
        `;
        card.addEventListener('click', () => {
          if (wornIdx >= 0) {
            decos.splice(wornIdx, 1);
            if (selectedDecoIdx === wornIdx) selectedDecoIdx = -1;
            else if (selectedDecoIdx > wornIdx) selectedDecoIdx--;
            syncSkin(true);
            showToast(`已摘下「${b.name}」`);
            return;
          }
          if (decos.length >= 8) {
            showToast('最多同时佩戴 8 件配饰，请先摘下一件');
            return;
          }
          decos.push({
            _label: b.name,
            _builtinId: b.id,
            _defaultPos: { anchor: b.anchor, offsetX: b.offsetX, offsetY: b.offsetY, scale: b.scale, rotation: b.rotation },
            png: b.png,
            anchor: b.anchor,
            offsetX: b.offsetX,
            offsetY: b.offsetY,
            scale: b.scale,
            rotation: b.rotation
          });
          selectedDecoIdx = decos.length - 1;
          editingRegionIdx = -1;
          editModeBanner.hidden = true;
          if (pen) exitPen();
          syncSkin(true);
          showToast(`已佩戴「${b.name}」，可直接在小猫身上拖动微调`);
        });
        gallery.appendChild(card);
      }
    }
  }

  // Decoration inspector controls
  document.querySelectorAll('#deco-anchor-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (selectedDecoIdx < 0 || !rawSkin.decorations[selectedDecoIdx]) return;
      const d = rawSkin.decorations[selectedDecoIdx];
      d.anchor = btn.dataset.anchor;
      d.offsetX = 0;
      d.offsetY = d.anchor === 'headTop' ? -10 : (d.anchor === 'face' ? -4 : 0);
      syncSkin(true);
    });
  });

  function bindDecoSlider(id, prop, valId, suffix, isFloat) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      if (selectedDecoIdx < 0 || !rawSkin.decorations[selectedDecoIdx]) return;
      const v = isFloat ? parseFloat(el.value) : parseInt(el.value, 10);
      rawSkin.decorations[selectedDecoIdx][prop] = v;
      document.getElementById(valId).textContent = (isFloat ? v.toFixed(2) : v) + (suffix || '');
      resolvedSkin = Spec.resolveSkin(rawSkin);
    });
    el.addEventListener('change', () => syncSkin(true));
  }
  bindDecoSlider('deco-offset-x', 'offsetX', 'deco-offset-x-val', '', false);
  bindDecoSlider('deco-offset-y', 'offsetY', 'deco-offset-y-val', '', false);
  bindDecoSlider('deco-scale', 'scale', 'deco-scale-val', '', true);
  bindDecoSlider('deco-rotation', 'rotation', 'deco-rotation-val', '°', false);

  document.getElementById('btn-deco-center').addEventListener('click', () => {
    if (selectedDecoIdx < 0 || !rawSkin.decorations[selectedDecoIdx]) return;
    rawSkin.decorations[selectedDecoIdx].offsetX = 0;
    syncSkin(true);
  });

  document.getElementById('btn-deco-reset').addEventListener('click', () => {
    if (selectedDecoIdx < 0 || !rawSkin.decorations[selectedDecoIdx]) return;
    const d = rawSkin.decorations[selectedDecoIdx];
    const def = d._defaultPos || { anchor: d.anchor, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
    d.anchor = def.anchor;
    d.offsetX = def.offsetX;
    d.offsetY = def.offsetY;
    d.scale = def.scale;
    d.rotation = def.rotation;
    syncSkin(true);
    showToast('已重置配饰位置');
  });

  document.getElementById('btn-clear-decos').addEventListener('click', () => {
    if (!rawSkin.decorations || rawSkin.decorations.length === 0) return;
    rawSkin.decorations = [];
    selectedDecoIdx = -1;
    decoBanner.hidden = true;
    syncSkin(true);
    showToast('已摘下全部配饰');
  });

  document.querySelectorAll('#deco-category-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#deco-category-pills .pill').forEach((b) => b.classList.toggle('active', b === btn));
      decoFilterCat = btn.dataset.cat;
      renderDecorationsUI();
    });
  });

  // Custom Sticker Upload Dropzone
  const decoUploadZone = document.getElementById('deco-upload-zone');
  const decoFileInput = document.getElementById('deco-file-input');

  async function handleDecorationUpload(file) {
    rawSkin.decorations = rawSkin.decorations || [];
    if (rawSkin.decorations.length >= 8) {
      showToast('最多同时佩戴 8 件配饰，请先摘下一件');
      return;
    }
    const anchor = document.getElementById('deco-upload-anchor').value || 'headTop';
    const removeBg = document.getElementById('deco-upload-remove-bg').checked;
    try {
      const deco = await DecoLib.processUploadedFile(file, { anchor, removeBg });
      deco._defaultPos = { anchor: deco.anchor, offsetX: deco.offsetX, offsetY: deco.offsetY, scale: deco.scale, rotation: deco.rotation };
      rawSkin.decorations.push(deco);
      selectedDecoIdx = rawSkin.decorations.length - 1;
      editingRegionIdx = -1;
      editModeBanner.hidden = true;
      if (pen) exitPen();
      syncSkin(true);
      showToast(`已上传并佩戴「${deco._label}」，拖动可调位置与大小`);
    } catch (err) {
      showToast(err.message || '上传配饰失败');
    }
  }

  document.getElementById('btn-upload-deco').addEventListener('click', (e) => {
    e.stopPropagation();
    decoFileInput.click();
  });
  decoUploadZone.addEventListener('click', () => decoFileInput.click());
  decoFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) handleDecorationUpload(e.target.files[0]);
    e.target.value = '';
  });
  ['dragenter', 'dragover'].forEach((ev) => {
    decoUploadZone.addEventListener(ev, (e) => {
      e.preventDefault();
      decoUploadZone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    decoUploadZone.addEventListener(ev, (e) => {
      e.preventDefault();
      decoUploadZone.classList.remove('dragover');
    });
  });
  decoUploadZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleDecorationUpload(file);
  });

  // --- 60fps Interactive Animation Loop ---
  let lastTs = performance.now();
  function lerp(a, b, k) {
    return a + (b - a) * k;
  }

  function tick(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    animState.time += dt;

    const nowMs = performance.now();
    // Auto-engage scruff drag if pointer held steadily on the cat for > 150ms
    if (live.draggingCat && !live.draggingCat.engaged && nowMs - live.draggingCat.downTime > 150) {
      live.draggingCat.engaged = true;
      setCatDragClasses(true);
    }

    const isDraggingNow = !!(live.draggingCat && live.draggingCat.engaged) || currentPose === 'drag';
    const isEditingNow = editingRegionIdx >= 0 || !!pen || !!draggingDeco;

    // Smoothly apply / spring-return the page-level drag translation of the cat canvas (in hero mode only; floating mode repositions .stage-column directly)
    if (!isFloatingPetMode() && live.draggingCat && live.draggingCat.engaged) {
      catCanvas.style.transform = `translate3d(${live.dragOffsetX.toFixed(1)}px, ${live.dragOffsetY.toFixed(1)}px, 0)`;
    } else if (!isFloatingPetMode() && (Math.abs(live.dragOffsetX) > 0.4 || Math.abs(live.dragOffsetY) > 0.4)) {
      const springK = Math.min(1, dt * 13);
      live.dragOffsetX = lerp(live.dragOffsetX, 0, springK);
      live.dragOffsetY = lerp(live.dragOffsetY, 0, springK);
      catCanvas.style.transform = `translate3d(${live.dragOffsetX.toFixed(1)}px, ${live.dragOffsetY.toFixed(1)}px, 0)`;
    } else if (catCanvas.style.transform) {
      live.dragOffsetX = 0;
      live.dragOffsetY = 0;
      catCanvas.style.transform = '';
      setCatDragClasses(false);
    }
    if (isFloatingPetMode() && !(live.draggingCat && live.draggingCat.engaged)) {
      setCatDragClasses(false);
    }

    // Decay live petting & hunting energy
    live.petHead = Math.max(0, live.petHead - dt * 0.55);
    live.petBody = Math.max(0, live.petBody - dt * 0.55);
    live.huntEnergy = Math.max(0, live.huntEnergy - dt * 0.85);

    const activeSkinForTick = penPreviewSkin || resolvedSkin;
    const isDouniTick = activeSkinForTick && (activeSkinForTick.renderStyle === 'douni' || activeSkinForTick.typingStyle === 'douni');

    // Keep held physical keys glowing & update paws
    const heldCaps = Array.from(pressedKeyCaps.values());
    for (const cap of heldCaps) {
      animState.keyGlow[cap.id] = 1.0;
    }

    // Decay released key glow
    for (const k of Object.keys(animState.keyGlow)) {
      const stillHeld = heldCaps.some((c) => c.id === k);
      if (!stillHeld) {
        animState.keyGlow[k] = Math.max(0, animState.keyGlow[k] - dt * 3.8);
        if (animState.keyGlow[k] <= 0.01) delete animState.keyGlow[k];
      }
    }

    // Tail wag speed responds to live hunting excitement
    const liveHunting = live.huntEnergy > 0.25 || currentPose === 'hunt';
    if (!isEditingNow) animState.tailPhase += dt * (liveHunting ? 5.2 : 2.2);

    // Idle sleepiness after 18s without input (wakes immediately on any key/mouse activity)
    const idleSec = (nowMs - live.lastActivity) / 1000;
    const isLiveSleeping = !isEditingNow && !isDraggingNow && heldCaps.length === 0 && idleSec > 18;

    // Natural blinking when awake & not pet-closed
    if (!isLiveSleeping && live.petHead < 0.35 && currentPose !== 'petHead' && currentPose !== 'sleep') {
      if (animState.time >= nextBlinkAt) {
        const elapsed = animState.time - nextBlinkAt;
        if (elapsed < 0.08) animState.blinkProgress = elapsed / 0.08;
        else if (elapsed < 0.17) animState.blinkProgress = 1 - (elapsed - 0.08) / 0.09;
        else {
          animState.blinkProgress = 0;
          nextBlinkAt = animState.time + 2.6 + Math.random() * 2.8;
        }
      }
    } else {
      animState.blinkProgress = lerp(animState.blinkProgress, 0, dt * 10);
    }

    // Live pose targets
    let tYaw = pointerTarget.active ? pointerTarget.yaw : Math.sin(animState.time * 0.7) * 0.12;
    let tPitch = pointerTarget.active ? pointerTarget.pitch : 0;
    let tGazeX = pointerTarget.active ? pointerTarget.gazeX : Math.sin(animState.time * 0.7) * 0.15;
    let tGazeY = pointerTarget.active ? pointerTarget.gazeY : 0;
    let tHunt = 0, tPetH = 0, tPetB = 0, tSleep = 0, tEarFold = 0, tHind = 0, tSquash = 1, tHeadY = 0;

    let effectivePose = 'idle';
    animState.tailTypingTarget = 0;
    if (isEditingNow) {
      tYaw = 0; tPitch = 0; tGazeX = 0; tGazeY = 0;
    } else if (isDraggingNow) {
      effectivePose = 'drag';
      tYaw = 0; tPitch = 0;
      animState.leftPawActive = false;
      animState.rightPawActive = false;
    } else if (currentPose !== 'idle') {
      effectivePose = currentPose;
      if (currentPose === 'hunt') { tHunt = 1; tSquash = 0.90; tHeadY = 8; tEarFold = 0.45; }
      else if (currentPose === 'petHead') {
        tPetH = 1; tEarFold = 0.78; tSquash = 0.95; tHeadY = 3;
        animState.leftPawActive = false; animState.rightPawActive = false;
      } else if (currentPose === 'petBody') {
        tPetB = 0.85; tEarFold = 0.45; tSquash = 0.96;
      } else if (currentPose === 'sleep') {
        tSleep = 1; tPitch = 0.35; tHeadY = 6; tEarFold = 0.32;
        animState.leftPawActive = false; animState.rightPawActive = false;
      } else if (currentPose === 'dizzy') {
        tYaw = 0; tPitch = 0; tEarFold = 0.36;
        animState.leftPawActive = false; animState.rightPawActive = false;
      } else if (currentPose === 'hindFoot') {
        // 3-key hind foot kick + 4-key tail typing combo demo (uncrossed for clear leg visibility!)
        tHind = 1;
        animState.hindFoot = Renderer.screenQuadPoint(0.76, 0.58);
        if (!isDouniTick) {
          animState.leftPaw = Renderer.screenQuadPoint(0.24, 0.54);
          animState.rightPaw = Renderer.screenQuadPoint(0.48, 0.42);
          animState.leftPawActive = true;
          animState.rightPawActive = true;
          animState.tailTypingTarget = 1;
          animState.tailTipGoal = Renderer.screenQuadPoint(0.90, 0.34);
          animState.keyGlow['2_3'] = 0.9;
          animState.keyGlow['1_6'] = 0.9;
          animState.keyGlow['2_10'] = 0.9;
          animState.keyGlow['1_12'] = 0.9;
        }
      } else if (currentPose === 'typing') {
        typingTimer += dt;
        if (typingTimer > (isDouniTick ? 0.17 : 0.22)) { typingTimer = 0; triggerRandomKeyTap(); }
        tPitch = 0.28;
      } else if (currentPose === 'anger') {
        typingTimer += dt;
        if (typingTimer > 0.12) { typingTimer = 0; triggerRandomKeyTap(); }
        tPitch = 0.26;
        tSquash = 0.95;
        tEarFold = 0.26;
      } else if (currentPose === 'tablet') {
        tYaw = -0.22;
        tPitch = 0.22;
        animState.rightPawActive = false;
      }
    } else {
      // Full live interactive mode!
      const recentKey = heldCaps.length > 0 || (nowMs - live.lastKeyTime < 220);
      const recentMouse = nowMs - live.lastMouseClickTime < 340;
      if (recentKey) {
        effectivePose = 'typing';
        tPitch = Math.max(tPitch, 0.22);
        tSquash = 0.97;
      }
      if (!recentKey && !recentMouse) {
        animState.leftPawActive = false;
        animState.rightPawActive = false;
      } else if (recentMouse && !recentKey) {
        animState.rightPawActive = false;
      }
      // 3+ simultaneous keys -> 3rd hind foot kick easter egg!
      if (heldCaps.length >= 3 && !isDouniTick) {
        const thirdCap = heldCaps[2];
        const su = 1 - (thirdCap.xUnits + thirdCap.widthUnits * 0.5);
        const sv = 1 - (thirdCap.row + 0.5) / 5;
        animState.hindFoot = Renderer.screenQuadPoint(su, sv);
        tHind = 1;
      }
      // 4+ simultaneous keys -> tail sweeps forward to press the 4th key!
      if (heldCaps.length >= 4 && !isDouniTick) {
        const fourthCap = heldCaps[3];
        const su4 = 1 - (fourthCap.xUnits + fourthCap.widthUnits * 0.5);
        const sv4 = 1 - (fourthCap.row + 0.5) / 5;
        animState.tailTipGoal = Renderer.screenQuadPoint(su4, sv4);
        animState.tailTypingTarget = 1;
      }
      // Petting
      if (live.petHead > 0.08) {
        tPetH = live.petHead;
        tEarFold = Math.max(tEarFold, live.petHead * 0.78);
        tSquash = Math.min(tSquash, 1 - live.petHead * 0.05);
        tHeadY = Math.max(tHeadY, live.petHead * 3);
      }
      if (live.petBody > 0.08) {
        tPetB = live.petBody;
        tEarFold = Math.max(tEarFold, live.petBody * 0.45);
        tSquash = Math.min(tSquash, 1 - live.petBody * 0.04);
      }
      // Hunting boba eyes on rapid mouse shake
      if (live.huntEnergy > 0.12 && live.petHead < 0.25) {
        tHunt = live.huntEnergy;
        tSquash = Math.min(tSquash, 1 - live.huntEnergy * 0.10);
        tHeadY = Math.max(tHeadY, live.huntEnergy * 7);
        tEarFold = Math.max(tEarFold, live.huntEnergy * 0.45);
      }
      // Natural idle nap
      if (isLiveSleeping) {
        tSleep = Math.min(1, (idleSec - 18) / 3.0);
        tPitch = 0.35 * tSleep;
        tHeadY = 6 * tSleep;
        tEarFold = 0.32 * tSleep;
      }
    }

    const k = Math.min(1, dt * 9);
    animState.headYaw = lerp(animState.headYaw, tYaw, k);
    animState.headPitch = lerp(animState.headPitch, tPitch, k);
    animState.headTilt = lerp(animState.headTilt, tYaw * 0.06, k);
    animState.bodyTilt = lerp(animState.bodyTilt, tYaw * 0.04, k);
    animState.eyeGazeX = lerp(animState.eyeGazeX, tGazeX, k);
    animState.eyeGazeY = lerp(animState.eyeGazeY, tGazeY, k);
    animState.huntIntensity = lerp(animState.huntIntensity, tHunt, k);
    animState.petHead = lerp(animState.petHead, tPetH, k);
    animState.petBody = lerp(animState.petBody, tPetB, k);
    animState.sleepiness = lerp(animState.sleepiness, tSleep, k);
    animState.earFold = lerp(animState.earFold, tEarFold, k);
    animState.earTwitch = lerp(animState.earTwitch, 0, dt * 7);
    animState.bodySquash = lerp(animState.bodySquash, tSquash, k);
    animState.headOffsetY = lerp(animState.headOffsetY, tHeadY, k);
    animState.hindFootActive = lerp(animState.hindFootActive, tHind, k);
    animState.mouseOffsetX = lerp(animState.mouseOffsetX, 0, dt * 4);
    animState.mouseOffsetY = lerp(animState.mouseOffsetY, 0, dt * 4);

    const freezeForRegion = editingRegionIdx >= 0 || !!pen;
    Renderer.stepPhysicsExtras(animState, activeSkinForTick, freezeForRegion ? 'idle' : (effectivePose === 'idle' && currentPose !== 'idle' ? currentPose : effectivePose), dt);

    if (!animState.leftPawActive) {
      animState.leftPaw.x = lerp(animState.leftPaw.x, Renderer.LEFT_PAW_REST.x, k);
      animState.leftPaw.y = lerp(animState.leftPaw.y, Renderer.LEFT_PAW_REST.y, k);
    }
    if (!animState.rightPawActive) {
      animState.rightPaw.x = lerp(animState.rightPaw.x, Renderer.RIGHT_PAW_REST.x, k);
      animState.rightPaw.y = lerp(animState.rightPaw.y, Renderer.RIGHT_PAW_REST.y, k);
    }

    lastRenderTransforms = Renderer.drawScene(catCtx, penPreviewSkin || resolvedSkin, animState, {
      kbTheme,
      eyeTheme,
      whiteOutline: showWhiteOutline,
      editRegion: editingRegionIdx >= 0 ? rawSkin.regions[editingRegionIdx] : null,
      editDecorationIndex: selectedDecoIdx,
      skeletonOverlay: window.KuroExplodedStudio ? window.KuroExplodedStudio.getSkeletonOverlayState() : null,
      pen: pen ? {
        space: pen.space,
        anchors: pen.anchors,
        stage: pen.stage,
        hover: pen.stage === 'draw' && !pen.drag ? pen.hover : null,
        closeHint: pen.closeHint,
        ends: pen.ends,
        mirror: pen.mirror,
        freehand: pen.freehand && pen.freehand.length ? pen.freehand : null,
        freehandClosed: pen.mode === 'brushFill'
      } : null
    });

    requestAnimationFrame(tick);
  }

  function switchTab(target) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === target));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${target}`));
  }

  // Expose helper API for Plaza integration, automated testing & quick debugging
  window.KuroWorkshopAPI = {
    getRawSkin: () => rawSkin,
    getResolvedSkin: () => resolvedSkin,
    applyPaletteChange,
    getExportObject: () => buildExportObjectWithPreview(),
    getExportJson: () => JSON.stringify(buildExportObjectWithPreview(), null, 2),
    loadExternalSkin: (specObj, badgeText) => {
      const check = Spec.validateRawSkin(specObj);
      if (!check.ok) {
        showToast('载入失败：' + check.error);
        return false;
      }
      loadAndRasterizeSkin(deepClone(specObj), badgeText || `广场皮肤 · ${specObj.name}`, `已在工坊打开「${specObj.name}」并生成透明纸图层`);
      return true;
    },
    addExternalDecoration: (decoObj) => {
      rawSkin.decorations = rawSkin.decorations || [];
      if (rawSkin.decorations.length >= 8) {
        showToast('最多同时佩戴 8 件配饰，请先在配饰装扮中摘下一件');
        return false;
      }
      if (pen) exitPen();
      const item = deepClone(decoObj);
      item._defaultPos = {
        anchor: item.anchor || 'headTop',
        offsetX: item.offsetX || 0,
        offsetY: item.offsetY || 0,
        scale: item.scale || 1,
        rotation: item.rotation || 0
      };
      rawSkin.decorations.push(item);
      selectedDecoIdx = rawSkin.decorations.length - 1;
      editingRegionIdx = -1;
      editModeBanner.hidden = true;
      decoBanner.hidden = false;
      syncSkin(true);
      if (window.KuroExplodedStudio && typeof window.KuroExplodedStudio.openDrawer === 'function') {
        window.KuroExplodedStudio.openDrawer('accessories');
      } else {
        switchTab('decorations');
      }
      showToast(`已为当前小猫佩戴「${item._label || '广场饰品'}」，可直接拖动微调！`);
      return true;
    },
    switchTab,
    showToast,
    commitHistoryNow,
    getRawSkin: () => rawSkin,
    getResolvedSkin: () => resolvedSkin,
    syncSkin: (pushHist, syncOpts) => syncSkin(pushHist, syncOpts),
    refreshFloatingPet: applyFloatingPetLayout,
    undo: () => { const b = document.getElementById('btn-undo'); if (b && !b.disabled) b.click(); },
    redo: () => { const b = document.getElementById('btn-redo'); if (b && !b.disabled) b.click(); },
    exportSkin: () => { const b = document.getElementById('btn-export'); if (b) b.click(); },
    getEyeTheme: () => eyeTheme,
    setPose: (p) => { setWorkshopPose(p || 'idle'); },
    getKeyboardThemeId: () => kbTheme,
    applyKeyboardTheme: (id, label, colors) => {
      if (!id || !colors) return false;
      Renderer.registerKeyboardTheme(id, colors);
      const sel = document.getElementById('keyboard-theme-select');
      if (sel) {
        let opt = Array.from(sel.options).find((o) => o.value === id);
        if (!opt) {
          opt = document.createElement('option');
          opt.value = id;
          opt.textContent = `广场 · ${label || id}`;
          sel.appendChild(opt);
        }
        sel.value = id;
      }
      kbTheme = id;
      showToast(`已应用键盘配色「${label || id}」`);
      return true;
    },
    // face (optional): { noseX, noseY, cheek } as fractions of the image width/height/width
    analyzeImageUrl: (url, name, overrides, face) => new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        photoImg = img;
        photoFilename = name || 'cat.jpg';
        if (face) {
          const iw = img.naturalWidth, ih = img.naturalHeight, r = face.cheek * iw;
          photoCrop = cropFromFace(img, face.noseX * iw, face.noseY * ih - NOSE_BELOW * r, r);
        } else {
          photoCrop = defaultPhotoCrop(img);
        }
        setFramingStep('framed');
        if (overrides) Object.assign(photoOpts, overrides);
        document.getElementById('dropzone-empty').hidden = true;
        document.getElementById('photo-workspace').hidden = false;
        drawPhotoWorkspace();
        runPhotoAnalysis(true);
        resolve(window.KuroWorkshopAPI.getExportJson());
      };
      img.onerror = reject;
      img.src = url;
    })
  };

  function setWorkshopPose(pose) {
    currentPose = pose || 'idle';
    live.lastActivity = performance.now();
    if (currentPose === 'idle') {
      animState._dizzyTimer = 0;
      animState._fastMouseDuration = 0;
    }
    const bar = document.getElementById('stage-pose-bar');
    if (bar) {
      bar.querySelectorAll('.pose-pill[data-pose]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.pose === currentPose);
      });
    }
  }

  const btnWhiteOutline = document.getElementById('btn-toggle-white-outline');
  if (btnWhiteOutline) {
    btnWhiteOutline.addEventListener('click', () => {
      showWhiteOutline = !showWhiteOutline;
      btnWhiteOutline.classList.toggle('active', showWhiteOutline);
      renderTurnCheck();
    });
  }

  // 转头检查: left turn / front / right turn side by side at the desktop pet's full yaw (headYaw ±1),
  // so patterns that don't follow the head (e.g. legacy 头壳) show up without wiggling the mouse.
  // (syncSkin calls renderTurnCheck, possibly before this point runs, so it looks everything up itself.)
  function renderTurnCheck() {
    const modal = document.getElementById('turn-check-modal');
    const turnCheck = document.getElementById('turn-check');
    if (!modal || modal.hidden || !turnCheck) return;
    if (!renderTurnCheck.scratch) {
      renderTurnCheck.scratch = document.createElement('canvas');
      renderTurnCheck.scratch.width = 720;
      renderTurnCheck.scratch.height = 640;
    }
    const turnScratch = renderTurnCheck.scratch;
    const skin = penPreviewSkin || resolvedSkin;
    const sctx = turnScratch.getContext('2d');
    turnCheck.querySelectorAll('canvas').forEach((cv, i) => {
      const yaw = [-1, 0, 1][i];
      const st = Renderer.createDefaultState();
      st.headYaw = yaw;
      st.eyeGazeX = yaw;
      Renderer.drawScene(sctx, skin, st, { kbTheme, eyeTheme, whiteOutline: showWhiteOutline });
      const c = cv.getContext('2d');
      c.clearRect(0, 0, cv.width, cv.height);
      c.drawImage(turnScratch, 168, 12, 400, 400, 0, 0, cv.width, cv.height);
    });
  }

  const turnCheckModal = document.getElementById('turn-check-modal');
  const openTurnCheckModal = () => {
    if (!turnCheckModal) return;
    turnCheckModal.hidden = false;
    renderTurnCheck();
  };
  const closeTurnCheckModal = () => {
    if (turnCheckModal) turnCheckModal.hidden = true;
  };
  const btnTurnCheck = document.getElementById('btn-turn-check');
  const btnTurnCheckHero = document.getElementById('btn-turn-check-hero');
  const btnCloseTurnCheck = document.getElementById('btn-close-turn-check');
  if (btnTurnCheck) btnTurnCheck.addEventListener('click', openTurnCheckModal);
  if (btnTurnCheckHero) btnTurnCheckHero.addEventListener('click', openTurnCheckModal);
  if (btnCloseTurnCheck) btnCloseTurnCheck.addEventListener('click', closeTurnCheckModal);
  if (turnCheckModal) {
    turnCheckModal.addEventListener('click', (e) => { if (e.target === turnCheckModal) closeTurnCheckModal(); });
  }

  // Floating desktop pet toolbar, resize handle, settings popover, and minimize bubble
  (() => {
    const resizeBtn = document.getElementById('btn-pet-resize');
    const settingsBtn = document.getElementById('btn-pet-settings');
    const settingsPop = document.getElementById('floating-pet-settings');
    const minBtn = document.getElementById('btn-pet-minimize');
    const bubble = document.getElementById('floating-pet-bubble');
    const smallerBtn = document.getElementById('btn-pet-smaller');
    const largerBtn = document.getElementById('btn-pet-larger');
    const resetPosBtn = document.getElementById('btn-pet-reset-pos');

    if (settingsBtn && settingsPop) {
      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPop.hidden = !settingsPop.hidden;
        settingsBtn.classList.toggle('active', !settingsPop.hidden);
        if (stageColumn) stageColumn.classList.toggle('is-floating-active', !settingsPop.hidden);
      });
      document.addEventListener('click', (e) => {
        if (!settingsPop.hidden && !settingsPop.contains(e.target) && e.target !== settingsBtn) {
          settingsPop.hidden = true;
          settingsBtn.classList.remove('active');
          if (stageColumn) stageColumn.classList.remove('is-floating-active');
        }
      });
    }

    if (minBtn) {
      minBtn.addEventListener('click', () => {
        petLayout.minimized = true;
        if (settingsPop) settingsPop.hidden = true;
        applyFloatingPetLayout();
        savePetLayout();
      });
    }
    if (bubble) {
      bubble.addEventListener('click', () => {
        petLayout.minimized = false;
        applyFloatingPetLayout();
        savePetLayout();
      });
    }
    if (smallerBtn) {
      smallerBtn.addEventListener('click', () => {
        petLayout.width = Spec.clamp(petLayout.width - 28, 136, 480);
        applyFloatingPetLayout();
        savePetLayout();
      });
    }
    if (largerBtn) {
      largerBtn.addEventListener('click', () => {
        petLayout.width = Spec.clamp(petLayout.width + 28, 136, 480);
        applyFloatingPetLayout();
        savePetLayout();
      });
    }
    if (resetPosBtn) {
      resetPosBtn.addEventListener('click', () => {
        petLayout = defaultPetLayout();
        applyFloatingPetLayout();
        savePetLayout();
      });
    }

    if (resizeBtn) {
      let resizing = null;
      resizeBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const r = stageColumn.getBoundingClientRect();
        resizing = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startW: r.width };
        resizeBtn.setPointerCapture(e.pointerId);
        stageColumn.classList.add('is-floating-active');
      });
      resizeBtn.addEventListener('pointermove', (e) => {
        if (!resizing || e.pointerId !== resizing.pointerId) return;
        const delta = Math.max(e.clientX - resizing.startX, (e.clientY - resizing.startY) * (360 / 320));
        petLayout.width = Spec.clamp(resizing.startW + delta, 136, 480);
        applyFloatingPetLayout();
      });
      const finishResize = (e) => {
        if (!resizing || e.pointerId !== resizing.pointerId) return;
        resizing = null;
        stageColumn.classList.remove('is-floating-active');
        savePetLayout();
      };
      resizeBtn.addEventListener('pointerup', finishResize);
      resizeBtn.addEventListener('pointercancel', finishResize);
    }

    if (stageColumn) {
      stageColumn.addEventListener('wheel', (e) => {
        if (!isFloatingPetMode() || !(e.ctrlKey || e.altKey)) return;
        e.preventDefault();
        petLayout.width = Spec.clamp(petLayout.width + (e.deltaY < 0 ? 18 : -18), 136, 480);
        applyFloatingPetLayout();
        savePetLayout();
      }, { passive: false });
      window.addEventListener('resize', () => {
        if (isFloatingPetMode()) applyFloatingPetLayout();
      });
    }
  })();

  // Boot: restore local IndexedDB multi-layer project if present, otherwise rasterize default preset
  if (PixelLayers) {
    PixelLayers.setRawSkinGetter(() => rawSkin);
    PixelLayers.onChange(() => updateHistoryButtons());
    PixelLayers.rasterizeFromSkin(rawSkin, resolvedSkin, eyeTheme, true);
    PixelLayers.loadFromIndexedDB().then(async (savedProj) => {
      if (savedProj && savedProj.parts) {
        if (savedProj.skin && Spec.validateRawSkin(savedProj.skin).ok) {
          rawSkin = savedProj.skin;
          if (!rawSkin.decorations) rawSkin.decorations = [];
          if (!rawSkin.shape) rawSkin.shape = { build: 'standard' };
        }
        await PixelLayers.restoreProject(savedProj);
        syncSkin();
        commitHistoryNow();
      }
    });
  }
  syncSkin();
  commitHistoryNow();
  updateHistoryButtons();
  loadTemplatesUI();

  // v1.6.0 Changelog Modal (auto-shown once per release, reopenable from top bar or help popover)
  (() => {
    const CHANGELOG_VERSION = '1.6.0';
    const CHANGELOG_SEEN_KEY = 'kurocat.workshop.seenChangelogVersion';
    const modal = document.getElementById('changelog-modal');
    const btnOpen = document.getElementById('btn-open-changelog');
    const btnHelpOpen = document.getElementById('btn-help-open-changelog');
    const btnClose = document.getElementById('btn-close-changelog');
    const btnAck = document.getElementById('btn-changelog-ack');
    const helpPop = document.getElementById('help-popover');

    const openChangelog = () => {
      if (!modal) return;
      if (helpPop) helpPop.hidden = true;
      modal.hidden = false;
    };
    const closeChangelog = (markSeen = true) => {
      if (!modal) return;
      modal.hidden = true;
      if (markSeen) {
        try { localStorage.setItem(CHANGELOG_SEEN_KEY, CHANGELOG_VERSION); } catch (_) {}
      }
    };

    if (btnOpen) btnOpen.addEventListener('click', openChangelog);
    if (btnHelpOpen) btnHelpOpen.addEventListener('click', openChangelog);
    if (btnClose) btnClose.addEventListener('click', () => closeChangelog(true));
    if (btnAck) btnAck.addEventListener('click', () => closeChangelog(true));
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeChangelog(true);
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && !modal.hidden) closeChangelog(true);
    });

    try {
      if (localStorage.getItem(CHANGELOG_SEEN_KEY) !== CHANGELOG_VERSION) {
        setTimeout(openChangelog, 120);
      }
    } catch (_) {}
  })();

  requestAnimationFrame(tick);
})();
