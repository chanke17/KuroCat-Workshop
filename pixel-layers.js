/* KuroCat 1.6.0 True PS-Style Transparent Pixel-Layer Engine & IndexedDB Project Store */
(function (global) {
  'use strict';

  const Spec = global.KuroSpec;
  const Renderer = global.KuroRenderer;
  const clamp = Spec.clamp;

  const PART_KEYS = Spec.PART_TEXTURE_KEYS.slice();
  const PART_SPECS = Spec.PART_TEXTURE_SPECS;

  const BLEND_MODES = [
    { id: 'normal', label: '正常', op: 'source-over' },
    { id: 'multiply', label: '正片叠底', op: 'multiply' },
    { id: 'screen', label: '滤色', op: 'screen' },
    { id: 'overlay', label: '叠加', op: 'overlay' }
  ];

  const DB_NAME = 'KuroCatWorkshopDB_v2';
  const DB_STORE = 'projects';
  const DB_KEY = 'current';

  let idSeq = 1;
  function nextLayerId() {
    return 'pl_' + (idSeq++) + '_' + Date.now().toString(36);
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function blendOpOf(mode) {
    for (let i = 0; i < BLEND_MODES.length; i++) {
      if (BLEND_MODES[i].id === mode) return BLEND_MODES[i].op;
    }
    return 'source-over';
  }

  function rgbaCss(c, alphaMul) {
    return Spec.rgbaToCss(c, alphaMul);
  }

  // Coordinate mapping between canonical part-space and texture pixels
  function partToTex(texKey, pt) {
    const sp = PART_SPECS[texKey];
    if (!sp) return { x: 0, y: 0 };
    return {
      x: ((pt.x - sp.x0) / (sp.x1 - sp.x0)) * sp.width,
      y: ((pt.y - sp.y0) / (sp.y1 - sp.y0)) * sp.height
    };
  }

  function texToPart(texKey, px, py) {
    const sp = PART_SPECS[texKey];
    if (!sp) return { x: 0, y: 0 };
    return {
      x: sp.x0 + (px / sp.width) * (sp.x1 - sp.x0),
      y: sp.y0 + (py / sp.height) * (sp.y1 - sp.y0)
    };
  }

  // --- Engine State ---
  const parts = {};
  const liveCanvasMap = {};
  const liveRevMap = {};
  let options = {
    hideDefaultPupil: false,
    hideDefaultNose: true,
    hideDefaultMouth: true
  };

  // Scratch canvases reused during compositing (per size)
  const scratchA = {};
  const scratchB = {};
  function getScratch(map, w, h) {
    const k = w + 'x' + h;
    if (!map[k]) map[k] = makeCanvas(w, h);
    const c = map[k];
    c.getContext('2d').clearRect(0, 0, w, h);
    return c;
  }

  // Active floating transform/import buffer per part (rendered live on active layer!)
  let floatingTransform = null;
  // {
  //   texKey, layerId, kind: 'selection' | 'import',
  //   srcCanvas, origLayerImageData, maskPoly (in tex px),
  //   cx, cy, w, h, scaleX, scaleY, rot (rad)
  // }

  // Undo / Redo history
  const MAX_HISTORY = 55;
  const undoStack = [];
  const redoStack = [];
  let changeListeners = [];
  let saveTimer = null;
  let skinSignatureLoaded = null;

  function initPart(texKey) {
    const sp = PART_SPECS[texKey];
    const comp = makeCanvas(sp.width, sp.height);
    const layer = {
      id: nextLayerId(),
      name: '图层 1',
      visible: true,
      opacity: 1.0,
      blendMode: 'normal',
      clipToBelow: false,
      alphaLock: false,
      canvas: makeCanvas(sp.width, sp.height)
    };
    parts[texKey] = {
      texKey,
      width: sp.width,
      height: sp.height,
      layers: [layer],
      activeLayerId: layer.id,
      compositeCanvas: comp,
      rev: 1
    };
    liveCanvasMap[texKey] = null;
    liveRevMap[texKey] = 1;
  }

  for (let i = 0; i < PART_KEYS.length; i++) {
    initPart(PART_KEYS[i]);
  }

  function getPart(texKey) {
    return parts[texKey] || null;
  }

  function getLayers(texKey) {
    const p = parts[texKey];
    return p ? p.layers : [];
  }

  function getActiveLayer(texKey) {
    const p = parts[texKey];
    if (!p || !p.layers.length) return null;
    for (let i = 0; i < p.layers.length; i++) {
      if (p.layers[i].id === p.activeLayerId) return p.layers[i];
    }
    p.activeLayerId = p.layers[p.layers.length - 1].id;
    return p.layers[p.layers.length - 1];
  }

  function setActiveLayer(texKey, layerId) {
    const p = parts[texKey];
    if (!p) return null;
    if (floatingTransform && floatingTransform.texKey === texKey && floatingTransform.layerId !== layerId) {
      commitFloatingTransform();
    }
    for (let i = 0; i < p.layers.length; i++) {
      if (p.layers[i].id === layerId) {
        p.activeLayerId = layerId;
        emitChange('layer-select');
        return p.layers[i];
      }
    }
    return getActiveLayer(texKey);
  }

  function isCanvasNonEmpty(c) {
    if (!c || !c.width || !c.height) return false;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  }

  function drawFloatingIntoCtx(ctx, ft) {
    ctx.save();
    ctx.translate(ft.cx, ft.cy);
    ctx.rotate(ft.rot || 0);
    ctx.scale(ft.scaleX || 1, ft.scaleY || 1);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(ft.srcCanvas, -ft.w * 0.5, -ft.h * 0.5, ft.w, ft.h);
    ctx.restore();
  }

  function getLayerRenderSource(texKey, layer) {
    if (!floatingTransform || floatingTransform.texKey !== texKey || floatingTransform.layerId !== layer.id) {
      return layer.canvas;
    }
    const p = parts[texKey];
    const sc = makeCanvas(p.width, p.height);
    const sx = sc.getContext('2d');
    sx.drawImage(layer.canvas, 0, 0);
    drawFloatingIntoCtx(sx, floatingTransform);
    return sc;
  }

  function recompositePart(texKey) {
    const p = parts[texKey];
    if (!p) return;
    const w = p.width, h = p.height;
    const out = p.compositeCanvas;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, w, h);

    const layers = p.layers;
    let idx = 0;
    while (idx < layers.length) {
      const base = layers[idx];
      let endIdx = idx + 1;
      while (endIdx < layers.length && layers[endIdx].clipToBelow) {
        endIdx++;
      }

      if (!base.visible || base.opacity <= 0.001) {
        idx = endIdx;
        continue;
      }

      // Single unclipped layer fast path
      let hasVisibleClipped = false;
      for (let j = idx + 1; j < endIdx; j++) {
        if (layers[j].visible && layers[j].opacity > 0.001) { hasVisibleClipped = true; break; }
      }

      if (!hasVisibleClipped) {
        const src = getLayerRenderSource(texKey, base);
        ctx.save();
        ctx.globalAlpha = clamp(base.opacity, 0, 1);
        ctx.globalCompositeOperation = blendOpOf(base.blendMode);
        ctx.drawImage(src, 0, 0);
        ctx.restore();
      } else {
        // Clipping mask group masked strictly to base layer's alpha
        const groupCanvas = getScratch(scratchA, w, h);
        const gCtx = groupCanvas.getContext('2d');
        const baseSrc = getLayerRenderSource(texKey, base);
        gCtx.globalCompositeOperation = 'source-over';
        gCtx.globalAlpha = 1;
        gCtx.drawImage(baseSrc, 0, 0);

        for (let j = idx + 1; j < endIdx; j++) {
          const cl = layers[j];
          if (!cl.visible || cl.opacity <= 0.001) continue;
          const clSrc = getLayerRenderSource(texKey, cl);
          const tmp = getScratch(scratchB, w, h);
          const tCtx = tmp.getContext('2d');
          // Apply blend mode over current group accumulation, then mask back to base alpha
          tCtx.drawImage(groupCanvas, 0, 0);
          tCtx.save();
          tCtx.globalAlpha = clamp(cl.opacity, 0, 1);
          tCtx.globalCompositeOperation = blendOpOf(cl.blendMode);
          tCtx.drawImage(clSrc, 0, 0);
          tCtx.restore();

          gCtx.clearRect(0, 0, w, h);
          gCtx.globalCompositeOperation = 'source-over';
          gCtx.globalAlpha = 1;
          gCtx.drawImage(tmp, 0, 0);
          gCtx.globalCompositeOperation = 'destination-in';
          gCtx.drawImage(baseSrc, 0, 0);
          gCtx.globalCompositeOperation = 'source-over';
        }

        ctx.save();
        ctx.globalAlpha = clamp(base.opacity, 0, 1);
        ctx.globalCompositeOperation = blendOpOf(base.blendMode);
        ctx.drawImage(groupCanvas, 0, 0);
        ctx.restore();
      }

      idx = endIdx;
    }

    p.rev += 1;
    liveRevMap[texKey] = p.rev;
    liveCanvasMap[texKey] = isCanvasNonEmpty(out) ? out : null;
  }

  function recompositeAll() {
    for (let i = 0; i < PART_KEYS.length; i++) recompositePart(PART_KEYS[i]);
  }

  function attachToResolvedSkin(resolvedSkin) {
    if (!resolvedSkin) return;
    resolvedSkin._livePartTextures = liveCanvasMap;
    resolvedSkin._livePartTextureRev = liveRevMap;
    resolvedSkin.partTextureOptions = {
      hideDefaultPupil: !!options.hideDefaultPupil,
      hideDefaultNose: !!liveCanvasMap.head || !!options.hideDefaultNose,
      hideDefaultMouth: !!liveCanvasMap.head || !!options.hideDefaultMouth
    };
  }

  // --- Undo / Redo Snapshot Helpers ---
  function clonePartSnapshot(texKey) {
    const p = parts[texKey];
    if (!p) return null;
    return {
      texKey,
      activeLayerId: p.activeLayerId,
      layers: p.layers.map((l) => {
        const ctx = l.canvas.getContext('2d', { willReadFrequently: true });
        return {
          id: l.id,
          name: l.name,
          visible: l.visible,
          opacity: l.opacity,
          blendMode: l.blendMode,
          clipToBelow: l.clipToBelow,
          alphaLock: l.alphaLock,
          imageData: ctx.getImageData(0, 0, p.width, p.height)
        };
      })
    };
  }

  function restorePartSnapshot(snap) {
    if (!snap || !parts[snap.texKey]) return;
    const p = parts[snap.texKey];
    p.layers = snap.layers.map((sl) => {
      const c = makeCanvas(p.width, p.height);
      c.getContext('2d', { willReadFrequently: true }).putImageData(sl.imageData, 0, 0);
      return {
        id: sl.id,
        name: sl.name,
        visible: sl.visible,
        opacity: sl.opacity,
        blendMode: sl.blendMode,
        clipToBelow: sl.clipToBelow,
        alphaLock: sl.alphaLock,
        canvas: c
      };
    });
    p.activeLayerId = snap.activeLayerId;
    recompositePart(snap.texKey);
  }

  function pushUndoEntry(texKeys, label) {
    if (floatingTransform) commitFloatingTransform();
    const list = Array.isArray(texKeys) ? texKeys : [texKeys];
    const snaps = [];
    for (let i = 0; i < list.length; i++) {
      const s = clonePartSnapshot(list[i]);
      if (s) snaps.push(s);
    }
    undoStack.push({
      label: label || '编辑',
      snaps,
      options: Object.assign({}, options)
    });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
  }

  function pushPreCapturedUndo(snaps, optSnap, label) {
    undoStack.push({
      label: label || '编辑',
      snaps,
      options: Object.assign({}, optSnap || options)
    });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
  }

  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }

  function undo() {
    if (!undoStack.length) return false;
    if (floatingTransform) cancelFloatingTransform();
    const entry = undoStack.pop();
    const currentSnaps = entry.snaps.map((s) => clonePartSnapshot(s.texKey)).filter(Boolean);
    redoStack.push({
      label: entry.label,
      snaps: currentSnaps,
      options: Object.assign({}, options)
    });
    for (let i = 0; i < entry.snaps.length; i++) {
      restorePartSnapshot(entry.snaps[i]);
    }
    if (entry.options) options = Object.assign({}, entry.options);
    emitChange('undo');
    scheduleSave();
    return true;
  }

  function redo() {
    if (!redoStack.length) return false;
    if (floatingTransform) cancelFloatingTransform();
    const entry = redoStack.pop();
    const currentSnaps = entry.snaps.map((s) => clonePartSnapshot(s.texKey)).filter(Boolean);
    undoStack.push({
      label: entry.label,
      snaps: currentSnaps,
      options: Object.assign({}, options)
    });
    for (let i = 0; i < entry.snaps.length; i++) {
      restorePartSnapshot(entry.snaps[i]);
    }
    if (entry.options) options = Object.assign({}, entry.options);
    emitChange('redo');
    scheduleSave();
    return true;
  }

  // --- Layer CRUD Operations ---
  function addLayer(texKey, name, opts) {
    const p = parts[texKey];
    if (!p) return null;
    if (p.layers.length >= 24) return null;
    pushUndoEntry(texKey, '新建图层');
    const o = opts || {};
    const layer = {
      id: nextLayerId(),
      name: name || ('透明纸 ' + (p.layers.length + 1)),
      visible: true,
      opacity: typeof o.opacity === 'number' ? clamp(o.opacity, 0, 1) : 1.0,
      blendMode: o.blendMode || 'normal',
      clipToBelow: !!o.clipToBelow,
      alphaLock: !!o.alphaLock,
      canvas: makeCanvas(p.width, p.height)
    };
    const activeIdx = p.layers.findIndex((l) => l.id === p.activeLayerId);
    const insertIdx = o.atTop ? p.layers.length : (activeIdx >= 0 ? activeIdx + 1 : p.layers.length);
    p.layers.splice(insertIdx, 0, layer);
    p.activeLayerId = layer.id;
    recompositePart(texKey);
    emitChange('layers');
    scheduleSave();
    return layer;
  }

  function deleteLayer(texKey, layerId) {
    const p = parts[texKey];
    if (!p || p.layers.length <= 1) {
      if (p && p.layers.length === 1) {
        clearLayer(texKey, p.layers[0].id);
      }
      return false;
    }
    const idx = p.layers.findIndex((l) => l.id === layerId);
    if (idx < 0) return false;
    pushUndoEntry(texKey, '删除图层');
    p.layers.splice(idx, 1);
    if (p.layers[0]) p.layers[0].clipToBelow = false;
    if (p.activeLayerId === layerId) {
      const next = p.layers[Math.min(idx, p.layers.length - 1)];
      p.activeLayerId = next ? next.id : null;
    }
    recompositePart(texKey);
    emitChange('layers');
    scheduleSave();
    return true;
  }

  function clearLayer(texKey, layerId) {
    const p = parts[texKey];
    if (!p) return false;
    const layer = p.layers.find((l) => l.id === (layerId || p.activeLayerId));
    if (!layer) return false;
    pushUndoEntry(texKey, '清空图层');
    layer.canvas.getContext('2d').clearRect(0, 0, p.width, p.height);
    recompositePart(texKey);
    emitChange('paint');
    scheduleSave();
    return true;
  }

  function clearAutoBakedBaseLayers(texKeys, layerNames) {
    const keys = Array.isArray(texKeys) ? texKeys : [texKeys];
    const names = Array.isArray(layerNames) && layerNames.length ? layerNames : [
      '四肢渐变底色', '默认爪套', '外耳渐变', '身体分区与渐变',
      '头部底纹与分区', '尾巴渐变与尾尖', '默认尾尖', '默认内耳', '默认眼底', '默认肉垫'
    ];
    let changed = false;
    for (let i = 0; i < keys.length; i++) {
      const tk = keys[i];
      const p = parts[tk];
      if (!p || !p.layers.length) continue;
      const before = p.layers.length;
      const kept = p.layers.filter((l) => names.indexOf(l.name) === -1);
      if (kept.length === before) continue;
      changed = true;
      if (kept.length === 0) {
        const blank = {
          id: nextLayerId(),
          name: '图层 1',
          visible: true,
          opacity: 1.0,
          blendMode: 'normal',
          clipToBelow: false,
          alphaLock: false,
          canvas: makeCanvas(p.width, p.height)
        };
        p.layers = [blank];
        p.activeLayerId = blank.id;
      } else {
        p.layers = kept;
        if (p.layers[0]) p.layers[0].clipToBelow = false;
        if (!p.layers.some((l) => l.id === p.activeLayerId)) {
          p.activeLayerId = p.layers[p.layers.length - 1].id;
        }
      }
      recompositePart(tk);
    }
    if (changed) {
      emitChange('layers');
      scheduleSave();
    }
    return changed;
  }

  function clearPartAll(texKey) {
    const p = parts[texKey];
    if (!p) return false;
    pushUndoEntry(texKey, '清空部位');
    const blank = {
      id: nextLayerId(),
      name: '图层 1',
      visible: true,
      opacity: 1.0,
      blendMode: 'normal',
      clipToBelow: false,
      alphaLock: false,
      canvas: makeCanvas(p.width, p.height)
    };
    p.layers = [blank];
    p.activeLayerId = blank.id;
    recompositePart(texKey);
    emitChange('layers');
    scheduleSave();
    return true;
  }

  function renameLayer(texKey, layerId, newName) {
    const p = parts[texKey];
    if (!p) return false;
    const l = p.layers.find((it) => it.id === layerId);
    if (!l) return false;
    const trimmed = String(newName || '').trim().slice(0, 28);
    if (!trimmed || trimmed === l.name) return false;
    pushUndoEntry(texKey, '重命名图层');
    l.name = trimmed;
    emitChange('layers');
    scheduleSave();
    return true;
  }

  function setLayerProp(texKey, layerId, prop, value, skipUndo) {
    const p = parts[texKey];
    if (!p) return false;
    const idx = p.layers.findIndex((it) => it.id === layerId);
    if (idx < 0) return false;
    const l = p.layers[idx];
    if (prop === 'clipToBelow' && idx === 0 && value) return false;
    if (!skipUndo) pushUndoEntry(texKey, '修改图层属性');
    if (prop === 'visible') l.visible = Boolean(value);
    else if (prop === 'opacity') l.opacity = clamp(Number(value), 0, 1);
    else if (prop === 'blendMode') l.blendMode = BLEND_MODES.some((b) => b.id === value) ? value : 'normal';
    else if (prop === 'clipToBelow') l.clipToBelow = Boolean(value);
    else if (prop === 'alphaLock') l.alphaLock = Boolean(value);
    recompositePart(texKey);
    emitChange('layers');
    if (!skipUndo) scheduleSave();
    return true;
  }

  function moveLayer(texKey, layerId, delta) {
    const p = parts[texKey];
    if (!p) return false;
    const idx = p.layers.findIndex((l) => l.id === layerId);
    if (idx < 0) return false;
    const target = idx + delta;
    if (target < 0 || target >= p.layers.length) return false;
    pushUndoEntry(texKey, '调整图层顺序');
    const [item] = p.layers.splice(idx, 1);
    p.layers.splice(target, 0, item);
    if (p.layers[0]) p.layers[0].clipToBelow = false;
    recompositePart(texKey);
    emitChange('layers');
    scheduleSave();
    return true;
  }

  function mergeLayerDown(texKey, layerId) {
    const p = parts[texKey];
    if (!p) return false;
    const idx = p.layers.findIndex((l) => l.id === layerId);
    if (idx <= 0) return false;
    pushUndoEntry(texKey, '向下合并');
    const upper = p.layers[idx];
    const lower = p.layers[idx - 1];
    const lCtx = lower.canvas.getContext('2d');
    if (upper.visible && upper.opacity > 0.001) {
      const upperSrc = getLayerRenderSource(texKey, upper);
      lCtx.save();
      lCtx.globalAlpha = clamp(upper.opacity, 0, 1);
      lCtx.globalCompositeOperation = upper.clipToBelow ? 'source-atop' : blendOpOf(upper.blendMode);
      lCtx.drawImage(upperSrc, 0, 0);
      lCtx.restore();
    }
    p.layers.splice(idx, 1);
    p.activeLayerId = lower.id;
    recompositePart(texKey);
    emitChange('layers');
    scheduleSave();
    return true;
  }

  function duplicateLayer(texKey, layerId) {
    const p = parts[texKey];
    if (!p || p.layers.length >= 24) return null;
    const idx = p.layers.findIndex((l) => l.id === layerId);
    if (idx < 0) return null;
    pushUndoEntry(texKey, '复制图层');
    const src = p.layers[idx];
    const c = makeCanvas(p.width, p.height);
    c.getContext('2d').drawImage(src.canvas, 0, 0);
    const copy = {
      id: nextLayerId(),
      name: (src.name + ' 副本').slice(0, 28),
      visible: src.visible,
      opacity: src.opacity,
      blendMode: src.blendMode,
      clipToBelow: src.clipToBelow,
      alphaLock: src.alphaLock,
      canvas: c
    };
    p.layers.splice(idx + 1, 0, copy);
    p.activeLayerId = copy.id;
    recompositePart(texKey);
    emitChange('layers');
    scheduleSave();
    return copy;
  }

  // --- Pixel Painting Tools ---
  function withDrawContext(layer, isEraser, fn) {
    const ctx = layer.canvas.getContext('2d', { willReadFrequently: true });
    ctx.save();
    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
    } else if (layer.alphaLock) {
      ctx.globalCompositeOperation = 'source-atop';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }
    fn(ctx);
    ctx.restore();
  }

  function hexToRgbaArr(hex, alphaMul) {
    const c = Spec.parseHexColor(hex) || { r: 0, g: 0, b: 0, a: 1 };
    return [
      Math.round(c.r * 255),
      Math.round(c.g * 255),
      Math.round(c.b * 255),
      Math.round(clamp(c.a * (alphaMul === undefined ? 1 : alphaMul), 0, 1) * 255)
    ];
  }

  // Stamp one dab onto a layer canvas
  function stampDab(ctx, tool, px, py, radiusPx, rgba, smudgeCarry) {
    const [r, g, b, a] = smudgeCarry || rgba;
    const af = clamp(a / 255, 0, 1);
    if (tool === 'pen') {
      ctx.fillStyle = `rgba(${r},${g},${b},${af.toFixed(4)})`;
      ctx.beginPath();
      ctx.arc(px, py, radiusPx, 0, Math.PI * 2);
      ctx.fill();
    } else if (tool === 'calligraphy') {
      ctx.fillStyle = `rgba(${r},${g},${b},${af.toFixed(4)})`;
      ctx.beginPath();
      ctx.arc(px, py, radiusPx, 0, Math.PI * 2);
      ctx.fill();
    } else if (tool === 'soft' || tool === 'eraser') {
      const grad = ctx.createRadialGradient(px, py, Math.max(0.1, radiusPx * 0.15), px, py, Math.max(0.5, radiusPx));
      const edgeA = tool === 'eraser' ? af : af * 0.48;
      grad.addColorStop(0, `rgba(${r},${g},${b},${af.toFixed(4)})`);
      grad.addColorStop(0.55, `rgba(${r},${g},${b},${edgeA.toFixed(4)})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, radiusPx, 0, Math.PI * 2);
      ctx.fill();
    } else if (tool === 'airbrush') {
      const count = Math.max(4, Math.round(radiusPx * 1.1));
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rr = Math.pow(Math.random(), 0.72) * radiusPx;
        const sx = px + Math.cos(ang) * rr;
        const sy = py + Math.sin(ang) * rr;
        const dotR = Math.max(0.6, radiusPx * (0.08 + Math.random() * 0.16));
        ctx.fillStyle = `rgba(${r},${g},${b},${(af * (0.14 + Math.random() * 0.24)).toFixed(4)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (tool === 'smudge') {
      const grad = ctx.createRadialGradient(px, py, 0, px, py, Math.max(0.5, radiusPx));
      grad.addColorStop(0, `rgba(${r},${g},${b},${(af * 0.52).toFixed(4)})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, radiusPx, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function partRadiusToTexPx(texKey, partRadius) {
    const sp = PART_SPECS[texKey];
    if (!sp) return Math.max(1, partRadius * 2);
    const scaleX = sp.width / (sp.x1 - sp.x0);
    const scaleY = sp.height / (sp.y1 - sp.y0);
    return Math.max(0.7, partRadius * (scaleX + scaleY) * 0.5);
  }

  function beginBrushStroke(texKey, partPt, opts) {
    const p = parts[texKey];
    const layer = getActiveLayer(texKey);
    if (!p || !layer) return null;
    if (floatingTransform && floatingTransform.texKey === texKey) {
      commitFloatingTransform();
    }
    const snap = clonePartSnapshot(texKey);
    const pt = partToTex(texKey, partPt);
    const baseRadius = partRadiusToTexPx(texKey, (opts.size || 4) * 0.5);
    const rgba = hexToRgbaArr(opts.color || '#1A1A1E', opts.alpha !== undefined ? opts.alpha : 1);
    const tool = opts.tool || 'calligraphy';

    let smudgeCarry = null;
    if (tool === 'smudge') {
      const compCtx = p.compositeCanvas.getContext('2d', { willReadFrequently: true });
      const ix = clamp(Math.round(pt.x), 0, p.width - 1);
      const iy = clamp(Math.round(pt.y), 0, p.height - 1);
      const px = compCtx.getImageData(ix, iy, 1, 1).data;
      smudgeCarry = px[3] > 8 ? [px[0], px[1], px[2], Math.round(px[3] * (opts.alpha || 1))] : rgba.slice();
    }

    const session = {
      texKey,
      layer,
      snap,
      tool,
      baseRadius,
      rgba,
      smudgeCarry,
      lastTexPt: pt,
      lastTime: performance.now(),
      pts: [pt],
      dirty: false
    };

    if (tool !== 'fillBrush') {
      withDrawContext(layer, tool === 'eraser', (ctx) => {
        const r0 = tool === 'calligraphy' ? baseRadius * 0.85 : baseRadius;
        stampDab(ctx, tool, pt.x, pt.y, r0, rgba, smudgeCarry);
      });
      session.dirty = true;
      recompositePart(texKey);
      emitChange('paint');
    }
    return session;
  }

  function continueBrushStroke(session, partPt, pressure) {
    if (!session) return;
    const p = parts[session.texKey];
    if (!p) return;
    const pt = partToTex(session.texKey, partPt);
    const prev = session.lastTexPt;
    const dx = pt.x - prev.x, dy = pt.y - prev.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.35) return;

    session.pts.push(pt);
    if (session.tool === 'fillBrush') {
      session.lastTexPt = pt;
      return;
    }

    const now = performance.now();
    const dt = Math.max(4, now - session.lastTime);
    const speed = dist / dt;
    let rTarget = session.baseRadius;
    if (session.tool === 'calligraphy') {
      const pressMul = pressure && pressure > 0.05 && pressure !== 0.5 ? (0.45 + pressure * 1.1) : 1.0;
      const speedMul = clamp(1.18 - speed * 0.35, 0.42, 1.25);
      rTarget = Math.max(0.7, session.baseRadius * pressMul * speedMul);
    }

    const stepPx = Math.max(0.65, rTarget * (session.tool === 'airbrush' ? 0.55 : 0.28));
    const steps = Math.max(1, Math.ceil(dist / stepPx));

    if (session.tool === 'smudge') {
      const compCtx = p.compositeCanvas.getContext('2d', { willReadFrequently: true });
      const ix = clamp(Math.round(pt.x), 0, p.width - 1);
      const iy = clamp(Math.round(pt.y), 0, p.height - 1);
      const sampled = compCtx.getImageData(ix, iy, 1, 1).data;
      if (sampled[3] > 6) {
        for (let k = 0; k < 3; k++) {
          session.smudgeCarry[k] = Math.round(session.smudgeCarry[k] * 0.72 + sampled[k] * 0.28);
        }
        session.smudgeCarry[3] = Math.round(session.smudgeCarry[3] * 0.8 + sampled[3] * 0.2);
      }
    }

    withDrawContext(session.layer, session.tool === 'eraser', (ctx) => {
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        stampDab(
          ctx,
          session.tool,
          prev.x + dx * f,
          prev.y + dy * f,
          rTarget,
          session.rgba,
          session.smudgeCarry
        );
      }
    });

    session.lastTexPt = pt;
    session.lastTime = now;
    session.dirty = true;
    recompositePart(session.texKey);
    emitChange('paint');
  }

  function finishBrushStrokePair(session, mirrorSession) {
    const list = [session, mirrorSession].filter(Boolean);
    if (!list.length) return false;
    const snaps = [];
    const seenKeys = new Set();
    let anyDirty = false;
    let mainTool = list[0].tool;
    for (let idx = 0; idx < list.length; idx++) {
      const s = list[idx];
      if (s.tool === 'fillBrush' && s.pts.length >= 3) {
        withDrawContext(s.layer, false, (ctx) => {
          const [r, g, b, a] = s.rgba;
          ctx.fillStyle = `rgba(${r},${g},${b},${(a / 255).toFixed(4)})`;
          ctx.beginPath();
          ctx.moveTo(s.pts[0].x, s.pts[0].y);
          for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y);
          ctx.closePath();
          ctx.fill();
        });
        s.dirty = true;
        recompositePart(s.texKey);
      }
      if (s.dirty) {
        anyDirty = true;
        if (s.snap && !seenKeys.has(s.snap.texKey)) {
          seenKeys.add(s.snap.texKey);
          snaps.push(s.snap);
        }
      }
    }
    if (anyDirty && snaps.length) {
      pushPreCapturedUndo(snaps, options, mainTool === 'eraser' ? '橡皮擦除' : '画笔绘制');
      emitChange('commit');
      scheduleSave();
      return true;
    }
    return false;
  }

  function finishBrushStroke(session) {
    return finishBrushStrokePair(session, null);
  }

  // Real pixel flood-fill bucket on the active layer (with tolerance + 1px anti-alias fringe fill)
  function floodFillBucket(texKey, partPt, colorHex, alpha, tolerance) {
    const p = parts[texKey];
    const layer = getActiveLayer(texKey);
    if (!p || !layer) return false;
    if (floatingTransform && floatingTransform.texKey === texKey) {
      commitFloatingTransform();
    }
    const w = p.width, h = p.height;
    const tPt = partToTex(texKey, partPt);
    const sx = Math.round(tPt.x), sy = Math.round(tPt.y);
    if (sx < 0 || sx >= w || sy < 0 || sy >= h) return false;

    const lCtx = layer.canvas.getContext('2d', { willReadFrequently: true });
    const imgData = lCtx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const startIdx = (sy * w + sx) * 4;
    const sr = data[startIdx], sg = data[startIdx + 1], sb = data[startIdx + 2], sa = data[startIdx + 3];
    const [fr, fg, fb, fa] = hexToRgbaArr(colorHex, alpha);

    // If alphaLock is ON and clicked pixel is transparent, nothing to fill
    if (layer.alphaLock && sa < 4) return false;
    if (Math.abs(sr - fr) <= 1 && Math.abs(sg - fg) <= 1 && Math.abs(sb - fb) <= 1 && Math.abs(sa - fa) <= 2) {
      return false;
    }

    pushUndoEntry(texKey, '油漆桶填色');
    const tol = clamp(tolerance !== undefined ? tolerance : 32, 0, 180);
    const tolSq = tol * tol * 4;
    const visited = new Uint8Array(w * h);

    const matches = (pos) => {
      const o = pos * 4;
      const da = data[o + 3] - sa;
      if (sa < 8 && data[o + 3] < 8) return true;
      const dr = data[o] - sr, dg = data[o + 1] - sg, db = data[o + 2] - sb;
      return (dr * dr + dg * dg + db * db + da * da) <= tolSq;
    };

    const stack = new Int32Array(w * h);
    let spTop = 0;
    const startPos = sy * w + sx;
    stack[spTop++] = startPos;
    visited[startPos] = 1;
    const fringe = [];

    while (spTop > 0) {
      const pos = stack[--spTop];
      const o = pos * 4;
      if (layer.alphaLock) {
        const origA = data[o + 3];
        if (origA > 0) {
          data[o] = fr; data[o + 1] = fg; data[o + 2] = fb;
        }
      } else {
        data[o] = fr; data[o + 1] = fg; data[o + 2] = fb; data[o + 3] = fa;
      }

      const x = pos % w;
      const y = (pos - x) / w;
      const nbrs = [];
      if (x > 0) nbrs.push(pos - 1);
      if (x + 1 < w) nbrs.push(pos + 1);
      if (y > 0) nbrs.push(pos - w);
      if (y + 1 < h) nbrs.push(pos + w);
      for (let i = 0; i < nbrs.length; i++) {
        const np = nbrs[i];
        if (visited[np]) continue;
        visited[np] = 1;
        if (matches(np)) {
          stack[spTop++] = np;
        } else {
          fringe.push(np);
        }
      }
    }

    // Soft 1px fringe blend so flood-fill doesn't leave stair-stepped white halos against anti-aliased strokes
    if (!layer.alphaLock && tol >= 8) {
      for (let i = 0; i < fringe.length; i++) {
        const pos = fringe[i];
        const o = pos * 4;
        if (data[o + 3] < 220 && sa < 8) {
          data[o] = Math.round((data[o] * data[o + 3] + fr * (255 - data[o + 3])) / 255);
          data[o + 1] = Math.round((data[o + 1] * data[o + 3] + fg * (255 - data[o + 3])) / 255);
          data[o + 2] = Math.round((data[o + 2] * data[o + 3] + fb * (255 - data[o + 3])) / 255);
          data[o + 3] = Math.max(data[o + 3], Math.round(fa * 0.65));
        }
      }
    }

    lCtx.putImageData(imgData, 0, 0);
    recompositePart(texKey);
    emitChange('paint');
    scheduleSave();
    return true;
  }

  function sampleCompositeHex(texKey, partPt) {
    const p = parts[texKey];
    if (!p) return null;
    const tPt = partToTex(texKey, partPt);
    const ix = clamp(Math.round(tPt.x), 0, p.width - 1);
    const iy = clamp(Math.round(tPt.y), 0, p.height - 1);
    const d = p.compositeCanvas.getContext('2d', { willReadFrequently: true }).getImageData(ix, iy, 1, 1).data;
    if (d[3] < 8) return null;
    return Spec.rgbToHex(d[0], d[1], d[2]);
  }

  // --- Selection Marquee / Lasso + Local Transform + Image Layer Import ---
  function getFloatingTransform() {
    return floatingTransform;
  }

  function hasFloatingTransformFor(texKey) {
    return !!(floatingTransform && floatingTransform.texKey === texKey);
  }

  function createSelectionFromPartPolygon(texKey, partPoly) {
    const p = parts[texKey];
    const layer = getActiveLayer(texKey);
    if (!p || !layer || !partPoly || partPoly.length < 3) return null;
    if (floatingTransform) commitFloatingTransform();

    const texPoly = partPoly.map((pt) => partToTex(texKey, pt));
    let minX = p.width, minY = p.height, maxX = 0, maxY = 0;
    for (let i = 0; i < texPoly.length; i++) {
      minX = Math.min(minX, texPoly[i].x);
      minY = Math.min(minY, texPoly[i].y);
      maxX = Math.max(maxX, texPoly[i].x);
      maxY = Math.max(maxY, texPoly[i].y);
    }
    const ix0 = clamp(Math.floor(minX), 0, p.width - 1);
    const iy0 = clamp(Math.floor(minY), 0, p.height - 1);
    const ix1 = clamp(Math.ceil(maxX), 0, p.width);
    const iy1 = clamp(Math.ceil(maxY), 0, p.height);
    const bw = ix1 - ix0, bh = iy1 - iy0;
    if (bw < 2 || bh < 2) return null;

    const lCtx = layer.canvas.getContext('2d', { willReadFrequently: true });
    const preSnap = clonePartSnapshot(texKey);

    // Extract masked pixels into srcCanvas
    const srcCanvas = makeCanvas(bw, bh);
    const sCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
    sCtx.save();
    sCtx.beginPath();
    sCtx.moveTo(texPoly[0].x - ix0, texPoly[0].y - iy0);
    for (let i = 1; i < texPoly.length; i++) sCtx.lineTo(texPoly[i].x - ix0, texPoly[i].y - iy0);
    sCtx.closePath();
    sCtx.clip();
    sCtx.drawImage(layer.canvas, ix0, iy0, bw, bh, 0, 0, bw, bh);
    sCtx.restore();

    // Check if selection has any non-transparent pixels
    if (!isCanvasNonEmpty(srcCanvas)) return null;

    // Clear selected region from underlying layer while active
    lCtx.save();
    lCtx.globalCompositeOperation = 'destination-out';
    lCtx.beginPath();
    lCtx.moveTo(texPoly[0].x, texPoly[0].y);
    for (let i = 1; i < texPoly.length; i++) lCtx.lineTo(texPoly[i].x, texPoly[i].y);
    lCtx.closePath();
    lCtx.fill();
    lCtx.restore();

    floatingTransform = {
      texKey,
      layerId: layer.id,
      kind: 'selection',
      preSnap,
      srcCanvas,
      w: bw,
      h: bh,
      cx: ix0 + bw * 0.5,
      cy: iy0 + bh * 0.5,
      scaleX: 1,
      scaleY: 1,
      rot: 0
    };
    recompositePart(texKey);
    emitChange('selection');
    return floatingTransform;
  }

  function importImageAsLayer(texKey, imgEl, name, opts) {
    const p = parts[texKey];
    if (!p || !imgEl) return null;
    if (floatingTransform) commitFloatingTransform();
    const o = opts || {};

    // Prepare source bitmap (optionally removing white/flat background)
    const maxDim = Math.max(imgEl.naturalWidth || imgEl.width, imgEl.naturalHeight || imgEl.height);
    const downScale = maxDim > 512 ? 512 / maxDim : 1;
    const sw = Math.max(1, Math.round((imgEl.naturalWidth || imgEl.width) * downScale));
    const sh = Math.max(1, Math.round((imgEl.naturalHeight || imgEl.height) * downScale));
    const srcCanvas = makeCanvas(sw, sh);
    const sCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
    sCtx.drawImage(imgEl, 0, 0, sw, sh);

    if (o.removeWhiteBg) {
      const id = sCtx.getImageData(0, 0, sw, sh);
      const d = id.data;
      const r0 = d[0], g0 = d[1], b0 = d[2];
      for (let i = 0; i < d.length; i += 4) {
        const dist = Math.hypot(d[i] - r0, d[i + 1] - g0, d[i + 2] - b0);
        if (dist < 38) d[i + 3] = 0;
        else if (dist < 62) d[i + 3] = Math.round(d[i + 3] * ((dist - 38) / 24));
      }
      sCtx.putImageData(id, 0, 0);
    }

    const preSnap = clonePartSnapshot(texKey);
    const layer = {
      id: nextLayerId(),
      name: (name || '导入图片').slice(0, 28),
      visible: true,
      opacity: 1.0,
      blendMode: 'normal',
      clipToBelow: false,
      alphaLock: false,
      canvas: makeCanvas(p.width, p.height)
    };
    p.layers.push(layer);
    p.activeLayerId = layer.id;

    const fitScale = Math.min((p.width * 0.72) / sw, (p.height * 0.72) / sh);
    floatingTransform = {
      texKey,
      layerId: layer.id,
      kind: 'import',
      preSnap,
      srcCanvas,
      w: sw,
      h: sh,
      cx: p.width * 0.5,
      cy: p.height * 0.5,
      scaleX: fitScale,
      scaleY: fitScale,
      rot: 0
    };
    recompositePart(texKey);
    emitChange('selection');
    return floatingTransform;
  }

  function updateFloatingTransform(patch) {
    if (!floatingTransform) return;
    if (typeof patch.cx === 'number') floatingTransform.cx = patch.cx;
    if (typeof patch.cy === 'number') floatingTransform.cy = patch.cy;
    if (typeof patch.scaleX === 'number') floatingTransform.scaleX = clamp(patch.scaleX, 0.05, 8);
    if (typeof patch.scaleY === 'number') floatingTransform.scaleY = clamp(patch.scaleY, 0.05, 8);
    if (typeof patch.rot === 'number') floatingTransform.rot = patch.rot;
    recompositePart(floatingTransform.texKey);
    emitChange('paint');
  }

  function duplicateFloatingTransform() {
    if (!floatingTransform) return false;
    const ft = floatingTransform;
    const p = parts[ft.texKey];
    const layer = p && p.layers.find((l) => l.id === ft.layerId);
    if (!p || !layer) return false;

    // Stamp current floating copy onto layer first, then keep offset floating copy!
    const preSnap = ft.preSnap || clonePartSnapshot(ft.texKey);
    const lCtx = layer.canvas.getContext('2d');
    drawFloatingIntoCtx(lCtx, ft);
    pushPreCapturedUndo([preSnap], options, '复制选区内容');

    ft.preSnap = clonePartSnapshot(ft.texKey);
    ft.cx += 10;
    ft.cy += 10;
    recompositePart(ft.texKey);
    emitChange('selection');
    scheduleSave();
    return true;
  }

  function deleteFloatingTransform() {
    if (!floatingTransform) return false;
    const ft = floatingTransform;
    const tk = ft.texKey;
    const preSnap = ft.preSnap;
    if (ft.kind === 'import') {
      const p = parts[tk];
      if (p) {
        const idx = p.layers.findIndex((l) => l.id === ft.layerId);
        if (idx >= 0) p.layers.splice(idx, 1);
        if (p.layers.length) p.activeLayerId = p.layers[p.layers.length - 1].id;
      }
      floatingTransform = null;
    } else {
      floatingTransform = null;
      if (preSnap) pushPreCapturedUndo([preSnap], options, '删除选区像素');
    }
    recompositePart(tk);
    emitChange('layers');
    scheduleSave();
    return true;
  }

  function removeFloatingWhiteBg() {
    if (!floatingTransform || !floatingTransform.srcCanvas) return false;
    const sc = floatingTransform.srcCanvas;
    const sw = sc.width, sh = sc.height;
    if (sw < 1 || sh < 1) return false;
    const sCtx = sc.getContext('2d', { willReadFrequently: true });
    const id = sCtx.getImageData(0, 0, sw, sh);
    const d = id.data;
    const r0 = d[0], g0 = d[1], b0 = d[2];
    for (let i = 0; i < d.length; i += 4) {
      const dist = Math.hypot(d[i] - r0, d[i + 1] - g0, d[i + 2] - b0);
      if (dist < 38) d[i + 3] = 0;
      else if (dist < 62) d[i + 3] = Math.round(d[i + 3] * ((dist - 38) / 24));
    }
    sCtx.putImageData(id, 0, 0);
    recompositePart(floatingTransform.texKey);
    emitChange('paint');
    return true;
  }

  function commitFloatingTransform() {
    if (!floatingTransform) return false;
    const ft = floatingTransform;
    const p = parts[ft.texKey];
    const layer = p && p.layers.find((l) => l.id === ft.layerId);
    floatingTransform = null;
    if (!p || !layer) return false;
    const lCtx = layer.canvas.getContext('2d');
    drawFloatingIntoCtx(lCtx, ft);
    if (ft.preSnap) {
      pushPreCapturedUndo([ft.preSnap], options, ft.kind === 'import' ? '导入图片图层' : '选区变换');
    }
    recompositePart(ft.texKey);
    emitChange('layers');
    scheduleSave();
    return true;
  }

  function cancelFloatingTransform() {
    if (!floatingTransform) return false;
    const ft = floatingTransform;
    const tk = ft.texKey;
    floatingTransform = null;
    if (ft.preSnap) restorePartSnapshot(ft.preSnap);
    else recompositePart(tk);
    emitChange('layers');
    return true;
  }

  // --- Legacy Skin / Template / Photo / 1.6.0 Auto-Rasterizer ---
  function drawPolyPart(ctx, texKey, pts, fillStyle) {
    if (!pts || pts.length < 3) return;
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const tp = partToTex(texKey, pts[i]);
      if (i === 0) ctx.moveTo(tp.x, tp.y);
      else ctx.lineTo(tp.x, tp.y);
    }
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.restore();
  }

  function drawMarkToTex(ctx, texKey, m) {
    if (!m || !m.points || !m.points.length) return;
    const col = rgbaCss(m.color);
    const sp = PART_SPECS[texKey];
    const scaleAvg = ((sp.width / (sp.x1 - sp.x0)) + (sp.height / (sp.y1 - sp.y0))) * 0.5;
    if (!m.stroke) {
      drawPolyPart(ctx, texKey, m.points, col);
      return;
    }
    const w = Math.max(1, (m.width || 2) * scaleAvg);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (m.brush === 'soft' || m.brush === 'airbrush') {
      const stepsPts = [];
      for (let i = 0; i < m.points.length - 1; i++) {
        const a = partToTex(texKey, m.points[i]);
        const b = partToTex(texKey, m.points[i + 1]);
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, w * 0.25)));
        for (let k = 0; k < n; k++) stepsPts.push({ x: a.x + (b.x - a.x) * (k / n), y: a.y + (b.y - a.y) * (k / n) });
      }
      stepsPts.push(partToTex(texKey, m.points[m.points.length - 1]));
      const rgba = [
        Math.round(m.color.r * 255),
        Math.round(m.color.g * 255),
        Math.round(m.color.b * 255),
        Math.round((m.color.a === undefined ? 1 : m.color.a) * 255)
      ];
      for (let i = 0; i < stepsPts.length; i++) {
        stampDab(ctx, m.brush === 'airbrush' ? 'airbrush' : 'soft', stepsPts[i].x, stepsPts[i].y, w * 0.65, rgba);
      }
    } else {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let i = 0; i < m.points.length; i++) {
        const tp = partToTex(texKey, m.points[i]);
        if (i === 0) ctx.moveTo(tp.x, tp.y);
        else ctx.lineTo(tp.x, tp.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function loadBase64IntoLayer(layer, texKey, b64) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const p = parts[texKey];
        if (p && layer) {
          const cx = layer.canvas.getContext('2d');
          cx.clearRect(0, 0, p.width, p.height);
          cx.drawImage(img, 0, 0, p.width, p.height);
          recompositePart(texKey);
          emitChange('paint');
        }
        resolve();
      };
      img.onerror = () => resolve();
      img.src = b64.startsWith('data:') ? b64 : 'data:image/png;base64,' + b64;
    });
  }

  function drawDefaultNoseIntoCtx(ctx, noseCol) {
    if (!noseCol || (noseCol.a !== undefined && noseCol.a < 0.01)) return;
    const p0 = partToTex('head', { x: -2.3, y: 7.1 });
    const p1 = partToTex('head', { x: 0, y: 6.6 });
    const p2 = partToTex('head', { x: 2.3, y: 7.1 });
    const p3 = partToTex('head', { x: 1.8, y: 8.8 });
    const p4 = partToTex('head', { x: 0, y: 9.7 });
    const p5 = partToTex('head', { x: -1.8, y: 8.8 });
    ctx.save();
    ctx.fillStyle = rgbaCss(noseCol);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
    ctx.quadraticCurveTo(p3.x, p3.y, p4.x, p4.y);
    ctx.quadraticCurveTo(p5.x, p5.y, p0.x, p0.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawDefaultMouthIntoCtx(ctx, mouthCol) {
    if (!mouthCol || (mouthCol.a !== undefined && mouthCol.a < 0.01)) return;
    const mL = partToTex('head', { x: -4.2, y: 12.2 });
    const mM = partToTex('head', { x: 0, y: 11.2 });
    const mR = partToTex('head', { x: 4.2, y: 12.2 });
    const c1 = partToTex('head', { x: -2.1, y: 13.8 });
    const c2 = partToTex('head', { x: 2.1, y: 13.8 });
    const sp = PART_SPECS.head;
    const scale = sp.width / (sp.x1 - sp.x0);
    ctx.save();
    ctx.strokeStyle = rgbaCss(mouthCol);
    ctx.lineWidth = Math.max(1.2, 1.05 * scale);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mL.x, mL.y);
    ctx.quadraticCurveTo(c1.x, c1.y, mM.x, mM.y);
    ctx.quadraticCurveTo(c2.x, c2.y, mR.x, mR.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawDefaultIrisIntoCtx(ctx, palIris, eyeThemeName) {
    const sp = PART_SPECS.leftIris;
    const themes = {
      neonChartreuse: ['#B6DF36', '#D2F258'],
      siameseBlue: ['#8FC4E6', '#DBF1FC'],
      warmAmber: ['#D89328', '#F2B84A'],
      softAmber: ['#D4A24E', '#EDCA7D'],
      referenceHazel: ['#8C9658', '#DAB257'],
      iceCyan: ['#72D2E0', '#B6F0FA']
    };
    ctx.save();
    if (palIris) {
      ctx.fillStyle = rgbaCss(palIris);
      ctx.fillRect(0, 0, sp.width, sp.height);
    } else {
      const pair = themes[eyeThemeName] || themes.neonChartreuse;
      const g = ctx.createLinearGradient(0, 0, 0, sp.height);
      g.addColorStop(0, pair[0]);
      g.addColorStop(1, pair[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, sp.width, sp.height);
    }
    ctx.restore();
  }

  function drawDefaultHindPawIntoCtx(ctx, pal) {
    const sp = PART_SPECS.leftHindPaw;
    const pawCol = pal.hindPaw || pal.paws || pal.body;
    const mapNorm = (ux, uy) => ({
      x: ((ux - sp.x0) / (sp.x1 - sp.x0)) * sp.width,
      y: ((uy - sp.y0) / (sp.y1 - sp.y0)) * sp.height
    });
    const c = mapNorm(0, 0);
    const rx = (1 / (sp.x1 - sp.x0)) * sp.width;
    const ry = (1 / (sp.y1 - sp.y0)) * sp.height;
    ctx.save();
    ctx.fillStyle = rgbaCss(pawCol);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx * 1.1, ry * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    if (pal.pawPads) {
      ctx.fillStyle = rgbaCss(pal.pawPads);
      // Center metacarpal pad + 3 toe beans matching renderer.js lines 1660-1673
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + ry * 0.22, rx * 0.27, ry * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const tx of [-0.34, 0, 0.34]) {
        const ty = -0.24 - (tx === 0 ? 0.11 : 0);
        ctx.beginPath();
        ctx.ellipse(c.x + tx * rx, c.y + ty * ry, rx * 0.125, ry * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function sameColor(a, b) {
    return Spec.sameColor(a, b);
  }

  // Convert ANY skin (1.6.0 partTextures OR legacy vector regions/marks/palette/templates) into pixel layers
  function rasterizeFromSkin(rawSkin, resolvedSkin, eyeThemeName, forceReset) {
    if (!rawSkin || !resolvedSkin) return;
    if (floatingTransform) floatingTransform = null;
    undoStack.length = 0;
    redoStack.length = 0;

    const pal = resolvedSkin.palette || {};
    const hasExistingTextures = Boolean(
      rawSkin.partTextures &&
      PART_KEYS.some((k) => Boolean(rawSkin.partTextures[k]))
    );

    const pendingLoads = [];

    if (hasExistingTextures) {
      const pto = rawSkin.partTextureOptions || {};
      options.hideDefaultPupil = Boolean(pto.hideDefaultPupil);
      options.hideDefaultNose = pto.hideDefaultNose !== undefined ? Boolean(pto.hideDefaultNose) : Boolean(rawSkin.partTextures.head);
      options.hideDefaultMouth = pto.hideDefaultMouth !== undefined ? Boolean(pto.hideDefaultMouth) : Boolean(rawSkin.partTextures.head);

      for (let i = 0; i < PART_KEYS.length; i++) {
        const tk = PART_KEYS[i];
        initPart(tk);
        const b64 = rawSkin.partTextures[tk];
        if (b64) {
          const layer = parts[tk].layers[0];
          layer.name = '贴图底图';
          pendingLoads.push(loadBase64IntoLayer(layer, tk, b64));
        } else if (tk === 'leftIris' || tk === 'rightIris') {
          const layer = parts[tk].layers[0];
          layer.name = '默认虹膜';
          drawDefaultIrisIntoCtx(layer.canvas.getContext('2d'), tk === 'leftIris' ? (pal.irisLeft || pal.iris) : (pal.irisRight || pal.iris), eyeThemeName);
        } else if (tk === 'leftHindPaw' || tk === 'rightHindPaw') {
          const layer = parts[tk].layers[0];
          layer.name = '默认肉垫';
          drawDefaultHindPawIntoCtx(layer.canvas.getContext('2d'), pal);
        }
      }
      recompositeAll();
      emitChange('reset');
      return Promise.all(pendingLoads).then(() => {
        recompositeAll();
        emitChange('paint');
        scheduleSave();
      });
    }

    // Legacy vector skin -> auto-rasterize into transparent sheets!
    options.hideDefaultPupil = false;
    options.hideDefaultNose = Boolean(pal.nose && (!pal.nose.a || pal.nose.a >= 0.01));
    options.hideDefaultMouth = Boolean(pal.mouth && (!pal.mouth.a || pal.mouth.a >= 0.01));

    const addInitLayer = (tk, name, drawFn) => {
      const p = parts[tk];
      const l = {
        id: nextLayerId(),
        name,
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        clipToBelow: false,
        alphaLock: false,
        canvas: makeCanvas(p.width, p.height)
      };
      drawFn(l.canvas.getContext('2d'), p);
      p.layers.push(l);
      p.activeLayerId = l.id;
      return l;
    };

    const dropInitialBlankIfMore = (tk) => {
      const p = parts[tk];
      if (p.layers.length > 1 && !isCanvasNonEmpty(p.layers[0].canvas)) {
        p.layers.shift();
        p.activeLayerId = p.layers[p.layers.length - 1].id;
      }
    };

    for (let i = 0; i < PART_KEYS.length; i++) initPart(PART_KEYS[i]);

    // 1. Head: headBody / points / gradient / regions / marks + nose + mouth
    const headRegs = resolvedSkin.regions.filter((r) => r.space === 'head' || r.space === 'skull');
    const headMarks = resolvedSkin.marks.filter((m) => m.space === 'head' || m.space === 'skull');
    const hasHeadBase = Boolean((pal.headBody && !sameColor(pal.headBody, pal.body)) || resolvedSkin.colorpoint || (resolvedSkin.partGradients && resolvedSkin.partGradients.head));
    if (hasHeadBase || headRegs.length) {
      addInitLayer('head', '头部底纹与分区', (cx) => {
        if (pal.headBody && !sameColor(pal.headBody, pal.body)) {
          cx.fillStyle = rgbaCss(pal.headBody);
          cx.fillRect(0, 0, 384, 384);
        }
        if (resolvedSkin.partGradients && resolvedSkin.partGradients.head) {
          const hg = resolvedSkin.partGradients.head;
          const t0 = partToTex('head', { x: 0, y: -44 });
          const t1 = partToTex('head', { x: 0, y: 40 });
          const g = cx.createLinearGradient(0, t0.y, 0, t1.y);
          g.addColorStop(0, rgbaCss(hg.from));
          g.addColorStop(clamp(hg.stop || 0.5, 0.1, 0.9), rgbaCss(hg.to));
          g.addColorStop(1, rgbaCss(hg.to));
          cx.fillStyle = g;
          cx.fillRect(0, 0, 384, 384);
        }
        if (resolvedSkin.colorpoint && pal.points) {
          const mid = pal.pointsMid || pal.points;
          const mc = partToTex('head', { x: 0, y: 3 });
          const rad = partRadiusToTexPx('head', 31.5);
          cx.save();
          cx.translate(mc.x, mc.y);
          cx.scale(1.24, 0.88);
          const g = cx.createRadialGradient(0, 0, 0, 0, 0, rad);
          g.addColorStop(0, rgbaCss(pal.points, 1));
          g.addColorStop(0.42, rgbaCss(pal.points, 0.92));
          g.addColorStop(0.74, rgbaCss(mid, 0.62));
          g.addColorStop(1, rgbaCss(mid, 0));
          cx.fillStyle = g;
          cx.beginPath();
          cx.arc(0, 0, rad, 0, Math.PI * 2);
          cx.fill();
          cx.restore();
        }
        for (let i = 0; i < headRegs.length; i++) drawPolyPart(cx, 'head', headRegs[i].flat, rgbaCss(headRegs[i].fill));
      });
    }
    if (headMarks.length) {
      addInitLayer('head', '头部花纹', (cx) => {
        for (let i = 0; i < headMarks.length; i++) drawMarkToTex(cx, 'head', headMarks[i]);
      });
    }
    if (pal.nose && (!pal.nose.a || pal.nose.a >= 0.01)) {
      addInitLayer('head', '默认鼻子', (cx) => drawDefaultNoseIntoCtx(cx, pal.nose));
    } else {
      options.hideDefaultNose = true;
    }
    if (pal.mouth && (!pal.mouth.a || pal.mouth.a >= 0.01)) {
      addInitLayer('head', '默认嘴巴', (cx) => drawDefaultMouthIntoCtx(cx, pal.mouth));
    } else {
      options.hideDefaultMouth = true;
    }
    dropInitialBlankIfMore('head');

    // 2. Body
    const bodyRegs = resolvedSkin.regions.filter((r) => r.space === 'body');
    const bodyMarks = resolvedSkin.marks.filter((m) => m.space === 'body');
    if (bodyRegs.length || (resolvedSkin.partGradients && resolvedSkin.partGradients.body)) {
      addInitLayer('body', '身体分区与渐变', (cx) => {
        if (resolvedSkin.partGradients && resolvedSkin.partGradients.body) {
          const bg = resolvedSkin.partGradients.body;
          const t0 = partToTex('body', { x: 0, y: -78 });
          const t1 = partToTex('body', { x: 0, y: 16 });
          const g = cx.createLinearGradient(0, t0.y, 0, t1.y);
          g.addColorStop(0, rgbaCss(bg.from));
          g.addColorStop(clamp(bg.stop || 0.5, 0.1, 0.9), rgbaCss(bg.to));
          g.addColorStop(1, rgbaCss(bg.to));
          cx.fillStyle = g;
          cx.fillRect(0, 0, 384, 384);
        }
        for (let i = 0; i < bodyRegs.length; i++) drawPolyPart(cx, 'body', bodyRegs[i].flat, rgbaCss(bodyRegs[i].fill));
      });
    }
    if (bodyMarks.length) {
      addInitLayer('body', '身体花纹', (cx) => {
        for (let i = 0; i < bodyMarks.length; i++) drawMarkToTex(cx, 'body', bodyMarks[i]);
      });
    }
    dropInitialBlankIfMore('body');

    // 3. Ears (leftEar / rightEar)
    ['leftEar', 'rightEar'].forEach((ek) => {
      const earRegs = resolvedSkin.regions.filter((r) => r.space === ek);
      const earMarks = resolvedSkin.marks.filter((m) => m.space === ek);
      const hasEarGrad = resolvedSkin.partGradients && resolvedSkin.partGradients[ek];
      if (hasEarGrad) {
        addInitLayer(ek, '外耳渐变', (cx) => {
          const eg = resolvedSkin.partGradients[ek];
          const t0 = partToTex(ek, { x: 0, y: 0 });
          const t1 = partToTex(ek, { x: 0, y: -100 });
          const g = cx.createLinearGradient(0, t0.y, 0, t1.y);
          g.addColorStop(0, rgbaCss(eg.from));
          g.addColorStop(clamp(eg.stop || 0.5, 0.1, 0.9), rgbaCss(eg.to));
          g.addColorStop(1, rgbaCss(eg.to));
          cx.fillStyle = g;
          cx.fillRect(0, 0, 256, 256);
        });
      }
      if (pal.earInner) {
        addInitLayer(ek, '默认耳窝', (cx) => {
          // Ear inner triangle in ear space matches drawEar3D (~in 24%..tip..out 20%)
          const pIn = partToTex(ek, { x: -24, y: -16 });
          const pOut = partToTex(ek, { x: 26, y: -18 });
          const pTip = partToTex(ek, { x: 0, y: -74 });
          cx.fillStyle = rgbaCss(pal.earInner);
          cx.beginPath();
          cx.moveTo(pIn.x, pIn.y);
          cx.quadraticCurveTo((pIn.x + pTip.x) * 0.5 - 3, (pIn.y + pTip.y) * 0.5, pTip.x, pTip.y);
          cx.quadraticCurveTo((pOut.x + pTip.x) * 0.5 + 3, (pOut.y + pTip.y) * 0.5, pOut.x, pOut.y);
          cx.closePath();
          cx.fill();
        });
      }
      if (earRegs.length || earMarks.length) {
        addInitLayer(ek, '耳朵花纹', (cx) => {
          for (let i = 0; i < earRegs.length; i++) drawPolyPart(cx, ek, earRegs[i].flat, rgbaCss(earRegs[i].fill));
          for (let i = 0; i < earMarks.length; i++) drawMarkToTex(cx, ek, earMarks[i]);
        });
      }
      dropInitialBlankIfMore(ek);
    });

    // 4. Arms & HindLeg (note: rasterize paw sock when pal.paws != limbBaseCol so paws remain editable!)
    [
      { key: 'leftArm', base: pal.legs, paw: pal.paws },
      { key: 'rightArm', base: pal.legs, paw: pal.paws },
      { key: 'hindLeg', base: pal.hindLeg || pal.legs, paw: pal.hindPaw || pal.paws }
    ].forEach(({ key, base, paw }) => {
      const regs = resolvedSkin.regions.filter((r) => r.space === key);
      const marks = resolvedSkin.marks.filter((m) => m.space === key);
      const hasGrad = resolvedSkin.partGradients && resolvedSkin.partGradients[key];
      if (hasGrad || resolvedSkin.colorpoint) {
        addInitLayer(key, '四肢渐变底色', (cx) => {
          if (hasGrad) {
            const lg = resolvedSkin.partGradients[key];
            const t0 = partToTex(key, { x: 0, y: 0 });
            const t1 = partToTex(key, { x: 100, y: 0 });
            const g = cx.createLinearGradient(t0.x, 0, t1.x, 0);
            g.addColorStop(0, rgbaCss(lg.from));
            g.addColorStop(clamp(lg.stop || 0.5, 0.1, 0.9), rgbaCss(lg.to));
            g.addColorStop(1, rgbaCss(lg.to));
            cx.fillStyle = g;
            cx.fillRect(0, 0, 256, 256);
          } else if (resolvedSkin.colorpoint && pal.points) {
            const mid = pal.pointsMid || pal.points;
            const t0 = partToTex(key, { x: 0, y: 0 });
            const t1 = partToTex(key, { x: 100, y: 0 });
            const g = cx.createLinearGradient(t0.x, 0, t1.x, 0);
            g.addColorStop(0, rgbaCss(pal.body, 0));
            g.addColorStop(0.2, rgbaCss(pal.body, 1));
            g.addColorStop(0.55, rgbaCss(mid, 1));
            g.addColorStop(0.85, rgbaCss(pal.points, 1));
            cx.fillStyle = g;
            cx.fillRect(0, 0, 256, 256);
          }
        });
      }
      if (regs.length || marks.length) {
        addInitLayer(key, '花纹层', (cx) => {
          for (let i = 0; i < regs.length; i++) drawPolyPart(cx, key, regs[i].flat, rgbaCss(regs[i].fill));
          for (let i = 0; i < marks.length; i++) drawMarkToTex(cx, key, marks[i]);
        });
      }
      if (paw && base && !sameColor(paw, base)) {
        addInitLayer(key, '默认爪套', (cx) => {
          const pStart = partToTex(key, { x: 72, y: 0 });
          const sp = PART_SPECS[key];
          cx.fillStyle = rgbaCss(paw);
          cx.fillRect(pStart.x, 0, sp.width - pStart.x, sp.height);
        });
      }
      dropInitialBlankIfMore(key);
    });

    // 5. Tail
    const tailRegs = resolvedSkin.regions.filter((r) => r.space === 'tail');
    const tailMarks = resolvedSkin.marks.filter((m) => m.space === 'tail');
    if (resolvedSkin.partGradients && resolvedSkin.partGradients.tail) {
      addInitLayer('tail', '尾巴渐变', (cx) => {
        const tg = resolvedSkin.partGradients.tail;
        const t0 = partToTex('tail', { x: 0, y: 0 });
        const t1 = partToTex('tail', { x: 100, y: 0 });
        const g = cx.createLinearGradient(t0.x, 0, t1.x, 0);
        g.addColorStop(0, rgbaCss(tg.from));
        g.addColorStop(clamp(tg.stop || 0.5, 0.1, 0.9), rgbaCss(tg.to));
        g.addColorStop(1, rgbaCss(tg.to));
        cx.fillStyle = g;
        cx.fillRect(0, 0, 256, 256);
      });
    }
    if (tailRegs.length || tailMarks.length) {
      addInitLayer('tail', '尾巴花纹', (cx) => {
        for (let i = 0; i < tailRegs.length; i++) drawPolyPart(cx, 'tail', tailRegs[i].flat, rgbaCss(tailRegs[i].fill));
        for (let i = 0; i < tailMarks.length; i++) drawMarkToTex(cx, 'tail', tailMarks[i]);
      });
    }
    if (pal.tailTip) {
      addInitLayer('tail', '尾尖配色', (cx) => {
        const pStart = partToTex('tail', { x: 78, y: 0 });
        cx.fillStyle = rgbaCss(pal.tailTip);
        cx.fillRect(pStart.x, 0, 256 - pStart.x, 256);
      });
    }
    dropInitialBlankIfMore('tail');

    // 6. Eyes (leftIris, rightIris)
    addInitLayer('leftIris', '默认虹膜', (cx) => drawDefaultIrisIntoCtx(cx, pal.irisLeft || pal.iris, eyeThemeName));
    dropInitialBlankIfMore('leftIris');
    addInitLayer('rightIris', '默认虹膜', (cx) => drawDefaultIrisIntoCtx(cx, pal.irisRight || pal.iris, eyeThemeName));
    dropInitialBlankIfMore('rightIris');

    // 7. Sitting hind paws (leftHindPaw, rightHindPaw)
    addInitLayer('leftHindPaw', '默认肉垫', (cx) => drawDefaultHindPawIntoCtx(cx, pal));
    dropInitialBlankIfMore('leftHindPaw');
    addInitLayer('rightHindPaw', '默认肉垫', (cx) => drawDefaultHindPawIntoCtx(cx, pal));
    dropInitialBlankIfMore('rightHindPaw');

    recompositeAll();
    emitChange('reset');
    return Promise.resolve();
  }

  function encodeCanvasBase64Png(c) {
    if (!c || !isCanvasNonEmpty(c)) return null;
    const url = c.toDataURL('image/png');
    return url.replace(/^data:image\/png;base64,/, '');
  }

  // Write flattened 1.6.0 partTextures into an exported .kurocat object and strip rasterized legacy vectors
  function applyToExportObject(exportObj) {
    if (!exportObj || typeof exportObj !== 'object') return exportObj;
    const out = Object.assign({}, exportObj);
    const pt = {};
    let count = 0;
    for (let i = 0; i < PART_KEYS.length; i++) {
      const tk = PART_KEYS[i];
      const p = parts[tk];
      if (!p) continue;
      const b64 = encodeCanvasBase64Png(p.compositeCanvas);
      if (b64) {
        pt[tk] = b64;
        count++;
      }
    }
    if (count > 0) {
      out.partTextures = pt;
      out.partTextureOptions = {};
      if (options.hideDefaultPupil) out.partTextureOptions.hideDefaultPupil = true;
      if (pt.head || options.hideDefaultNose) out.partTextureOptions.hideDefaultNose = true;
      if (pt.head || options.hideDefaultMouth) out.partTextureOptions.hideDefaultMouth = true;
      if (!Object.keys(out.partTextureOptions).length) delete out.partTextureOptions;
      // Clear rasterized vector arrays so legacy geometry doesn't double-render underneath
      delete out.regions;
      delete out.marks;
      // Re-run Spec.sanitizeForExport so formatVersion: 2 and minAppVersion: "1.6.0" are computed cleanly
      return Spec.sanitizeForExport(out, out.preview);
    }
    return exportObj;
  }

  function applyLiveTexturesIntoRaw(rawSkin) {
    // Only updates metadata on export; live rendering uses attachToResolvedSkin()
    return rawSkin;
  }

  function setOption(key, value) {
    if (!(key in options)) return;
    pushUndoEntry([], '修改透明贴图选项');
    options[key] = Boolean(value);
    emitChange('options');
    scheduleSave();
  }

  function getOptions() {
    return Object.assign({}, options);
  }

  // --- Multi-Layer Project Serialization (IndexedDB & Layered .kurocat-layers.json Export/Import) ---
  function serializeProject(rawSkin) {
    const serParts = {};
    for (let i = 0; i < PART_KEYS.length; i++) {
      const tk = PART_KEYS[i];
      const p = parts[tk];
      serParts[tk] = {
        activeLayerId: p.activeLayerId,
        layers: p.layers.map((l) => {
          const src = getLayerRenderSource(tk, l);
          return {
            id: l.id,
            name: l.name,
            visible: l.visible,
            opacity: l.opacity,
            blendMode: l.blendMode,
            clipToBelow: l.clipToBelow,
            alphaLock: l.alphaLock,
            png: isCanvasNonEmpty(src) ? src.toDataURL('image/png') : null
          };
        })
      };
    }
    return {
      projectFormat: 1,
      appVersion: '1.6.0',
      savedAt: Date.now(),
      skin: rawSkin ? JSON.parse(JSON.stringify(rawSkin)) : null,
      options: Object.assign({}, options),
      parts: serParts
    };
  }

  async function restoreProject(proj) {
    if (!proj || typeof proj !== 'object' || !proj.parts) return false;
    if (floatingTransform) floatingTransform = null;
    undoStack.length = 0;
    redoStack.length = 0;
    if (proj.options) {
      options = {
        hideDefaultPupil: Boolean(proj.options.hideDefaultPupil),
        hideDefaultNose: Boolean(proj.options.hideDefaultNose),
        hideDefaultMouth: Boolean(proj.options.hideDefaultMouth)
      };
    }
    const loads = [];
    for (let i = 0; i < PART_KEYS.length; i++) {
      const tk = PART_KEYS[i];
      const sp = PART_SPECS[tk];
      const srcPart = proj.parts[tk];
      if (!srcPart || !Array.isArray(srcPart.layers) || !srcPart.layers.length) {
        initPart(tk);
        continue;
      }
      const comp = makeCanvas(sp.width, sp.height);
      const restoredLayers = srcPart.layers.map((sl) => {
        const c = makeCanvas(sp.width, sp.height);
        const layerObj = {
          id: sl.id || nextLayerId(),
          name: String(sl.name || '图层').slice(0, 28),
          visible: sl.visible !== false,
          opacity: typeof sl.opacity === 'number' ? clamp(sl.opacity, 0, 1) : 1,
          blendMode: BLEND_MODES.some((b) => b.id === sl.blendMode) ? sl.blendMode : 'normal',
          clipToBelow: Boolean(sl.clipToBelow),
          alphaLock: Boolean(sl.alphaLock),
          canvas: c
        };
        if (sl.png) {
          loads.push(new Promise((res) => {
            const img = new Image();
            img.onload = () => {
              c.getContext('2d').drawImage(img, 0, 0, sp.width, sp.height);
              res();
            };
            img.onerror = () => res();
            img.src = sl.png;
          }));
        }
        return layerObj;
      });
      if (restoredLayers[0]) restoredLayers[0].clipToBelow = false;
      parts[tk] = {
        texKey: tk,
        width: sp.width,
        height: sp.height,
        layers: restoredLayers,
        activeLayerId: srcPart.activeLayerId || restoredLayers[restoredLayers.length - 1].id,
        compositeCanvas: comp,
        rev: 1
      };
    }
    await Promise.all(loads);
    recompositeAll();
    emitChange('reset');
    return true;
  }

  function openIDB() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('no idb')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  let getRawSkinFn = null;
  function setRawSkinGetter(fn) {
    getRawSkinFn = fn;
  }

  async function saveToIndexedDBNow() {
    try {
      const db = await openIDB();
      const raw = getRawSkinFn ? getRawSkinFn() : null;
      const payload = serializeProject(raw);
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(payload, DB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (_) {
      // Ignore storage quota or private-mode IDB restriction
    }
  }

  async function loadFromIndexedDB() {
    try {
      const db = await openIDB();
      const payload = await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get(DB_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return payload;
    } catch (_) {
      return null;
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveToIndexedDBNow(); }, 650);
  }

  function onChange(fn) {
    if (typeof fn === 'function') changeListeners.push(fn);
  }

  function emitChange(kind) {
    for (let i = 0; i < changeListeners.length; i++) {
      try { changeListeners[i](kind); } catch (_) {}
    }
  }

  global.KuroPixelLayers = {
    PART_KEYS,
    PART_SPECS,
    BLEND_MODES,
    partToTex,
    texToPart,
    getPart,
    getLayers,
    getActiveLayer,
    setActiveLayer,
    recompositePart,
    recompositeAll,
    attachToResolvedSkin,
    addLayer,
    deleteLayer,
    clearLayer,
    clearPartAll,
    clearAutoBakedBaseLayers,
    renameLayer,
    setLayerProp,
    moveLayer,
    mergeLayerDown,
    duplicateLayer,
    beginBrushStroke,
    continueBrushStroke,
    finishBrushStroke,
    finishBrushStrokePair,
    floodFillBucket,
    sampleCompositeHex,
    getFloatingTransform,
    hasFloatingTransformFor,
    createSelectionFromPartPolygon,
    importImageAsLayer,
    updateFloatingTransform,
    duplicateFloatingTransform,
    deleteFloatingTransform,
    removeFloatingWhiteBg,
    commitFloatingTransform,
    cancelFloatingTransform,
    canUndo,
    canRedo,
    undo,
    redo,
    pushUndoEntry,
    rasterizeFromSkin,
    applyToExportObject,
    applyLiveTexturesIntoRaw,
    setOption,
    getOptions,
    serializeProject,
    restoreProject,
    setRawSkinGetter,
    saveToIndexedDBNow,
    loadFromIndexedDB,
    scheduleSave,
    onChange,
    setSignature: (sig) => { skinSignatureLoaded = sig; },
    getSignature: () => skinSignatureLoaded
  };
})(window);
