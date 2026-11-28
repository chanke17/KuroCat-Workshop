/* KuroCat 1.6.0 Exploded-View Component Studio & Light-PS Transparent Pixel Layer Editor */
(function (global) {
  'use strict';

  const Spec = global.KuroSpec;
  const Renderer = global.KuroRenderer;
  const Layers = global.KuroPixelLayers;
  const clamp = Spec.clamp;
  const round2 = Spec.round2;

  const SWATCH_COLORS = [
    '#1A1A1E', '#3B3430', '#6E6660', '#B5AEA6', '#F4EFE6', '#FFFFFF',
    '#E89B4C', '#C96A28', '#8C5222', '#F4A9B8', '#E56B6F', '#E9C44A',
    '#7BC47F', '#6CB4EE'
  ];

  // 9 intuitive paintable components covering all 12 canonical partTextures
  const PARTS = [
    { id: 'ears', label: '耳朵', spaces: ['leftEar', 'rightEar'], canMirror: true, defaultMirror: true, explodeDx: 0, explodeDy: -86 },
    { id: 'head', label: '头部', spaces: ['head'], canMirror: true, defaultMirror: true, explodeDx: 0, explodeDy: -36 },
    { id: 'eyes', label: '眼睛', spaces: ['leftIris', 'rightIris'], canMirror: true, defaultMirror: true, explodeDx: -126, explodeDy: -78 },
    { id: 'body', label: '身体', spaces: ['body'], canMirror: true, defaultMirror: true, explodeDx: 0, explodeDy: 46 },
    { id: 'leftArm', label: '左手臂', spaces: ['leftArm'], canMirror: true, defaultMirror: true, explodeDx: -146, explodeDy: -2 },
    { id: 'rightArm', label: '右手臂', spaces: ['rightArm'], canMirror: true, defaultMirror: true, explodeDx: 146, explodeDy: -2 },
    { id: 'hindLeg', label: '后腿', spaces: ['hindLeg'], canMirror: false, defaultMirror: false, explodeDx: -136, explodeDy: 108 },
    { id: 'hindPaws', label: '坐姿后爪', spaces: ['leftHindPaw', 'rightHindPaw'], canMirror: true, defaultMirror: true, explodeDx: 0, explodeDy: 118 },
    { id: 'tail', label: '尾巴', spaces: ['tail'], canMirror: false, defaultMirror: false, explodeDx: 122, explodeDy: 106 }
  ];

  const PART_BY_ID = {};
  for (let i = 0; i < PARTS.length; i++) PART_BY_ID[PARTS[i].id] = PARTS[i];

  // Logical world size (600x460), mapped isotropically into full-bleed canvas CSS size (viewW x viewH)
  const CW = 600;
  const CH = 460;
  let viewW = CW;
  let viewH = CH;
  let fitScale = 1.0;
  let fitOffX = 0;
  let fitOffY = 0;

  let mode = 'hero'; // 'hero' | 'exploded' | 'part'
  let selectedPartId = 'head';
  let activeSubTexKeyByPart = {
    ears: 'leftEar',
    eyes: 'leftIris',
    hindPaws: 'leftHindPaw'
  };
  let hoverPartId = null;

  // Animation states
  let explodeT = 0;
  let explodeTarget = 0;
  let explodeStartT = 0;
  let explodeAnimStart = 0;
  let explodeAnimDur = 560;

  let zoomT = 0;
  let zoomTarget = 0;
  let zoomStartT = 0;
  let zoomAnimStart = 0;
  let zoomAnimDur = 280;

  let rafId = 0;

  // Brush & tool states
  // Tools: 'selectRect' | 'selectLasso' | 'pen' | 'calligraphy' | 'soft' | 'airbrush' | 'smudge' | 'fillBrush' | 'bucket' | 'eraser' | 'eyedropper'
  let activeTool = 'calligraphy';
  let prevDrawTool = 'calligraphy';
  let brushColor = '#1A1A1E';
  let brushSize = 4.2;
  let brushAlpha = 1.0;
  let bucketTolerance = 32;
  let mirrorEnabled = true;

  // Active pixel stroke session state
  let drawing = false;
  let activeStrokePrimary = null;
  let activeStrokeMirror = null;
  let activeDrawSpace = 'head';
  let cursorCanvasPt = null;
  let lastPaintSyncAt = 0;

  // Selection marquee / lasso / floating transform state
  let marqueeDraft = null; // { kind: 'rect'|'lasso', texKey, startW, curW, ptsW: [] }
  let transformDrag = null; // { mode: 'move'|'scale'|'rotate', corner, startW, cx, cy, scaleX, scaleY, rot, startAngle, startDist }

  // Top-right PS floating corner state
  let activeCornerTab = null; // null | 'brush' | 'body' | 'layers'

  // Skeleton drag state on floating live #cat-canvas
  let skeletonMode = false;
  let activeSkeletonHandle = null;
  let hoverSkeletonHandle = null;
  let skeletonDragStart = null;
  let autoHindPoseActive = false;
  let mountedInspectorKey = '';
  let mountedLayersKey = '';

  // Part paint viewport zoom & pan state (0.6x ~ 4.0x)
  const VIEW_ZOOM_MIN = 0.6;
  const VIEW_ZOOM_MAX = 4.0;
  let viewZoom = 1.0;
  let viewPanX = 0;
  let viewPanY = 0;
  let panToolActive = false;
  let spacePanHeld = false;
  let panning = false;
  let panPointerId = null;
  let panStart = null;
  const activeTouches = {};
  let pinchPrev = null;

  // Checkerboard pattern cache
  let checkerPatternCanvas = null;

  // DOM refs (resolved on init)
  let canvas = null;
  let ctx = null;
  let workbenchEl = null;
  let heroOverlayEl = null;
  let leftPaneEl = null;
  let partHeaderEl = null;
  let partBackBtn = null;
  let partPillsWrap = null;
  let mirrorToggleEl = null;
  let clearPartBtn = null;
  let importImgInput = null;
  let brushDockEl = null;
  let inspectorEl = null;
  let layersPaneEl = null;
  let quickToolsEl = null;
  let floatingCornerEl = null;
  let cornerDrawerEl = null;
  let drawerTitleEl = null;
  let brushDotEl = null;
  let layerCountEl = null;
  let activeLayerPillEl = null;
  let activeLayerNameEl = null;
  let selectionBarEl = null;
  let selInfoEl = null;
  let selDebgBtn = null;
  let skeletonToggleBtn = null;
  let sizeInput = null;
  let sizeValEl = null;
  let alphaInput = null;
  let alphaValEl = null;
  let bucketTolRow = null;
  let bucketTolInput = null;
  let bucketTolValEl = null;
  let colorInput = null;
  let swatchesWrap = null;
  let zoomBarEl = null;
  let zoomOutBtn = null;
  let zoomInBtn = null;
  let zoomResetBtn = null;
  let panToggleBtn = null;

  function API() {
    return global.KuroWorkshopAPI;
  }

  function getSkin() {
    const api = API();
    return api ? api.getResolvedSkin() : null;
  }

  function getRaw() {
    const api = API();
    return api ? api.getRawSkin() : null;
  }

  function isDualPart(partId) {
    return partId === 'ears' || partId === 'eyes' || partId === 'hindPaws';
  }

  function getDefaultTexKeyForPart(partId) {
    const p = PART_BY_ID[partId];
    if (!p) return 'head';
    if (isDualPart(partId)) {
      const saved = activeSubTexKeyByPart[partId];
      if (saved && p.spaces.indexOf(saved) !== -1) return saved;
    }
    return p.spaces[0];
  }

  function setActiveSubTexKey(partId, texKey) {
    const p = PART_BY_ID[partId];
    if (!p || p.spaces.indexOf(texKey) === -1) return;
    if (isDualPart(partId)) {
      activeSubTexKeyByPart[partId] = texKey;
    }
  }

  function getCheckerPattern(ctxRef) {
    if (!checkerPatternCanvas) {
      checkerPatternCanvas = document.createElement('canvas');
      checkerPatternCanvas.width = 16;
      checkerPatternCanvas.height = 16;
      const cx = checkerPatternCanvas.getContext('2d');
      cx.fillStyle = 'rgba(255,255,255,0.22)';
      cx.fillRect(0, 0, 16, 16);
      cx.fillStyle = 'rgba(130,115,98,0.12)';
      cx.fillRect(0, 0, 8, 8);
      cx.fillRect(8, 8, 8, 8);
    }
    return ctxRef.createPattern(checkerPatternCanvas, 'repeat');
  }

  function notifyChange(commitNow, fastPaint) {
    const api = API();
    if (!api) return;
    api.syncSkin(false, fastPaint ? { fastPaint: true } : undefined);
    if (commitNow && typeof api.commitHistoryNow === 'function') {
      api.commitHistoryNow();
    }
    requestRedraw();
  }

  function notifyFloatingPet() {
    const api = API();
    if (api && typeof api.refreshFloatingPet === 'function') {
      api.refreshFloatingPet();
    }
  }

  function springOut(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const c1 = 1.35;
    const c3 = c1 + 1;
    const u = t - 1;
    return 1 + c3 * u * u * u + c1 * u * u;
  }

  function easeOutCubic(t) {
    const u = 1 - clamp(t, 0, 1);
    return 1 - u * u * u;
  }

  function rgbaCss(c, alphaMul) {
    return Spec.rgbaToCss(c, alphaMul);
  }

  function colorToHex(c, fallback) {
    if (!c) return fallback || '#1A1A1E';
    if (typeof c === 'string') return Spec.isValidHex(c) ? c.slice(0, 7).toUpperCase() : (fallback || '#1A1A1E');
    return Spec.rgbToHex(c.r * 255, c.g * 255, c.b * 255);
  }

  function partFillStyle(ctxRef, skin, space, x0, y0, x1, y1, fallbackColor) {
    const grad = skin && skin.partGradients && skin.partGradients[space];
    if (grad) {
      const g = ctxRef.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, rgbaCss(grad.from));
      g.addColorStop(clamp(grad.stop || 0.5, 0.1, 0.9), rgbaCss(grad.to));
      g.addColorStop(1, rgbaCss(grad.to));
      return g;
    }
    return rgbaCss(fallbackColor);
  }

  // -------------------------------------------------------------------------
  // Part Coordinate Systems (matched 1:1 with Spec.PART_TEXTURE_SPECS & renderer.js)
  // -------------------------------------------------------------------------
  const TAIL_EDGE_Y = 5.5;
  const TAIL_BOARD_Y = 12.0; // PART_TEXTURE_SPECS.tail has y in [-10, 10] -> ±120px

  const PART_VIEW = {
    head: {
      scale: 3.55,
      toCanvas: (p) => ({ x: CW * 0.5 + p.x * 3.55, y: CH * 0.52 + p.y * 3.55 }),
      fromCanvas: (c) => ({ x: (c.x - CW * 0.5) / 3.55, y: (c.y - CH * 0.52) / 3.55 })
    },
    ears: {
      scale: 2.0,
      // Left ear centered at CW*0.29, Right ear centered at CW*0.71; inner is p.x < 0, outer is p.x > 0
      toCanvasFor: (p, space) => {
        const isLeft = space !== 'rightEar';
        const sign = isLeft ? -1 : 1;
        const cx = isLeft ? CW * 0.29 : CW * 0.71;
        return { x: cx + sign * p.x * 2.0, y: CH * 0.80 + p.y * 2.0 };
      },
      fromCanvasAuto: (c) => {
        const isLeft = c.x < CW * 0.5;
        const space = isLeft ? 'leftEar' : 'rightEar';
        const sign = isLeft ? -1 : 1;
        const cx = isLeft ? CW * 0.29 : CW * 0.71;
        return { space, x: ((c.x - cx) / 2.0) * sign, y: (c.y - CH * 0.80) / 2.0 };
      }
    },
    eyes: {
      scale: 6.8,
      // Split leftIris ([-14,14]x[-13,13]) & rightIris side-by-side
      toCanvasFor: (p, space) => {
        const cx = space === 'rightIris' ? CW * 0.70 : CW * 0.30;
        return { x: cx + p.x * 6.8, y: CH * 0.50 + p.y * 6.8 };
      },
      fromCanvasAuto: (c) => {
        const isRight = c.x >= CW * 0.5;
        const space = isRight ? 'rightIris' : 'leftIris';
        const cx = isRight ? CW * 0.70 : CW * 0.30;
        return { space, x: (c.x - cx) / 6.8, y: (c.y - CH * 0.50) / 6.8 };
      }
    },
    body: {
      scale: 2.95,
      toCanvas: (p) => ({ x: CW * 0.5 + p.x * 2.95, y: CH * 0.86 + p.y * 2.95 }),
      fromCanvas: (c) => ({ x: (c.x - CW * 0.5) / 2.95, y: (c.y - CH * 0.86) / 2.95 })
    },
    leftArm: {
      scale: 3.4,
      // Canonical limb UV: x in [-8, +122] top->bottom, y in [-14, +14] right(inner)->left(outer)
      toCanvas: (p) => ({ x: CW * 0.5 - p.y * 6.0, y: 40 + ((p.x + 8) / 130) * (CH - 80) }),
      fromCanvas: (c) => ({ x: ((c.y - 40) / (CH - 80)) * 130 - 8, y: (CW * 0.5 - c.x) / 6.0 })
    },
    rightArm: {
      scale: 3.4,
      toCanvas: (p) => ({ x: CW * 0.5 + p.y * 6.0, y: 40 + ((p.x + 8) / 130) * (CH - 80) }),
      fromCanvas: (c) => ({ x: ((c.y - 40) / (CH - 80)) * 130 - 8, y: (c.x - CW * 0.5) / 6.0 })
    },
    hindLeg: {
      scale: 3.4,
      toCanvas: (p) => ({ x: CW * 0.5 + p.y * 6.0, y: 40 + ((p.x + 8) / 130) * (CH - 80) }),
      fromCanvas: (c) => ({ x: ((c.y - 40) / (CH - 80)) * 130 - 8, y: (c.x - CW * 0.5) / 6.0 })
    },
    hindPaws: {
      scale: 88.0,
      // Canonical [-1.1, +1.1] x [-1.1, +1.1] normalized hind paw disk
      toCanvasFor: (p, space) => {
        const cx = space === 'rightHindPaw' ? CW * 0.70 : CW * 0.30;
        return { x: cx + p.x * 88.0, y: CH * 0.50 + p.y * 88.0 };
      },
      fromCanvasAuto: (c) => {
        const isRight = c.x >= CW * 0.5;
        const space = isRight ? 'rightHindPaw' : 'leftHindPaw';
        const cx = isRight ? CW * 0.70 : CW * 0.30;
        return { space, x: (c.x - cx) / 88.0, y: (c.y - CH * 0.50) / 88.0 };
      }
    },
    tail: {
      scale: 3.9,
      // Canonical tail UV: x in [-10, +114] left->right, y in [-10, +10] top->bottom
      toCanvas: (p) => ({ x: 54 + ((p.x + 10) / 124) * (CW - 108), y: CH * 0.5 + p.y * TAIL_BOARD_Y }),
      fromCanvas: (c) => ({ x: ((c.x - 54) / (CW - 108)) * 124 - 10, y: (c.y - CH * 0.5) / TAIL_BOARD_Y })
    }
  };

  function brushPartSizeFor(partId) {
    const viewScale = (PART_VIEW[partId] && PART_VIEW[partId].scale) || 3.55;
    return brushSize * (3.55 / viewScale);
  }

  function toPartCanvas(partId, pt, spaceOverride) {
    if (isDualPart(partId)) {
      return PART_VIEW[partId].toCanvasFor(pt, spaceOverride || getDefaultTexKeyForPart(partId));
    }
    return PART_VIEW[partId].toCanvas(pt);
  }

  function fromPartCanvas(partId, cPt) {
    if (isDualPart(partId)) {
      return PART_VIEW[partId].fromCanvasAuto(cPt);
    }
    const p = PART_VIEW[partId].fromCanvas(cPt);
    if (partId === 'body') {
      const skin = getSkin();
      const bw = (skin && skin.shape && skin.shape.bodyWidth) || 1;
      return { space: 'body', x: p.x / bw, y: p.y };
    }
    return { space: partId === 'head' ? 'head' : partId, x: p.x, y: p.y };
  }

  function getCompositeOf(texKey) {
    const part = Layers ? Layers.getPart(texKey) : null;
    return part ? part.compositeCanvas : null;
  }

  // Draw texture composite mapped accurately to PART_VIEW[partId] for overview or part paint canvas
  function drawPartTextureIntoBoard(ctxRef, partId, texKey, skin) {
    const comp = getCompositeOf(texKey);
    const sp = Spec.PART_TEXTURE_SPECS[texKey];
    if (!comp || !sp) return;
    ctxRef.save();
    ctxRef.imageSmoothingEnabled = true;
    ctxRef.imageSmoothingQuality = 'high';

    if (partId === 'head') {
      const tl = PART_VIEW.head.toCanvas({ x: sp.x0, y: sp.y0 });
      const br = PART_VIEW.head.toCanvas({ x: sp.x1, y: sp.y1 });
      ctxRef.drawImage(comp, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    } else if (partId === 'body') {
      const bw = (skin && skin.shape && skin.shape.bodyWidth) || 1;
      const tl = PART_VIEW.body.toCanvas({ x: sp.x0 * bw, y: sp.y0 });
      const br = PART_VIEW.body.toCanvas({ x: sp.x1 * bw, y: sp.y1 });
      ctxRef.drawImage(comp, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    } else if (partId === 'ears') {
      const isLeft = texKey !== 'rightEar';
      const cx = isLeft ? CW * 0.29 : CW * 0.71;
      const w = (sp.x1 - sp.x0) * 2.0;
      const h = (sp.y1 - sp.y0) * 2.0;
      if (isLeft) {
        ctxRef.translate(cx, CH * 0.80);
        ctxRef.scale(-1, 1);
        ctxRef.drawImage(comp, sp.x0 * 2.0, sp.y0 * 2.0, w, h);
      } else {
        ctxRef.drawImage(comp, cx + sp.x0 * 2.0, CH * 0.80 + sp.y0 * 2.0, w, h);
      }
    } else if (partId === 'eyes') {
      const tl = PART_VIEW.eyes.toCanvasFor({ x: sp.x0, y: sp.y0 }, texKey);
      const br = PART_VIEW.eyes.toCanvasFor({ x: sp.x1, y: sp.y1 }, texKey);
      ctxRef.drawImage(comp, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    } else if (partId === 'hindPaws') {
      const tl = PART_VIEW.hindPaws.toCanvasFor({ x: sp.x0, y: sp.y0 }, texKey);
      const br = PART_VIEW.hindPaws.toCanvasFor({ x: sp.x1, y: sp.y1 }, texKey);
      ctxRef.drawImage(comp, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    } else if (partId === 'leftArm') {
      const topRight = PART_VIEW.leftArm.toCanvas({ x: sp.x0, y: sp.y0 }); // (CW*0.5 + 14*6, 40)
      const botLeft = PART_VIEW.leftArm.toCanvas({ x: sp.x1, y: sp.y1 });  // (CW*0.5 - 14*6, CH-40)
      const boxH = botLeft.y - topRight.y;
      const boxW = topRight.x - botLeft.x;
      ctxRef.translate(topRight.x, topRight.y);
      ctxRef.rotate(Math.PI * 0.5);
      ctxRef.drawImage(comp, 0, 0, boxH, boxW);
    } else if (partId === 'rightArm' || partId === 'hindLeg') {
      const topLeft = PART_VIEW[partId].toCanvas({ x: sp.x0, y: sp.y0 }); // (CW*0.5 - 14*6, 40)
      const botRight = PART_VIEW[partId].toCanvas({ x: sp.x1, y: sp.y1 }); // (CW*0.5 + 14*6, CH-40)
      const boxH = botRight.y - topLeft.y;
      const boxW = botRight.x - topLeft.x;
      ctxRef.translate(topLeft.x, topLeft.y);
      ctxRef.rotate(Math.PI * 0.5);
      ctxRef.scale(1, -1);
      ctxRef.drawImage(comp, 0, 0, boxH, boxW);
    } else if (partId === 'tail') {
      const tl = PART_VIEW.tail.toCanvas({ x: sp.x0, y: sp.y0 });
      const br = PART_VIEW.tail.toCanvas({ x: sp.x1, y: sp.y1 });
      ctxRef.drawImage(comp, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    }
    ctxRef.restore();
  }

  // -------------------------------------------------------------------------
  // Exploded View: Draw & Hit-Test the 9 Floating Components
  // -------------------------------------------------------------------------
  function getExplodedMetrics(skin, t) {
    const s = skin.shape;
    const cx = CW * 0.5;
    const cy = CH * 0.50;
    const bw = s.bodyWidth || 1;
    const hs = s.headScale || 1;
    const cf = s.cheekFullness || 1;
    const es = s.earSize || 1;
    const esp = s.earSpacing || 1;
    const armSp = s.armSpacing || 1;
    const armRY = s.armRootY || 0;
    const armLen = s.armLength || 1;
    const tl = s.tailLength || 1;
    const trY = s.tailRootY || 0;

    const S = 1.85;
    const bodyBaseX = cx;
    const bodyBaseY = cy + 60;
    const headBaseX = cx;
    const headBaseY = cy - 48;
    const earsBaseX = cx;
    const earsBaseY = headBaseY - 38 * hs;
    const eyesBaseX = headBaseX - 30;
    const eyesBaseY = headBaseY - 6;
    const armSpreadX = 30 * bw * armSp;
    const armTopY = bodyBaseY - 54 + armRY * 1.25;
    const armSpanH = 74 * armLen;
    const tailRootX = bodyBaseX + 58 * bw;
    const tailRootY = bodyBaseY - 8 + trY * 1.25;

    return {
      S, bw, hs, cf, es, esp, armSp, armRY, armLen, tl,
      ears: {
        x: earsBaseX + PART_BY_ID.ears.explodeDx * t,
        y: earsBaseY + PART_BY_ID.ears.explodeDy * t,
        hit: { rx: 86 * esp * hs, ry: 44 * es * hs }
      },
      head: {
        x: headBaseX + PART_BY_ID.head.explodeDx * t,
        y: headBaseY + PART_BY_ID.head.explodeDy * t,
        hit: { rx: 82 * hs * cf, ry: 70 * hs }
      },
      eyes: {
        x: eyesBaseX + PART_BY_ID.eyes.explodeDx * t,
        y: eyesBaseY + PART_BY_ID.eyes.explodeDy * t,
        hit: { rx: 52, ry: 28 }
      },
      body: {
        x: bodyBaseX + PART_BY_ID.body.explodeDx * t,
        y: bodyBaseY + PART_BY_ID.body.explodeDy * t,
        hit: { rx: 94 * bw, ry: 78 }
      },
      leftArm: {
        x: (bodyBaseX - armSpreadX) + PART_BY_ID.leftArm.explodeDx * t,
        y: armTopY + PART_BY_ID.leftArm.explodeDy * t,
        h: armSpanH,
        hit: { rx: 32, ry: armSpanH * 0.58 + 18 }
      },
      rightArm: {
        x: (bodyBaseX + armSpreadX) + PART_BY_ID.rightArm.explodeDx * t,
        y: armTopY + PART_BY_ID.rightArm.explodeDy * t,
        h: armSpanH,
        hit: { rx: 32, ry: armSpanH * 0.58 + 18 }
      },
      hindLeg: {
        x: (bodyBaseX - 50 * bw) + PART_BY_ID.hindLeg.explodeDx * t,
        y: (bodyBaseY - 12) + PART_BY_ID.hindLeg.explodeDy * t,
        w: 66 * (s.hindLegReach || 1),
        thick: 24 * (s.hindLegWidth || 1),
        hit: { rx: 52, ry: 30 }
      },
      hindPaws: {
        x: cx + PART_BY_ID.hindPaws.explodeDx * t,
        y: (bodyBaseY + 26) + PART_BY_ID.hindPaws.explodeDy * t,
        hit: { rx: 54, ry: 28 }
      },
      tail: {
        x: tailRootX + PART_BY_ID.tail.explodeDx * t,
        y: tailRootY + PART_BY_ID.tail.explodeDy * t,
        len: 108 * tl,
        hit: { rx: 66 * tl, ry: 42 }
      }
    };
  }

  function traceEarTriangle(ctxRef, baseX, baseY, sign, scaleX, scaleY, earSize, baseW, pointiness) {
    const w = 36 * baseW * earSize * scaleX;
    const h = 58 * earSize * scaleY;
    const inX = baseX - sign * w * 0.48;
    const outX = baseX + sign * w * 0.52;
    const tipX = baseX + sign * w * 0.14;
    const tipY = baseY - h;
    const tipSpread = (5.5 / clamp(pointiness || 1, 0.5, 1.5)) * scaleX;

    ctxRef.beginPath();
    ctxRef.moveTo(inX, baseY);
    ctxRef.quadraticCurveTo((inX + tipX) * 0.5 - sign * 3, (baseY + tipY) * 0.5 - 4, tipX - sign * tipSpread, tipY + 4);
    ctxRef.quadraticCurveTo(tipX, tipY - 3 * (pointiness || 1), tipX + sign * tipSpread, tipY + 5);
    ctxRef.quadraticCurveTo((outX + tipX) * 0.5 + sign * 4, (baseY + tipY) * 0.5 - 4, outX, baseY);
    ctxRef.closePath();
    return { inX, outX, baseY, tipX, tipY };
  }

  function drawFloatingShadow(ctxRef, active) {
    ctxRef.shadowColor = active ? 'rgba(217, 119, 54, 0.28)' : 'rgba(34, 24, 16, 0.14)';
    ctxRef.shadowBlur = active ? 22 : 14;
    ctxRef.shadowOffsetX = 0;
    ctxRef.shadowOffsetY = active ? 8 : 6;
  }

  function drawPartLabel(ctxRef, x, y, label, isHover) {
    if (explodeT < 0.45) return;
    const alpha = clamp((explodeT - 0.45) / 0.45, 0, 1);
    ctxRef.save();
    ctxRef.globalAlpha = alpha;
    ctxRef.font = (isHover ? '600 ' : '500 ') + '12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    const tw = ctxRef.measureText(label).width;
    const pw = tw + 16;
    const ph = 22;
    const bx = x - pw * 0.5;
    const by = y - ph * 0.5;
    ctxRef.fillStyle = isHover ? '#D97736' : 'rgba(255, 253, 249, 0.92)';
    ctxRef.strokeStyle = isHover ? '#D97736' : 'rgba(130, 112, 96, 0.28)';
    ctxRef.lineWidth = 1;
    ctxRef.beginPath();
    const r = 11;
    ctxRef.moveTo(bx + r, by);
    ctxRef.arcTo(bx + pw, by, bx + pw, by + ph, r);
    ctxRef.arcTo(bx + pw, by + ph, bx, by + ph, r);
    ctxRef.arcTo(bx, by + ph, bx, by, r);
    ctxRef.arcTo(bx, by, bx + pw, by, r);
    ctxRef.closePath();
    ctxRef.fill();
    ctxRef.stroke();
    ctxRef.fillStyle = isHover ? '#FFFFFF' : '#4A3F36';
    ctxRef.textAlign = 'center';
    ctxRef.textBaseline = 'middle';
    ctxRef.fillText(label, x, y + 0.5);
    ctxRef.restore();
  }

  function renderExplodedOverview(skin) {
    const t = explodeT;
    const m = getExplodedMetrics(skin, t);
    const pal = skin.palette;
    const opts = Layers ? Layers.getOptions() : {};

    if (t > 0.08) {
      ctx.save();
      ctx.globalAlpha = clamp((t - 0.08) * 0.75, 0, 0.6);
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(160, 134, 112, 0.55)';
      ctx.lineWidth = 1.25;
      const links = [
        [m.ears.x, m.ears.y + 8, m.head.x, m.head.y - 44 * m.hs],
        [m.eyes.x + 26, m.eyes.y + 4, m.head.x - 24 * m.hs, m.head.y - 6 * m.hs],
        [m.head.x, m.head.y + 52 * m.hs, m.body.x, m.body.y - 74],
        [m.leftArm.x + 12, m.leftArm.y + 10, m.body.x - 42 * m.bw, m.body.y - 46],
        [m.rightArm.x - 12, m.rightArm.y + 10, m.body.x + 42 * m.bw, m.body.y - 46],
        [m.hindLeg.x + 24, m.hindLeg.y - 6, m.body.x - 52 * m.bw, m.body.y - 4],
        [m.hindPaws.x, m.hindPaws.y - 16, m.body.x, m.body.y + 24],
        [m.tail.x - 16, m.tail.y + 4, m.body.x + 62 * m.bw, m.body.y - 2]
      ];
      ctx.beginPath();
      for (let i = 0; i < links.length; i++) {
        ctx.moveTo(links[i][0], links[i][1]);
        ctx.lineTo(links[i][2], links[i][3]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    const hScale = (id) => (hoverPartId === id ? 1.055 : 1.0);

    // 1. Tail
    (function drawExplodedTail() {
      const isHov = hoverPartId === 'tail';
      const sc = hScale('tail');
      const thick = 26 * (skin.shape.tailThickness || 1);
      ctx.save();
      ctx.translate(m.tail.x, m.tail.y);
      ctx.scale(sc, sc);
      const r0 = { x: -34, y: 12 };
      const c1 = { x: 4, y: 22 };
      const c2 = { x: 24 * m.tl, y: -24 };
      const tip = { x: 56 * m.tl, y: -32 };

      const sampleTail = (u) => {
        const inv = 1 - u;
        return {
          x: inv*inv*inv*r0.x + 3*inv*inv*u*c1.x + 3*inv*u*u*c2.x + u*u*u*tip.x,
          y: inv*inv*inv*r0.y + 3*inv*inv*u*c1.y + 3*inv*u*u*c2.y + u*u*u*tip.y
        };
      };
      const sampleTan = (u) => {
        const inv = 1 - u;
        return {
          x: 3*inv*inv*(c1.x-r0.x) + 6*inv*u*(c2.x-c1.x) + 3*u*u*(tip.x-c2.x),
          y: 3*inv*inv*(c1.y-r0.y) + 6*inv*u*(c2.y-c1.y) + 3*u*u*(tip.y-c2.y)
        };
      };
      const half = thick * 0.5;
      const leftPts = [], rightPts = [];
      for (let i = 0; i <= 20; i++) {
        const u = i / 20;
        const p = sampleTail(u);
        const tan = sampleTan(u);
        const len = Math.max(0.001, Math.hypot(tan.x, tan.y));
        const nx = -tan.y / len, ny = tan.x / len;
        leftPts.push({ x: p.x + nx * half, y: p.y + ny * half });
        rightPts.push({ x: p.x - nx * half, y: p.y - ny * half });
      }
      const tipAng = Math.atan2(tip.y - c2.y, tip.x - c2.x);
      const rootAng = Math.atan2(c1.y - r0.y, c1.x - r0.x);
      const traceT = () => {
        ctx.beginPath();
        ctx.moveTo(leftPts[0].x, leftPts[0].y);
        for (let i = 1; i < leftPts.length; i++) ctx.lineTo(leftPts[i].x, leftPts[i].y);
        ctx.arc(tip.x, tip.y, half, tipAng + Math.PI * 0.5, tipAng - Math.PI * 0.5, true);
        for (let i = rightPts.length - 1; i >= 0; i--) ctx.lineTo(rightPts[i].x, rightPts[i].y);
        ctx.arc(r0.x, r0.y, half, rootAng - Math.PI * 0.5, rootAng + Math.PI * 0.5, true);
        ctx.closePath();
      };

      ctx.save();
      drawFloatingShadow(ctx, isHov);
      traceT();
      ctx.fillStyle = partFillStyle(ctx, skin, 'tail', r0.x, r0.y, tip.x, tip.y, pal.tail);
      ctx.fill();
      ctx.restore();

      const comp = getCompositeOf('tail');
      if (comp) {
        ctx.save();
        traceT();
        ctx.clip();
        ctx.translate(r0.x, r0.y);
        ctx.rotate(Math.atan2(tip.y - r0.y, tip.x - r0.x));
        const len = Math.hypot(tip.x - r0.x, tip.y - r0.y);
        ctx.drawImage(comp, -8, -thick * 0.72, len + 18, thick * 1.44);
        ctx.restore();
      }

      traceT();
      ctx.strokeStyle = isHov ? '#D97736' : 'rgba(92, 76, 64, 0.16)';
      ctx.lineWidth = isHov ? 2.2 : 1.2;
      ctx.stroke();
      ctx.restore();
      drawPartLabel(ctx, m.tail.x + 12, m.tail.y + 32, '尾巴', isHov);
    })();

    // 1b. Hind Leg (3-key kicking leg)
    (function drawExplodedHindLeg() {
      const isHov = hoverPartId === 'hindLeg';
      const sc = hScale('hindLeg');
      const hl = m.hindLeg;
      const len = hl.w;
      const r = hl.thick * 0.5;
      const hlBase = pal.hindLeg || pal.legs;

      ctx.save();
      ctx.translate(hl.x, hl.y);
      ctx.scale(sc, sc);
      ctx.rotate(-0.22);

      const traceHL = () => {
        ctx.beginPath();
        ctx.moveTo(len * 0.45, -r);
        ctx.lineTo(-len * 0.45, -r * 0.88);
        ctx.arc(-len * 0.45, 0, r * 0.88, -Math.PI * 0.5, Math.PI * 0.5, true);
        ctx.lineTo(len * 0.45, r);
        ctx.arc(len * 0.45, 0, r, Math.PI * 0.5, -Math.PI * 0.5, true);
        ctx.closePath();
      };

      ctx.save();
      drawFloatingShadow(ctx, isHov);
      traceHL();
      ctx.fillStyle = partFillStyle(ctx, skin, 'hindLeg', len * 0.45, 0, -len * 0.45, 0, hlBase);
      ctx.fill();
      ctx.restore();

      const comp = getCompositeOf('hindLeg');
      if (comp) {
        ctx.save();
        traceHL();
        ctx.clip();
        ctx.drawImage(comp, len * 0.45 + 6, -r * 1.25, -(len + 14), r * 2.5);
        ctx.restore();
      }

      traceHL();
      ctx.strokeStyle = isHov ? '#D97736' : 'rgba(92, 76, 64, 0.18)';
      ctx.lineWidth = isHov ? 2.2 : 1.2;
      ctx.stroke();
      ctx.restore();
      drawPartLabel(ctx, hl.x - 4, hl.y + 30, '后腿', isHov);
    })();

    // 1c. Tucked Sitting Hind Paws
    (function drawExplodedHindPaws() {
      const isHov = hoverPartId === 'hindPaws';
      const sc = hScale('hindPaws');
      const hp = m.hindPaws;
      const pawBase = pal.hindPaw || pal.paws;
      ctx.save();
      ctx.translate(hp.x, hp.y);
      ctx.scale(sc, sc);
      for (let side = 0; side < 2; side++) {
        const cx = side === 0 ? -24 : 24;
        const tk = side === 0 ? 'leftHindPaw' : 'rightHindPaw';
        ctx.save();
        drawFloatingShadow(ctx, isHov);
        ctx.beginPath();
        ctx.ellipse(cx, 0, 17, 13, 0, 0, Math.PI * 2);
        ctx.fillStyle = rgbaCss(pawBase);
        ctx.fill();
        ctx.restore();

        const comp = getCompositeOf(tk);
        if (comp) {
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(cx, 0, 17, 13, 0, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(comp, cx - 18.7, -14.3, 37.4, 28.6);
          ctx.restore();
        }
        ctx.beginPath();
        ctx.ellipse(cx, 0, 17, 13, 0, 0, Math.PI * 2);
        ctx.strokeStyle = isHov ? '#D97736' : 'rgba(92, 76, 64, 0.18)';
        ctx.lineWidth = isHov ? 2.2 : 1.2;
        ctx.stroke();
      }
      ctx.restore();
      drawPartLabel(ctx, hp.x, hp.y + 27, '坐姿后爪', isHov);
    })();

    // 2. Body
    (function drawExplodedBody() {
      const isHov = hoverPartId === 'body';
      const sc = hScale('body');
      ctx.save();
      ctx.translate(m.body.x, m.body.y);
      ctx.scale(sc, sc);

      const bScale = 1.65;
      const bw = m.bw;
      const nw = skin.shape.neckWidth || 1;
      const B = (x, y) => ({ x: x * bw * bScale, y: y * bScale });
      const traceBody = () => {
        ctx.beginPath();
        const topW = 34 * nw;
        ctx.moveTo(B(-topW, -72).x, B(-topW, -72).y);
        ctx.lineTo(B(topW, -72).x, B(topW, -72).y);
        ctx.quadraticCurveTo(B(50, -44).x, B(50, -44).y, B(48, -10).x, B(48, -10).y);
        ctx.quadraticCurveTo(B(44, 14).x, B(44, 14).y, B(28, 16).x, B(28, 16).y);
        ctx.lineTo(B(-28, 16).x, B(-28, 16).y);
        ctx.quadraticCurveTo(B(-44, 14).x, B(-44, 14).y, B(-48, -10).x, B(-48, -10).y);
        ctx.quadraticCurveTo(B(-50, -44).x, B(-50, -44).y, B(-topW, -72).x, B(-topW, -72).y);
        ctx.closePath();
      };

      ctx.save();
      drawFloatingShadow(ctx, isHov);
      traceBody();
      ctx.fillStyle = partFillStyle(ctx, skin, 'body', 0, -140, 0, 32, pal.body);
      ctx.fill();
      ctx.restore();

      const bodyComp = getCompositeOf('body');
      if (bodyComp) {
        const spB = Spec.PART_TEXTURE_SPECS.body;
        ctx.save();
        traceBody();
        ctx.clip();
        ctx.drawImage(
          bodyComp,
          spB.x0 * bw * bScale, spB.y0 * bScale,
          (spB.x1 - spB.x0) * bw * bScale, (spB.y1 - spB.y0) * bScale
        );
        ctx.restore();
      }

      traceBody();
      ctx.strokeStyle = isHov ? '#D97736' : 'rgba(92, 76, 64, 0.16)';
      ctx.lineWidth = isHov ? 2.4 : 1.2;
      ctx.stroke();
      ctx.restore();
      drawPartLabel(ctx, m.body.x, m.body.y + 44, '身体', isHov);
    })();

    // 3. Ears
    (function drawExplodedEars() {
      const isHov = hoverPartId === 'ears';
      const sc = hScale('ears');
      ctx.save();
      ctx.translate(m.ears.x, m.ears.y);
      ctx.scale(sc, sc);
      const earSpread = 44 * m.esp * m.hs;
      for (let side = 0; side < 2; side++) {
        const isLeft = side === 0;
        const sign = isLeft ? -1 : 1;
        const space = isLeft ? 'leftEar' : 'rightEar';
        const bx = sign * earSpread;
        const by = 18;
        ctx.save();
        drawFloatingShadow(ctx, isHov);
        const g0 = traceEarTriangle(ctx, bx, by, sign, 1.0, 1.0, m.es * m.hs, skin.shape.earBaseWidth || 1, skin.shape.earPointiness || 1);
        ctx.fillStyle = partFillStyle(ctx, skin, space, bx, by, g0.tipX, g0.tipY, pal.earOuter);
        ctx.fill();
        ctx.restore();

        const comp = getCompositeOf(space);
        if (comp) {
          ctx.save();
          const g = traceEarTriangle(ctx, bx, by, sign, 1.0, 1.0, m.es * m.hs, skin.shape.earBaseWidth || 1, skin.shape.earPointiness || 1);
          ctx.clip();
          const axisU = { x: g.outX - g.inX, y: 0 };
          const axisV = { x: g.tipX - bx, y: g.tipY - by };
          const spE = Spec.PART_TEXTURE_SPECS[space];
          const ux = (spE.x1 - spE.x0) / 100 / spE.width;
          const vy = (-(spE.y1 - spE.y0)) / 100 / spE.height;
          const ox = bx + (spE.x0 / 100) * axisU.x + (-spE.y0 / 100) * axisV.x;
          const oy = by + (spE.x0 / 100) * axisU.y + (-spE.y0 / 100) * axisV.y;
          ctx.transform(axisU.x * ux, axisU.y * ux, axisV.x * vy, axisV.y * vy, ox, oy);
          ctx.drawImage(comp, 0, 0, spE.width, spE.height);
          ctx.restore();
        }

        traceEarTriangle(ctx, bx, by, sign, 1.0, 1.0, m.es * m.hs, skin.shape.earBaseWidth || 1, skin.shape.earPointiness || 1);
        ctx.strokeStyle = isHov ? '#D97736' : 'rgba(92, 76, 64, 0.16)';
        ctx.lineWidth = isHov ? 2.2 : 1.2;
        ctx.stroke();
      }
      ctx.restore();
      drawPartLabel(ctx, m.ears.x, m.ears.y - 46 * m.es * m.hs, '耳朵', isHov);
    })();

    // 4. Head
    (function drawExplodedHead() {
      const isHov = hoverPartId === 'head';
      const sc = hScale('head');
      const hS = 1.68 * m.hs;
      const rx = 44 * m.cf * hS;
      const ry = 38 * hS;
      ctx.save();
      ctx.translate(m.head.x, m.head.y);
      ctx.scale(sc, sc);

      const traceHead = () => {
        traceHeadWithJaw(ctx, (p) => ({ x: p.x * hS, y: p.y * hS }), m.cf, skin);
      };

      ctx.save();
      drawFloatingShadow(ctx, isHov);
      traceHead();
      ctx.fillStyle = partFillStyle(ctx, skin, 'head', 0, -ry, 0, ry, pal.headBody || pal.body);
      ctx.fill();
      ctx.restore();

      const headComp = getCompositeOf('head');
      if (headComp) {
        const spH = Spec.PART_TEXTURE_SPECS.head;
        ctx.save();
        traceHead();
        ctx.clip();
        ctx.drawImage(headComp, spH.x0 * hS, spH.y0 * hS, (spH.x1 - spH.x0) * hS, (spH.y1 - spH.y0) * hS);
        ctx.restore();
      }

      // Live eyes preview + whiskers
      for (let side = -1; side <= 1; side += 2) {
        const isLeft = side < 0;
        const irisSrc = (isLeft ? pal.irisLeft : pal.irisRight) || pal.iris;
        const pupilSrc = (isLeft ? pal.pupilLeft : pal.pupilRight) || pal.pupil;
        const ex = side * 16.5 * hS;
        const ey = -5 * hS;
        const irisComp = getCompositeOf(isLeft ? 'leftIris' : 'rightIris');
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(ex, ey, 9.2 * hS, 8.2 * hS, 0, 0, Math.PI * 2);
        ctx.clip();
        if (irisComp) {
          ctx.drawImage(irisComp, ex - 10.5 * hS, ey - 9.8 * hS, 21 * hS, 19.6 * hS);
        } else {
          ctx.fillStyle = irisSrc ? rgbaCss(irisSrc) : '#D2E83A';
          ctx.fillRect(ex - 12 * hS, ey - 10 * hS, 24 * hS, 20 * hS);
        }
        if (!(irisComp && opts.hideDefaultPupil)) {
          ctx.fillStyle = pupilSrc ? rgbaCss(pupilSrc) : '#141416';
          ctx.beginPath();
          ctx.ellipse(ex, ey, 3.0 * hS, 6.2 * hS, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        ctx.strokeStyle = rgbaCss(pal.whiskers);
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        for (let wi = -1; wi <= 1; wi++) {
          ctx.beginPath();
          ctx.moveTo(side * 24 * hS, (6 + wi * 3.2) * hS);
          ctx.lineTo(side * 38 * hS, (4.5 + wi * 4.5) * hS);
          ctx.stroke();
        }
      }
      if (!opts.hideDefaultNose && pal.nose && (pal.nose.a === undefined || pal.nose.a >= 0.01)) {
        ctx.fillStyle = rgbaCss(pal.nose);
        ctx.beginPath();
        ctx.ellipse(0, 7.5 * hS, 3.2 * hS, 2.2 * hS, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!opts.hideDefaultMouth && pal.mouth && (pal.mouth.a === undefined || pal.mouth.a >= 0.01)) {
        ctx.strokeStyle = rgbaCss(pal.mouth);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(-3.5 * hS, 11 * hS, 3.6 * hS, 0.15, Math.PI - 0.15);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(3.5 * hS, 11 * hS, 3.6 * hS, 0.15, Math.PI - 0.15);
        ctx.stroke();
      }

      traceHead();
      ctx.strokeStyle = isHov ? '#D97736' : 'rgba(92, 76, 64, 0.16)';
      ctx.lineWidth = isHov ? 2.4 : 1.2;
      ctx.stroke();
      ctx.restore();
      drawPartLabel(ctx, m.head.x, m.head.y + ry + 14, '头部', isHov);
    })();

    // 4b. Floating Eyes Pill (side pair)
    if (t > 0.04) {
      (function drawExplodedEyes() {
        const isHov = hoverPartId === 'eyes';
        const sc = hScale('eyes');
        const ey = m.eyes;
        ctx.save();
        ctx.globalAlpha = clamp(t * 1.4, 0, 1);
        ctx.translate(ey.x, ey.y);
        ctx.scale(sc, sc);
        for (let side = 0; side < 2; side++) {
          const cx = side === 0 ? -18 : 18;
          const tk = side === 0 ? 'leftIris' : 'rightIris';
          ctx.save();
          drawFloatingShadow(ctx, isHov);
          ctx.beginPath();
          ctx.ellipse(cx, 0, 14, 12.5, 0, 0, Math.PI * 2);
          ctx.fillStyle = '#F7F1E8';
          ctx.fill();
          ctx.restore();

          const comp = getCompositeOf(tk);
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(cx, 0, 14, 12.5, 0, 0, Math.PI * 2);
          ctx.clip();
          if (comp) {
            ctx.drawImage(comp, cx - 15, -14, 30, 28);
          } else {
            ctx.fillStyle = rgbaCss((side === 0 ? pal.irisLeft : pal.irisRight) || pal.iris || { r: 0.82, g: 0.91, b: 0.23, a: 1 });
            ctx.fillRect(cx - 15, -14, 30, 28);
          }
          if (!opts.hideDefaultPupil) {
            ctx.fillStyle = rgbaCss((side === 0 ? pal.pupilLeft : pal.pupilRight) || pal.pupil || { r: 0.08, g: 0.08, b: 0.09, a: 1 });
            ctx.beginPath();
            ctx.ellipse(cx, 0, 3.8, 8.2, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();

          ctx.beginPath();
          ctx.ellipse(cx, 0, 14, 12.5, 0, 0, Math.PI * 2);
          ctx.strokeStyle = isHov ? '#D97736' : 'rgba(92, 76, 64, 0.22)';
          ctx.lineWidth = isHov ? 2.2 : 1.2;
          ctx.stroke();
        }
        ctx.restore();
        drawPartLabel(ctx, ey.x, ey.y + 26, '眼睛', isHov);
      })();
    }

    // 5 & 6. Left & Right Arms
    ['leftArm', 'rightArm'].forEach((armId) => {
      const isLeft = armId === 'leftArm';
      const isHov = hoverPartId === armId;
      const sc = hScale(armId);
      const pos = m[armId];
      const armH = pos.h;
      const armW = 34;

      ctx.save();
      ctx.translate(pos.x, pos.y + armH * 0.5);
      ctx.scale(sc, sc);
      ctx.translate(0, -armH * 0.5);

      const traceArm = () => {
        ctx.beginPath();
        const r = armW * 0.48;
        ctx.moveTo(-r, r);
        ctx.arc(0, r, r, Math.PI, 0, false);
        ctx.lineTo(r * 0.92, armH - r * 0.6);
        ctx.arc(0, armH - r * 0.6, r * 0.92, 0, Math.PI, false);
        ctx.closePath();
      };

      const fillArmStyle = () => {
        const armGrad = skin.partGradients && skin.partGradients[armId];
        if (armGrad) return partFillStyle(ctx, skin, armId, 0, 0, 0, armH, pal.legs);
        if (skin.idleLegsTinted !== false && pal.belly && !Spec.sameColor(pal.belly, pal.legs)) {
          const g = ctx.createLinearGradient(0, 0, 0, armH);
          g.addColorStop(0.0, rgbaCss(pal.belly));
          g.addColorStop(0.32, rgbaCss(pal.legs));
          g.addColorStop(1.0, rgbaCss(pal.legs));
          return g;
        }
        return rgbaCss(pal.legs);
      };

      ctx.save();
      drawFloatingShadow(ctx, isHov);
      traceArm();
      ctx.fillStyle = fillArmStyle();
      ctx.fill();
      ctx.restore();

      const comp = getCompositeOf(armId);
      if (comp) {
        ctx.save();
        traceArm();
        ctx.clip();
        if (isLeft) {
          ctx.translate(armW * 0.65, -armH * 0.08);
          ctx.rotate(Math.PI * 0.5);
          ctx.drawImage(comp, 0, 0, armH * 1.24, armW * 1.3);
        } else {
          ctx.translate(-armW * 0.65, -armH * 0.08);
          ctx.rotate(Math.PI * 0.5);
          ctx.scale(1, -1);
          ctx.drawImage(comp, 0, 0, armH * 1.24, armW * 1.3);
        }
        ctx.restore();
      }

      traceArm();
      ctx.strokeStyle = isHov ? '#D97736' : rgbaCss(pal.crease, 0.45);
      ctx.lineWidth = isHov ? 2.4 : 1.3;
      ctx.stroke();
      ctx.restore();

      drawPartLabel(ctx, pos.x, pos.y + armH + 22, isLeft ? '左手臂' : '右手臂', isHov);
    });
  }

  function hitTestExplodedPart(pt, skin) {
    const m = getExplodedMetrics(skin, explodeT);
    const tests = [
      { id: 'eyes', cx: m.eyes.x, cy: m.eyes.y, rx: m.eyes.hit.rx, ry: m.eyes.hit.ry },
      { id: 'leftArm', cx: m.leftArm.x, cy: m.leftArm.y + m.leftArm.h * 0.5, rx: m.leftArm.hit.rx, ry: m.leftArm.hit.ry },
      { id: 'rightArm', cx: m.rightArm.x, cy: m.rightArm.y + m.rightArm.h * 0.5, rx: m.rightArm.hit.rx, ry: m.rightArm.hit.ry },
      { id: 'head', cx: m.head.x, cy: m.head.y, rx: m.head.hit.rx, ry: m.head.hit.ry },
      { id: 'ears', cx: m.ears.x, cy: m.ears.y - 12, rx: m.ears.hit.rx, ry: m.ears.hit.ry },
      { id: 'hindPaws', cx: m.hindPaws.x, cy: m.hindPaws.y, rx: m.hindPaws.hit.rx, ry: m.hindPaws.hit.ry },
      { id: 'body', cx: m.body.x, cy: m.body.y - 44, rx: m.body.hit.rx, ry: m.body.hit.ry },
      { id: 'hindLeg', cx: m.hindLeg.x, cy: m.hindLeg.y, rx: m.hindLeg.hit.rx, ry: m.hindLeg.hit.ry },
      { id: 'tail', cx: m.tail.x + 12, cy: m.tail.y - 6, rx: m.tail.hit.rx, ry: m.tail.hit.ry }
    ];
    for (let i = 0; i < tests.length; i++) {
      const k = tests[i];
      const dx = (pt.x - k.cx) / k.rx;
      const dy = (pt.y - k.cy) / k.ry;
      if (dx * dx + dy * dy <= 1.05) return k.id;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Zoomed Part Paint Canvas Silhouettes & PS Overlay Rendering
  // -------------------------------------------------------------------------
  function get25DBuild(skin) {
    return Renderer.getBuild(skin);
  }

  function appendHeadWithJawSubpath(ctxRef, mapPt, cheekFullness, skin) {
    const cf = cheekFullness || 1;
    const bd = get25DBuild(skin);
    const cheekW = bd.cheekHalfW * cf;
    const jaw = Spec.jawSide(true, cf);
    const crown = mapPt({ x: 0, y: bd.crownBaseY });
    const rCheek = mapPt({ x: cheekW, y: bd.cheekY });
    const lCheek = mapPt({ x: -cheekW, y: bd.cheekY });
    const c1a = mapPt({ x: bd.crownCtrlW, y: bd.crownBaseY });
    const c1b = mapPt({ x: cheekW + 1.5, y: bd.cheekCtrlTopY });
    const c6a = mapPt({ x: -cheekW - 1.5, y: bd.cheekCtrlTopY });
    const c6b = mapPt({ x: -bd.crownCtrlW, y: bd.crownBaseY });

    ctxRef.moveTo(crown.x, crown.y);
    ctxRef.bezierCurveTo(c1a.x, c1a.y, c1b.x, c1b.y, rCheek.x, rCheek.y);
    for (let i = 3; i < jaw.length - 1; i++) {
      const pt = mapPt(jaw[i]);
      ctxRef.lineTo(pt.x, pt.y);
    }
    ctxRef.lineTo(lCheek.x, lCheek.y);
    ctxRef.bezierCurveTo(c6a.x, c6a.y, c6b.x, c6b.y, crown.x, crown.y);
    ctxRef.closePath();
  }

  function traceHeadWithJaw(ctxRef, mapPt, cheekFullness, skin) {
    ctxRef.beginPath();
    appendHeadWithJawSubpath(ctxRef, mapPt, cheekFullness, skin);
  }

  function appendHeadBleedSubpath(ctxRef, skin) {
    const cf = (skin.shape && skin.shape.cheekFullness) || 1;
    const bd = get25DBuild(skin);
    const padX = 11.5;
    const padTop = 8.5;
    const padBot = 9.5;
    const cheekW = bd.cheekHalfW * cf + padX;
    const crownY = bd.crownBaseY - padTop;
    const jaw = Spec.jawSide(true, cf);
    const mapPt = (p) => PART_VIEW.head.toCanvas(p);
    const crown = mapPt({ x: 0, y: crownY });
    const rCheek = mapPt({ x: cheekW, y: bd.cheekY + 1 });
    const lCheek = mapPt({ x: -cheekW, y: bd.cheekY + 1 });
    const c1a = mapPt({ x: bd.crownCtrlW + padX * 0.75, y: crownY });
    const c1b = mapPt({ x: cheekW + 2.0, y: bd.cheekCtrlTopY - padTop * 0.35 });
    const c6a = mapPt({ x: -cheekW - 2.0, y: bd.cheekCtrlTopY - padTop * 0.35 });
    const c6b = mapPt({ x: -bd.crownCtrlW - padX * 0.75, y: crownY });

    ctxRef.moveTo(crown.x, crown.y);
    ctxRef.bezierCurveTo(c1a.x, c1a.y, c1b.x, c1b.y, rCheek.x, rCheek.y);
    for (let i = 3; i < jaw.length - 1; i++) {
      const jp = jaw[i];
      const fracX = jp.x / Math.max(1, 44 * cf);
      const pt = mapPt({ x: jp.x + fracX * padX, y: jp.y + padBot });
      ctxRef.lineTo(pt.x, pt.y);
    }
    ctxRef.lineTo(lCheek.x, lCheek.y);
    ctxRef.bezierCurveTo(c6a.x, c6a.y, c6b.x, c6b.y, crown.x, crown.y);
    ctxRef.closePath();
  }

  function traceHeadBleedSilhouette(ctxRef, skin) {
    ctxRef.beginPath();
    appendHeadBleedSubpath(ctxRef, skin);
  }

  function appendBodyWithJaw25DSubpath(ctxRef, skin) {
    const s = skin.shape;
    const bd = get25DBuild(skin);
    const hs = s.headScale || 1;
    const bw = s.bodyWidth || 1;
    const nw = s.neckWidth || 1;
    const cf = s.cheekFullness || 1;
    const headOffY = -100 + bd.headLift;
    const T = (wx, wy) => PART_VIEW.body.toCanvas({ x: wx, y: wy });
    const H = (hx, hy) => T(hx * hs, headOffY + hy * hs);
    const B = (bx, by) => T(bx * bw, by);

    const cheekHalfW = bd.cheekHalfW * cf;
    const rNeckX = (cheekHalfW - bd.neckPinchX) * nw;
    const lNeckX = -rNeckX;
    const neckWaistW = bd.waistCtrlW * (1 + (nw - 1) * 0.32);

    const rCheek = H(cheekHalfW, 8);
    const lCheek = H(-cheekHalfW, 8);
    const rHip = B(bd.hipHalfW, -14);
    const rBot = B(bd.botHalfW, 12);
    const lBot = B(-bd.botHalfW, 12);
    const lHip = B(-bd.hipHalfW, -14);

    const jaw = Spec.jawSide(false, cf);
    ctxRef.moveTo(lCheek.x, lCheek.y);
    for (let i = jaw.length - 2; i >= 3; i--) {
      const jp = jaw[i];
      const clampedX = clamp(jp.x, -cheekHalfW, cheekHalfW);
      const pt = H(clampedX, jp.y);
      ctxRef.lineTo(pt.x, pt.y);
    }
    ctxRef.lineTo(rCheek.x, rCheek.y);
    const c2a = H(rNeckX, bd.neckCtrlY);
    const c2b = B(neckWaistW, bd.waistCtrlY);
    ctxRef.bezierCurveTo(c2a.x, c2a.y, c2b.x, c2b.y, rHip.x, rHip.y);
    const c3a = B(bd.botOuterW, 5), c3b = B(bd.botInnerW, 12);
    ctxRef.bezierCurveTo(c3a.x, c3a.y, c3b.x, c3b.y, rBot.x, rBot.y);
    ctxRef.lineTo(lBot.x, lBot.y);
    const c4a = B(-bd.botInnerW, 12), c4b = B(-bd.botOuterW, 5);
    ctxRef.bezierCurveTo(c4a.x, c4a.y, c4b.x, c4b.y, lHip.x, lHip.y);
    const c5a = B(-neckWaistW, bd.waistCtrlY);
    const c5b = H(lNeckX, bd.neckCtrlY);
    ctxRef.bezierCurveTo(c5a.x, c5a.y, c5b.x, c5b.y, lCheek.x, lCheek.y);
    ctxRef.closePath();
    return { x0: CW * 0.5, y0: H(0, bd.cheekY).y, x1: CW * 0.5, y1: rBot.y };
  }

  function traceBodyWithJaw25D(ctxRef, skin) {
    ctxRef.beginPath();
    return appendBodyWithJaw25DSubpath(ctxRef, skin);
  }

  function appendBodyBleedSubpath(ctxRef, skin) {
    const s = skin.shape;
    const bd = get25DBuild(skin);
    const hs = s.headScale || 1;
    const bw = s.bodyWidth || 1;
    const nw = s.neckWidth || 1;
    const cf = s.cheekFullness || 1;
    const headOffY = -100 + bd.headLift;
    const T = (wx, wy) => PART_VIEW.body.toCanvas({ x: wx, y: wy });
    const H = (hx, hy) => T(hx * hs, headOffY + hy * hs);
    const B = (bx, by) => T(bx * bw, by);

    const cheekHalfW = bd.cheekHalfW * cf + 5.5;
    const rNeckX = (cheekHalfW - bd.neckPinchX) * nw;
    const lNeckX = -rNeckX;
    const neckWaistW = bd.waistCtrlW * (1 + (nw - 1) * 0.32) + 4.5;

    const topL = H(-cheekHalfW, 4);
    const topMid = H(0, -10);
    const topR = H(cheekHalfW, 4);
    const rHip = B(bd.hipHalfW + 4.5, -14);
    const rBot = B(bd.botHalfW + 4.5, 16);
    const lBot = B(-bd.botHalfW - 4.5, 16);
    const lHip = B(-bd.hipHalfW - 4.5, -14);

    ctxRef.moveTo(topL.x, topL.y);
    ctxRef.quadraticCurveTo(topMid.x, topMid.y, topR.x, topR.y);
    const c2a = H(rNeckX, bd.neckCtrlY);
    const c2b = B(neckWaistW, bd.waistCtrlY);
    ctxRef.bezierCurveTo(c2a.x, c2a.y, c2b.x, c2b.y, rHip.x, rHip.y);
    const c3a = B(bd.botOuterW + 4.5, 6), c3b = B(bd.botInnerW + 4.5, 16);
    ctxRef.bezierCurveTo(c3a.x, c3a.y, c3b.x, c3b.y, rBot.x, rBot.y);
    ctxRef.lineTo(lBot.x, lBot.y);
    const c4a = B(-bd.botInnerW - 4.5, 16), c4b = B(-bd.botOuterW - 4.5, 6);
    ctxRef.bezierCurveTo(c4a.x, c4a.y, c4b.x, c4b.y, lHip.x, lHip.y);
    const c5a = B(-neckWaistW, bd.waistCtrlY);
    const c5b = H(lNeckX, bd.neckCtrlY);
    ctxRef.bezierCurveTo(c5a.x, c5a.y, c5b.x, c5b.y, topL.x, topL.y);
    ctxRef.closePath();
    return { x0: CW * 0.5, y0: topMid.y, x1: CW * 0.5, y1: rBot.y };
  }

  function traceBodyBleedSilhouette(ctxRef, skin) {
    ctxRef.beginPath();
    return appendBodyBleedSubpath(ctxRef, skin);
  }

  function hasDynamicBleed(partId) {
    return partId === 'head' || partId === 'body';
  }

  function traceZoomedPartBleed(ctxRef, partId, skin, earSpace) {
    if (partId === 'head') {
      const bd = get25DBuild(skin);
      const c = PART_VIEW.head.toCanvas({ x: 0, y: 0 });
      const ry = Math.abs(bd.crownBaseY - 8.5) * PART_VIEW.head.scale;
      traceHeadBleedSilhouette(ctxRef, skin);
      return { x0: c.x, y0: c.y - ry, x1: c.x, y1: c.y + 43.5 * PART_VIEW.head.scale };
    }
    if (partId === 'body') {
      return traceBodyBleedSilhouette(ctxRef, skin);
    }
    return traceZoomedPartSilhouette(ctxRef, partId, skin, earSpace);
  }

  function traceZoomedPartSilhouette(ctxRef, partId, skin, unitSpace) {
    const s = skin.shape;
    if (partId === 'head') {
      const bd = get25DBuild(skin);
      const c = PART_VIEW.head.toCanvas({ x: 0, y: 0 });
      const ry = Math.abs(bd.crownBaseY) * PART_VIEW.head.scale;
      traceHeadWithJaw(ctxRef, (p) => PART_VIEW.head.toCanvas(p), s.cheekFullness, skin);
      return { x0: c.x, y0: c.y - ry, x1: c.x, y1: c.y + 34 * PART_VIEW.head.scale };
    }
    if (partId === 'ears') {
      const sp = unitSpace || 'leftEar';
      const sign = sp === 'leftEar' ? -1 : 1;
      const cx = sp === 'leftEar' ? CW * 0.29 : CW * 0.71;
      const by = CH * 0.80;
      const g = traceEarTriangle(ctxRef, cx, by, sign, 2.0, 2.0, 1.0, s.earBaseWidth || 1, s.earPointiness || 1);
      return { x0: cx, y0: by, x1: g.tipX, y1: g.tipY };
    }
    if (partId === 'eyes') {
      const sp = unitSpace || 'leftIris';
      const c = toPartCanvas('eyes', { x: 0, y: 0 }, sp);
      const rx = 12.0 * PART_VIEW.eyes.scale;
      const ry = 10.8 * PART_VIEW.eyes.scale;
      ctxRef.beginPath();
      ctxRef.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
      return { x0: c.x, y0: c.y - ry, x1: c.x, y1: c.y + ry };
    }
    if (partId === 'hindPaws') {
      const sp = unitSpace || 'leftHindPaw';
      const c = toPartCanvas('hindPaws', { x: 0, y: 0 }, sp);
      const rx = 86;
      const ry = 68;
      ctxRef.beginPath();
      ctxRef.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
      return { x0: c.x, y0: c.y - ry, x1: c.x, y1: c.y + ry };
    }
    if (partId === 'body') {
      return traceBodyWithJaw25D(ctxRef, skin);
    }
    if (partId === 'leftArm' || partId === 'rightArm' || partId === 'hindLeg') {
      const top = toPartCanvas(partId, { x: 0, y: 0 });
      const bot = toPartCanvas(partId, { x: 100, y: 0 });
      const hw = Math.abs(toPartCanvas(partId, { x: 0, y: 10 }).x - top.x);
      ctxRef.beginPath();
      ctxRef.moveTo(top.x - hw, top.y + 30);
      ctxRef.arc(top.x, top.y + 30, hw, Math.PI, 0, false);
      ctxRef.lineTo(bot.x + hw * 0.94, bot.y - 6);
      ctxRef.arc(bot.x, bot.y - 6, hw * 0.94, 0, Math.PI, false);
      ctxRef.closePath();
      return { x0: top.x, y0: top.y, x1: bot.x, y1: bot.y + 44 };
    }
    if (partId === 'tail') {
      const l = toPartCanvas('tail', { x: 0, y: 0 });
      const r = toPartCanvas('tail', { x: 100, y: 0 });
      const hh = TAIL_EDGE_Y * TAIL_BOARD_Y;
      ctxRef.beginPath();
      ctxRef.moveTo(l.x, l.y - hh);
      ctxRef.lineTo(r.x, r.y - hh);
      ctxRef.arc(r.x, r.y, hh, -Math.PI * 0.5, Math.PI * 0.5, false);
      ctxRef.lineTo(l.x, l.y + hh);
      ctxRef.arc(l.x, l.y, hh, Math.PI * 0.5, -Math.PI * 0.5, false);
      ctxRef.closePath();
      return { x0: l.x, y0: l.y, x1: r.x, y1: r.y };
    }
    return { x0: 0, y0: 0, x1: CW, y1: CH };
  }

  function partPtToWorldCanvas(partId, texKey, pt, skin) {
    if (partId === 'body') {
      const bw = (skin && skin.shape && skin.shape.bodyWidth) || 1;
      return PART_VIEW.body.toCanvas({ x: pt.x * bw, y: pt.y });
    }
    return toPartCanvas(partId, pt, texKey);
  }

  // Convert floatingTransform center/size/rotation to world canvas geometry
  function getFloatingWorldBox(ft, skin, partId) {
    if (!ft) return null;
    const sp = Spec.PART_TEXTURE_SPECS[ft.texKey];
    if (!sp) return null;
    const tlPart = Layers.texToPart(ft.texKey, ft.cx - ft.w * ft.scaleX * 0.5, ft.cy - ft.h * ft.scaleY * 0.5);
    const brPart = Layers.texToPart(ft.texKey, ft.cx + ft.w * ft.scaleX * 0.5, ft.cy + ft.h * ft.scaleY * 0.5);
    const cPart = Layers.texToPart(ft.texKey, ft.cx, ft.cy);
    const w0 = partPtToWorldCanvas(partId, ft.texKey, tlPart, skin);
    const w1 = partPtToWorldCanvas(partId, ft.texKey, brPart, skin);
    const wc = partPtToWorldCanvas(partId, ft.texKey, cPart, skin);
    return {
      cx: wc.x,
      cy: wc.y,
      hw: Math.max(8, Math.abs(w1.x - w0.x) * 0.5),
      hh: Math.max(8, Math.abs(w1.y - w0.y) * 0.5),
      rot: ft.rot || 0
    };
  }

  function renderPartPaintCanvas(skin) {
    const pal = skin.palette;
    const partId = selectedPartId;
    const effScale = Math.max(0.25, fitScale * viewZoom);
    const opts = Layers ? Layers.getOptions() : {};
    const _tr = window.t || ((s) => s);

    const drawSingleUnit = (unitSpace, fallbackCol) => {
      const useBleed = hasDynamicBleed(partId);

      // 1. Floating shadow + base fur coat color inside silhouette
      ctx.save();
      drawFloatingShadow(ctx, false);
      const gradBox0 = useBleed
        ? traceZoomedPartBleed(ctx, partId, skin, unitSpace)
        : traceZoomedPartSilhouette(ctx, partId, skin, unitSpace);
      ctx.fillStyle = partFillStyle(ctx, skin, unitSpace, gradBox0.x0, gradBox0.y0, gradBox0.x1, gradBox0.y1, fallbackCol);
      ctx.fill();
      ctx.restore();

      // 2. Subtle transparent-paper grid + live pixel composite inside UV envelope (or clipped cleanly to bleed/silhouette)
      const uvSp = Spec.PART_TEXTURE_SPECS[unitSpace];
      if (uvSp) {
        ctx.save();
        if (useBleed) {
          traceZoomedPartBleed(ctx, partId, skin, unitSpace);
        } else {
          const tlUv = partPtToWorldCanvas(partId, unitSpace, { x: uvSp.x0, y: uvSp.y0 }, skin);
          const brUv = partPtToWorldCanvas(partId, unitSpace, { x: uvSp.x1, y: uvSp.y1 }, skin);
          const minX = Math.min(tlUv.x, brUv.x), maxX = Math.max(tlUv.x, brUv.x);
          const minY = Math.min(tlUv.y, brUv.y), maxY = Math.max(tlUv.y, brUv.y);
          ctx.beginPath();
          ctx.rect(minX, minY, maxX - minX, maxY - minY);
        }
        ctx.clip();

        // Subtle checkerboard only along outer transparent UV margin (or subtle inside silhouette)
        ctx.save();
        traceZoomedPartSilhouette(ctx, partId, skin, unitSpace);
        ctx.clip();
        ctx.fillStyle = getCheckerPattern(ctx);
        ctx.fillRect(0, 0, CW, CH);
        ctx.restore();

        // Composite pixel sheet Stack (`KuroPixelLayers.getPart(unitSpace).compositeCanvas`)
        drawPartTextureIntoBoard(ctx, partId, unitSpace, skin);
        ctx.restore();
      }

      // 3. Dynamic bleed band highlight + dashed outer bleed outline
      if (useBleed) {
        ctx.save();
        ctx.beginPath();
        if (partId === 'head') {
          appendHeadBleedSubpath(ctx, skin);
          appendHeadWithJawSubpath(ctx, (p) => PART_VIEW.head.toCanvas(p), skin.shape.cheekFullness, skin);
        } else {
          appendBodyBleedSubpath(ctx, skin);
          appendBodyWithJaw25DSubpath(ctx, skin);
        }
        ctx.fillStyle = 'rgba(255, 249, 240, 0.24)';
        ctx.fill('evenodd');
        ctx.restore();

        ctx.save();
        traceZoomedPartBleed(ctx, partId, skin, unitSpace);
        ctx.setLineDash([5 / effScale, 4 / effScale]);
        ctx.strokeStyle = 'rgba(217, 119, 54, 0.56)';
        ctx.lineWidth = 1.35 / effScale;
        ctx.stroke();
        ctx.restore();
      }

      // 4. Dashed paintable UV canvas margin hint (for ears/limbs/tail/eyes/hindPaws bleed outside trim line)
      if (!useBleed && uvSp) {
        const tlUv = partPtToWorldCanvas(partId, unitSpace, { x: uvSp.x0, y: uvSp.y0 }, skin);
        const brUv = partPtToWorldCanvas(partId, unitSpace, { x: uvSp.x1, y: uvSp.y1 }, skin);
        const minX = Math.min(tlUv.x, brUv.x), maxX = Math.max(tlUv.x, brUv.x);
        const minY = Math.min(tlUv.y, brUv.y), maxY = Math.max(tlUv.y, brUv.y);
        ctx.save();
        ctx.setLineDash([4 / effScale, 4 / effScale]);
        ctx.strokeStyle = 'rgba(130, 114, 98, 0.28)';
        ctx.lineWidth = 1.0 / effScale;
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        ctx.restore();
      }

      // 5. Crisp silhouette contour guide
      traceZoomedPartSilhouette(ctx, partId, skin, unitSpace);
      ctx.strokeStyle = useBleed ? 'rgba(72, 58, 48, 0.50)' : 'rgba(92, 76, 64, 0.34)';
      ctx.lineWidth = (useBleed ? 1.65 : 1.4) / effScale;
      ctx.stroke();

      // 6. Limb paw-cuff reference guide (dashed — NOT blocking painting!)
      if (partId === 'leftArm' || partId === 'rightArm' || partId === 'hindLeg') {
        const cuffY = toPartCanvas(partId, { x: 72, y: 0 }).y;
        const tipY = toPartCanvas(partId, { x: 100, y: 0 }).y;
        const hw = Math.abs(toPartCanvas(partId, { x: 0, y: 10 }).x - toPartCanvas(partId, { x: 0, y: 0 }).x);
        ctx.save();
        ctx.setLineDash([4 / effScale, 4 / effScale]);
        ctx.strokeStyle = 'rgba(217, 119, 54, 0.42)';
        ctx.lineWidth = 1.15 / effScale;
        ctx.beginPath();
        ctx.moveTo(CW * 0.5 - hw, cuffY);
        ctx.lineTo(CW * 0.5 + hw, cuffY);
        ctx.stroke();
        // Faint paw oval outline at tip
        ctx.strokeStyle = 'rgba(217, 119, 54, 0.25)';
        ctx.beginPath();
        ctx.ellipse(CW * 0.5, tipY, hw * 1.12, 38, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 7. Gentle anatomical guide on Head (live iris preview inside eyes; dashed nose/mouth guides)
      if (partId === 'head') {
        const hs = PART_VIEW.head.scale;
        ctx.save();
        for (let side = -1; side <= 1; side += 2) {
          const isLeft = side < 0;
          const e = toPartCanvas('head', { x: side * 17.2, y: -2 });
          const rx = 12.0 * hs;
          const ry = 10.8 * hs;
          const irisComp = getCompositeOf(isLeft ? 'leftIris' : 'rightIris');
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(e.x, e.y, rx, ry, 0, 0, Math.PI * 2);
          ctx.clip();
          ctx.globalAlpha = 0.72;
          if (irisComp) {
            ctx.drawImage(irisComp, e.x - 14 * hs, e.y - 13 * hs, 28 * hs, 26 * hs);
          } else {
            const irisSrc = (isLeft ? pal.irisLeft : pal.irisRight) || pal.iris;
            ctx.fillStyle = irisSrc ? rgbaCss(irisSrc) : '#D2E83A';
            ctx.fillRect(e.x - rx, e.y - ry, rx * 2, ry * 2);
          }
          if (!(irisComp && opts.hideDefaultPupil)) {
            const pupilSrc = (isLeft ? pal.pupilLeft : pal.pupilRight) || pal.pupil;
            ctx.fillStyle = pupilSrc ? rgbaCss(pupilSrc) : '#141416';
            ctx.beginPath();
            ctx.ellipse(e.x, e.y, 2.5 * hs, 6.8 * hs, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          // Eye oval dashed rim (click Eyes pill to edit eyeballs)
          ctx.save();
          ctx.setLineDash([3 / effScale, 3 / effScale]);
          ctx.strokeStyle = 'rgba(72, 58, 48, 0.36)';
          ctx.lineWidth = 1.0 / effScale;
          ctx.beginPath();
          ctx.ellipse(e.x, e.y, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        // Subtle dashed nose/mouth placement guide so users can draw nose/mouth directly on the head pixel layer
        const n = toPartCanvas('head', { x: 0, y: 8.2 });
        ctx.save();
        ctx.setLineDash([3 / effScale, 3 / effScale]);
        ctx.strokeStyle = 'rgba(135, 95, 76, 0.35)';
        ctx.lineWidth = 1.0 / effScale;
        ctx.beginPath();
        ctx.moveTo(n.x - 2.6 * hs, n.y - 1.1 * hs);
        ctx.quadraticCurveTo(n.x, n.y - 1.7 * hs, n.x + 2.6 * hs, n.y - 1.1 * hs);
        ctx.quadraticCurveTo(n.x + 2.0 * hs, n.y + 0.7 * hs, n.x, n.y + 1.6 * hs);
        ctx.quadraticCurveTo(n.x - 2.0 * hs, n.y + 0.7 * hs, n.x - 2.6 * hs, n.y - 1.1 * hs);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
        ctx.restore();
      }

      // 8. Eyes editor pupil preview when dynamic pupil is kept on
      if (partId === 'eyes') {
        const isLeft = unitSpace === 'leftIris';
        const c = toPartCanvas('eyes', { x: 0, y: 0 }, unitSpace);
        const pupilSrc = (isLeft ? pal.pupilLeft : pal.pupilRight) || pal.pupil;
        if (!opts.hideDefaultPupil) {
          ctx.save();
          ctx.globalAlpha = 0.65;
          ctx.fillStyle = pupilSrc ? rgbaCss(pupilSrc) : '#141416';
          ctx.beginPath();
          ctx.ellipse(c.x, c.y, 2.5 * PART_VIEW.eyes.scale, 6.8 * PART_VIEW.eyes.scale, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    };

    if (partId === 'ears') {
      drawSingleUnit('leftEar', pal.earOuter);
      drawSingleUnit('rightEar', pal.earOuter);
      ctx.save();
      ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(115, 98, 84, 0.75)';
      ctx.textAlign = 'center';
      ctx.fillText(_tr('左耳'), CW * 0.29, CH - 22);
      ctx.fillText(_tr('右耳'), CW * 0.71, CH - 22);
      ctx.restore();
    } else if (partId === 'eyes') {
      drawSingleUnit('leftIris', '#F7F1E8');
      drawSingleUnit('rightIris', '#F7F1E8');
      ctx.save();
      ctx.font = '500 11.5px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(115, 98, 84, 0.78)';
      ctx.textAlign = 'center';
      ctx.fillText(_tr('左眼虹膜与高光'), CW * 0.30, CH - 52);
      ctx.fillText(_tr('右眼虹膜与高光'), CW * 0.70, CH - 52);
      ctx.fillStyle = 'rgba(130, 114, 98, 0.68)';
      ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillText(_tr('独立眼球贴图会随眨眼、愤怒、闭眼和眯眼自然裁切；右侧「图层」可切换是否保留默认动态瞳孔'), CW * 0.5, CH - 20);
      ctx.restore();
    } else if (partId === 'hindPaws') {
      drawSingleUnit('leftHindPaw', pal.hindPaw || pal.paws);
      drawSingleUnit('rightHindPaw', pal.hindPaw || pal.paws);
      ctx.save();
      ctx.font = '500 11.5px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(115, 98, 84, 0.78)';
      ctx.textAlign = 'center';
      ctx.fillText(_tr('左后爪（坐姿露出）'), CW * 0.30, CH - 52);
      ctx.fillText(_tr('右后爪（坐姿露出）'), CW * 0.70, CH - 52);
      ctx.restore();
    } else if (partId === 'head') {
      drawSingleUnit('head', pal.headBody || pal.body);
      ctx.save();
      ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(115, 98, 84, 0.74)';
      ctx.textAlign = 'left';
      ctx.fillText(_tr('全脸（含鼻嘴与外延转头露出区）皆在同一透明纸画布上自由直绘 · 瞳孔点上方「眼睛」画'), 12, CH - 12);
      ctx.restore();
    } else if (partId === 'body') {
      drawSingleUnit('body', pal.body);
      ctx.save();
      ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(115, 98, 84, 0.74)';
      ctx.textAlign = 'left';
      ctx.fillText(_tr('实线：正脸可见 · 虚线：抬头/转头露出脖子区（可绘制）'), 12, 24);
      ctx.restore();
    } else if (partId === 'leftArm' || partId === 'rightArm') {
      drawSingleUnit(partId, pal.legs);
      ctx.save();
      ctx.font = '500 11.5px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(115, 98, 84, 0.78)';
      ctx.textAlign = 'left';
      ctx.fillText(_tr('← 肩部（根部）'), CW * 0.5 + 96, 68);
      ctx.fillText(_tr('← 小爪与爪尖（全直绘不遮挡）'), CW * 0.5 + 96, CH - 78);
      ctx.restore();
    } else if (partId === 'hindLeg') {
      drawSingleUnit('hindLeg', pal.hindLeg || pal.legs);
      ctx.save();
      ctx.font = '500 11.5px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(115, 98, 84, 0.78)';
      ctx.textAlign = 'left';
      ctx.fillText(_tr('← 腿根（臀部）'), CW * 0.5 + 96, 68);
      ctx.fillText(_tr('← 后爪与脚垫（三键踩键）'), CW * 0.5 + 96, CH - 78);
      ctx.restore();
    } else if (partId === 'tail') {
      drawSingleUnit('tail', pal.tail);
      ctx.save();
      ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(115, 98, 84, 0.74)';
      ctx.fillText(_tr('尾根'), 42, CH * 0.5 + 102);
      ctx.textAlign = 'right';
      ctx.fillText(_tr('尾尖'), CW - 42, CH * 0.5 + 102);
      ctx.restore();
    }

    // Center symmetry axis guide when mirror enabled
    if (mirrorEnabled && (partId === 'head' || partId === 'body' || isDualPart(partId))) {
      ctx.save();
      ctx.setLineDash([4 / effScale, 5 / effScale]);
      ctx.strokeStyle = 'rgba(217, 119, 54, 0.32)';
      ctx.lineWidth = 1.15 / effScale;
      ctx.beginPath();
      ctx.moveTo(CW * 0.5, 28);
      ctx.lineTo(CW * 0.5, CH - 24);
      ctx.stroke();
      ctx.restore();
    }

    // Active Rect / Lasso selection creation preview
    if (marqueeDraft) {
      ctx.save();
      ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 1.3 / effScale;
      ctx.setLineDash([4 / effScale, 3 / effScale]);
      if (marqueeDraft.kind === 'rect' && marqueeDraft.startW && marqueeDraft.curW) {
        const x0 = Math.min(marqueeDraft.startW.x, marqueeDraft.curW.x);
        const y0 = Math.min(marqueeDraft.startW.y, marqueeDraft.curW.y);
        const w = Math.abs(marqueeDraft.curW.x - marqueeDraft.startW.x);
        const h = Math.abs(marqueeDraft.curW.y - marqueeDraft.startW.y);
        ctx.fillRect(x0, y0, w, h);
        ctx.strokeRect(x0, y0, w, h);
      } else if (marqueeDraft.kind === 'lasso' && marqueeDraft.ptsW && marqueeDraft.ptsW.length > 1) {
        ctx.beginPath();
        ctx.moveTo(marqueeDraft.ptsW[0].x, marqueeDraft.ptsW[0].y);
        for (let i = 1; i < marqueeDraft.ptsW.length; i++) ctx.lineTo(marqueeDraft.ptsW[i].x, marqueeDraft.ptsW[i].y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Active floating transform oriented bounding box (4 corner scale handles + top rotation lollipop)
    const ft = Layers ? Layers.getFloatingTransform() : null;
    if (ft && PART_BY_ID[partId] && PART_BY_ID[partId].spaces.indexOf(ft.texKey) !== -1) {
      const box = getFloatingWorldBox(ft, skin, partId);
      if (box) {
        ctx.save();
        ctx.translate(box.cx, box.cy);
        ctx.rotate(box.rot);
        ctx.setLineDash([4 / effScale, 3 / effScale]);
        ctx.strokeStyle = '#2563EB';
        ctx.lineWidth = 1.4 / effScale;
        ctx.strokeRect(-box.hw, -box.hh, box.hw * 2, box.hh * 2);
        ctx.setLineDash([]);

        // Stem + top rotation handle
        const stemLen = 20 / effScale;
        ctx.beginPath();
        ctx.moveTo(0, -box.hh);
        ctx.lineTo(0, -box.hh - stemLen);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -box.hh - stemLen, 4.6 / effScale, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = '#D97736';
        ctx.lineWidth = 1.6 / effScale;
        ctx.stroke();

        // 4 corner scale handles
        const hr = 4.4 / effScale;
        const corners = [
          [-box.hw, -box.hh], [box.hw, -box.hh],
          [box.hw, box.hh], [-box.hw, box.hh]
        ];
        for (let ci = 0; ci < corners.length; ci++) {
          ctx.beginPath();
          ctx.arc(corners[ci][0], corners[ci][1], hr, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
          ctx.strokeStyle = '#2563EB';
          ctx.lineWidth = 1.5 / effScale;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Brush cursor preview ring
    const isPaintTool = activeTool !== 'bucket' && activeTool !== 'eyedropper' && activeTool !== 'selectRect' && activeTool !== 'selectLasso';
    if (cursorCanvasPt && !panning && !panToolActive && !spacePanHeld && isPaintTool) {
      const wScale = PART_VIEW[partId].scale || 3.55;
      const effBrush = brushPartSizeFor(partId);
      const r = Math.max(2.2 / effScale, effBrush * wScale * (activeTool === 'airbrush' ? 0.65 : 0.5));
      ctx.save();
      ctx.beginPath();
      ctx.arc(cursorCanvasPt.x, cursorCanvasPt.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = activeTool === 'eraser' ? '#E5484D' : 'rgba(36, 30, 26, 0.68)';
      ctx.lineWidth = 1.4 / effScale;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cursorCanvasPt.x, cursorCanvasPt.y, r + 1.2 / effScale, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1.0 / effScale;
      ctx.stroke();
      ctx.restore();
    }
  }

  // -------------------------------------------------------------------------
  // Animation & Rendering Loop
  // -------------------------------------------------------------------------
  function drawFrame(now) {
    rafId = 0;
    const skin = getSkin();
    if (!canvas || !ctx || !skin) return;

    let needMore = false;
    if (explodeT !== explodeTarget) {
      const p = clamp((now - explodeAnimStart) / explodeAnimDur, 0, 1);
      const eased = explodeTarget > explodeStartT ? springOut(p) : easeOutCubic(p);
      explodeT = explodeStartT + (explodeTarget - explodeStartT) * eased;
      if (p >= 1) explodeT = explodeTarget;
      else needMore = true;
    }

    if (zoomT !== zoomTarget) {
      const p = clamp((now - zoomAnimStart) / zoomAnimDur, 0, 1);
      zoomT = zoomStartT + (zoomTarget - zoomStartT) * easeOutCubic(p);
      if (p >= 1) zoomT = zoomTarget;
      else needMore = true;
    }

    ctx.clearRect(0, 0, viewW, viewH);

    // Subtle full-bleed dot grid
    ctx.save();
    ctx.fillStyle = 'rgba(135, 118, 102, 0.14)';
    if (mode === 'part' && zoomT >= 0.05) {
      const gridStep = Math.max(14, Math.min(48, 24 * fitScale * viewZoom));
      const ox = ((viewW * 0.5 + viewPanX) % gridStep + gridStep) % gridStep;
      const oy = ((viewH * 0.5 + viewPanY) % gridStep + gridStep) % gridStep;
      for (let gx = ox; gx < viewW; gx += gridStep) {
        for (let gy = oy; gy < viewH; gy += gridStep) {
          ctx.fillRect(gx, gy, 1.5, 1.5);
        }
      }
    } else {
      for (let gx = 20; gx < viewW; gx += 26) {
        for (let gy = 20; gy < viewH; gy += 26) {
          ctx.fillRect(gx, gy, 1.5, 1.5);
        }
      }
    }
    ctx.restore();

    if (mode === 'exploded' || (mode === 'part' && zoomT < 0.05)) {
      ctx.save();
      ctx.translate(fitOffX, fitOffY);
      ctx.scale(fitScale, fitScale);
      renderExplodedOverview(skin);
      ctx.restore();
    } else if (mode === 'part') {
      const entrySc = zoomT < 1 ? (0.86 + 0.14 * zoomT) : 1.0;
      const totalScale = fitScale * viewZoom * entrySc;
      ctx.save();
      if (zoomT < 1) ctx.globalAlpha = clamp(zoomT * 1.15, 0.25, 1);
      ctx.translate(viewW * 0.5 + viewPanX, viewH * 0.5 + viewPanY);
      ctx.scale(totalScale, totalScale);
      ctx.translate(-CW * 0.5, -CH * 0.5);
      renderPartPaintCanvas(skin);
      ctx.restore();
    }

    if (needMore) {
      rafId = requestAnimationFrame(drawFrame);
    }
  }

  function requestRedraw() {
    if (!rafId && mode !== 'hero') {
      rafId = requestAnimationFrame(drawFrame);
    }
  }

  // -------------------------------------------------------------------------
  // Viewport Zoom & Pan
  // -------------------------------------------------------------------------
  function screenToExplodedPt(sPt) {
    return {
      x: (sPt.x - fitOffX) / fitScale,
      y: (sPt.y - fitOffY) / fitScale
    };
  }

  function screenToWorldPt(sPt) {
    const totalScale = Math.max(0.05, fitScale * viewZoom);
    return {
      x: CW * 0.5 + (sPt.x - viewW * 0.5 - viewPanX) / totalScale,
      y: CH * 0.5 + (sPt.y - viewH * 0.5 - viewPanY) / totalScale
    };
  }

  function clampViewPan() {
    const totalScale = fitScale * viewZoom;
    const maxX = Math.max(viewW * 0.30, CW * 0.5 * totalScale);
    const maxY = Math.max(viewH * 0.30, CH * 0.5 * totalScale);
    viewPanX = clamp(viewPanX, -maxX, maxX);
    viewPanY = clamp(viewPanY, -maxY, maxY);
  }

  function updateZoomControlsUI() {
    if (zoomBarEl) zoomBarEl.hidden = mode !== 'part';
    if (zoomResetBtn) {
      const pct = Math.round(viewZoom * 100);
      zoomResetBtn.textContent = pct + '%';
      zoomResetBtn.classList.toggle('is-zoomed', Math.abs(viewZoom - 1) > 0.015 || Math.abs(viewPanX) > 2 || Math.abs(viewPanY) > 2);
    }
    if (zoomOutBtn) zoomOutBtn.disabled = viewZoom <= VIEW_ZOOM_MIN + 0.01;
    if (zoomInBtn) zoomInBtn.disabled = viewZoom >= VIEW_ZOOM_MAX - 0.01;
    if (panToggleBtn) panToggleBtn.classList.toggle('active', panToolActive);
  }

  function cursorForActiveTool() {
    if (panToolActive || spacePanHeld) return 'grab';
    if (activeTool === 'selectRect' || activeTool === 'selectLasso') return 'crosshair';
    if (activeTool === 'eyedropper' || activeTool === 'bucket') return 'crosshair';
    return 'none';
  }

  function setPanToolActive(on) {
    panToolActive = !!on;
    if (panToggleBtn) panToggleBtn.classList.toggle('active', panToolActive);
    if (canvas && mode === 'part') canvas.style.cursor = cursorForActiveTool();
    requestRedraw();
  }

  function setPartViewport(nextZoom, anchorScreenPt) {
    const clampedZoom = clamp(round2(nextZoom), VIEW_ZOOM_MIN, VIEW_ZOOM_MAX);
    if (anchorScreenPt) {
      const worldBefore = screenToWorldPt(anchorScreenPt);
      viewZoom = clampedZoom;
      const totalScale = fitScale * viewZoom;
      viewPanX = anchorScreenPt.x - viewW * 0.5 - (worldBefore.x - CW * 0.5) * totalScale;
      viewPanY = anchorScreenPt.y - viewH * 0.5 - (worldBefore.y - CH * 0.5) * totalScale;
    } else {
      const ratio = clampedZoom / viewZoom;
      viewZoom = clampedZoom;
      viewPanX *= ratio;
      viewPanY *= ratio;
    }
    clampViewPan();
    updateZoomControlsUI();
    requestRedraw();
  }

  function resetPartViewport() {
    viewZoom = 1.0;
    viewPanX = 0;
    viewPanY = 0;
    panToolActive = false;
    panning = false;
    panPointerId = null;
    panStart = null;
    pinchPrev = null;
    updateZoomControlsUI();
    requestRedraw();
  }

  function fitStageCanvases() {
    const expWrap = document.getElementById('exploded-canvas-wrap');
    if (canvas && ctx && expWrap) {
      const w = Math.round(expWrap.clientWidth);
      const h = Math.round(expWrap.clientHeight);
      if (w > 20 && h > 20) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const bw = Math.round(w * dpr);
        const bh = Math.round(h * dpr);
        if (canvas.width !== bw || canvas.height !== bh || viewW !== w || viewH !== h) {
          viewW = w;
          viewH = h;
          fitScale = Math.min(viewW / CW, viewH / CH);
          fitOffX = (viewW - CW * fitScale) * 0.5;
          fitOffY = (viewH - CH * fitScale) * 0.5;
          canvas.width = bw;
          canvas.height = bh;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          clampViewPan();
        }
      }
    }
    notifyFloatingPet();
  }

  function scheduleFitCanvases() {
    requestAnimationFrame(() => {
      fitStageCanvases();
      requestRedraw();
    });
  }

  // -------------------------------------------------------------------------
  // Selection Floating Bar UI
  // -------------------------------------------------------------------------
  function updateSelectionBarUI() {
    if (!selectionBarEl) return;
    const ft = Layers ? Layers.getFloatingTransform() : null;
    const active = mode === 'part' && !!ft && PART_BY_ID[selectedPartId] && PART_BY_ID[selectedPartId].spaces.indexOf(ft.texKey) !== -1;
    selectionBarEl.hidden = !active;
    if (active) {
      if (selInfoEl) {
        selInfoEl.textContent = ft.kind === 'import'
          ? '已导入图片图层 · 拖动移位 / 四角缩放 / 顶部旋转'
          : '已框选局部像素 · 拖动移位 / 四角缩放 / 顶部旋转';
      }
      if (selDebgBtn) {
        selDebgBtn.hidden = ft.kind !== 'import';
      }
    }
  }

  function updateActiveLayerPillUI(texKey) {
    if (!activeLayerPillEl || !Layers) return;
    activeLayerPillEl.hidden = mode !== 'part';
    if (mode !== 'part') return;
    const activeLayer = Layers.getActiveLayer(texKey);
    const layers = Layers.getLayers(texKey);
    if (activeLayerNameEl) {
      activeLayerNameEl.textContent = activeLayer ? activeLayer.name : '图层 1';
    }
    if (layerCountEl) {
      layerCountEl.textContent = String(layers.length);
    }
  }

  // -------------------------------------------------------------------------
  // State Transitions: Hero -> Exploded -> Part
  // -------------------------------------------------------------------------
  function setCornerTab(tab) {
    activeCornerTab = tab || null;
    if (cornerDrawerEl) cornerDrawerEl.hidden = !activeCornerTab;
    if (floatingCornerEl) {
      const tabs = floatingCornerEl.querySelectorAll('[data-ps-tab]');
      for (let i = 0; i < tabs.length; i++) {
        const isAct = tabs[i].dataset.psTab === activeCornerTab;
        tabs[i].classList.toggle('active', isAct);
        tabs[i].setAttribute('aria-expanded', isAct ? 'true' : 'false');
      }
    }
    if (brushDockEl) brushDockEl.hidden = activeCornerTab !== 'brush';
    if (inspectorEl) inspectorEl.hidden = activeCornerTab !== 'body';
    if (layersPaneEl) layersPaneEl.hidden = activeCornerTab !== 'layers';
    if (drawerTitleEl && activeCornerTab) {
      drawerTitleEl.textContent =
        activeCornerTab === 'brush' ? '笔刷与工具设置' :
        activeCornerTab === 'body' ? '身材与部位底色' : '透明纸图层栈（上盖下）';
    }
  }

  function enterExplodedMode(animate) {
    if (Layers && Layers.getFloatingTransform()) Layers.commitFloatingTransform();
    mode = 'exploded';
    hoverPartId = null;
    mountedInspectorKey = '';
    mountedLayersKey = '';
    spacePanHeld = false;
    marqueeDraft = null;
    transformDrag = null;
    if (workbenchEl) {
      workbenchEl.classList.remove('mode-hero');
      workbenchEl.classList.add('mode-editing');
    }
    if (heroOverlayEl) heroOverlayEl.hidden = true;
    if (leftPaneEl) leftPaneEl.hidden = false;
    if (partHeaderEl) partHeaderEl.classList.remove('is-part');
    if (partBackBtn) partBackBtn.hidden = true;
    if (quickToolsEl) quickToolsEl.hidden = true;
    if (activeLayerPillEl) activeLayerPillEl.hidden = true;
    if (floatingCornerEl) floatingCornerEl.hidden = true;
    setCornerTab(null);
    updateSelectionBarUI();
    if (window.__kuroSetDecoDockCollapsed) window.__kuroSetDecoDockCollapsed(false);
    resetPartViewport();
    updatePartPillsUI();

    if (animate !== false) {
      explodeStartT = 0;
      explodeT = 0;
      explodeTarget = 1;
      explodeAnimStart = performance.now();
    } else {
      explodeT = 1;
      explodeTarget = 1;
    }
    zoomT = 0;
    zoomTarget = 0;
    notifyFloatingPet();
    scheduleFitCanvases();
    requestRedraw();
  }

  function openPartEditor(partId) {
    if (!PART_BY_ID[partId]) return;
    if (Layers && Layers.getFloatingTransform() && PART_BY_ID[partId].spaces.indexOf(Layers.getFloatingTransform().texKey) === -1) {
      Layers.commitFloatingTransform();
    }
    selectedPartId = partId;
    mode = 'part';
    hoverPartId = null;
    marqueeDraft = null;
    transformDrag = null;
    mirrorEnabled = PART_BY_ID[partId].defaultMirror;
    if (mirrorToggleEl) {
      mirrorToggleEl.checked = mirrorEnabled;
      mirrorToggleEl.disabled = !PART_BY_ID[partId].canMirror;
    }
    if (workbenchEl) {
      workbenchEl.classList.remove('mode-hero');
      workbenchEl.classList.add('mode-editing');
    }
    if (heroOverlayEl) heroOverlayEl.hidden = true;
    if (leftPaneEl) leftPaneEl.hidden = false;
    if (partHeaderEl) partHeaderEl.classList.add('is-part');
    if (partBackBtn) partBackBtn.hidden = false;
    if (quickToolsEl) quickToolsEl.hidden = false;
    if (activeLayerPillEl) activeLayerPillEl.hidden = false;
    if (floatingCornerEl) floatingCornerEl.hidden = false;
    setCornerTab(activeCornerTab);
    if (window.__kuroSetDecoDockCollapsed) window.__kuroSetDecoDockCollapsed(true);
    resetPartViewport();

    zoomStartT = 0;
    zoomT = 0;
    zoomTarget = 1;
    zoomAnimStart = performance.now();
    mountedInspectorKey = '';
    mountedLayersKey = '';
    updatePartPillsUI();
    renderPartInspector();
    renderPartLayersDrawer();
    updateSelectionBarUI();
    notifyFloatingPet();
    scheduleFitCanvases();
    requestRedraw();
  }

  function backToExploded() {
    if (Layers && Layers.getFloatingTransform()) Layers.commitFloatingTransform();
    mode = 'exploded';
    drawing = false;
    activeStrokePrimary = null;
    activeStrokeMirror = null;
    cursorCanvasPt = null;
    mountedInspectorKey = '';
    mountedLayersKey = '';
    spacePanHeld = false;
    marqueeDraft = null;
    transformDrag = null;
    if (partHeaderEl) partHeaderEl.classList.remove('is-part');
    if (partBackBtn) partBackBtn.hidden = true;
    if (quickToolsEl) quickToolsEl.hidden = true;
    if (activeLayerPillEl) activeLayerPillEl.hidden = true;
    if (floatingCornerEl) floatingCornerEl.hidden = true;
    setCornerTab(null);
    updateSelectionBarUI();
    if (window.__kuroSetDecoDockCollapsed) window.__kuroSetDecoDockCollapsed(false);
    resetPartViewport();
    explodeT = 1;
    explodeTarget = 1;
    zoomT = 0;
    zoomTarget = 0;
    updatePartPillsUI();
    notifyFloatingPet();
    scheduleFitCanvases();
    requestRedraw();
  }

  function updatePartPillsUI() {
    if (!partPillsWrap) return;
    const btns = partPillsWrap.querySelectorAll('[data-exploded-part]');
    for (let i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', mode === 'part' && btns[i].dataset.explodedPart === selectedPartId);
    }
  }

  // -------------------------------------------------------------------------
  // Body & Colors Inspector (Tab 2)
  // -------------------------------------------------------------------------
  function getPaletteHexForChip(pal, key) {
    if (key === 'headBody') return colorToHex(pal.headBody || pal.body, '#1A1A1E');
    if (key === 'belly') return colorToHex(pal.belly || pal.body, '#FFFFFF');
    if (key === 'tailTip') return colorToHex(pal.tailTip || pal.tail, '#FFFFFF');
    if (key === 'hindLeg') return colorToHex(pal.hindLeg || pal.legs, '#1A1A1E');
    if (key === 'hindPaw') return colorToHex(pal.hindPaw || pal.paws, '#FFFFFF');
    if (key === 'irisLeft') return colorToHex(pal.irisLeft || pal.iris, '#D2E83A');
    if (key === 'irisRight') return colorToHex(pal.irisRight || pal.iris, '#D2E83A');
    if (key === 'pupil') return colorToHex(pal.pupil || pal.pupilLeft, '#141416');
    return colorToHex(pal[key], '#1A1A1E');
  }

  function colorChip(label, palKey, hex) {
    return '<label class="ctx-color-chip"><span>' + label + '</span><input type="color" data-ctx-pal="' + palKey + '" value="' + hex + '" /></label>';
  }

  function sliderRow(label, key, min, max, step, val, unit) {
    const disp = (unit === 'px' ? Math.round(val) : Number(val).toFixed(2)) + unit;
    return '<label class="ctx-slider-row">' +
      '<span class="ctx-label">' + label + '</span>' +
      '<input type="range" data-ctx-shape="' + key + '" data-unit="' + unit + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" />' +
      '<span class="ctx-val tabular">' + disp + '</span>' +
    '</label>';
  }

  function syncInspectorValues(skin) {
    if (!inspectorEl) return;
    const pal = skin.palette;
    const shape = skin.shape;
    const pInputs = inspectorEl.querySelectorAll('[data-ctx-pal]');
    for (let i = 0; i < pInputs.length; i++) {
      const inp = pInputs[i];
      if (inp === document.activeElement) continue;
      const hex = getPaletteHexForChip(pal, inp.dataset.ctxPal);
      if (inp.value.toUpperCase() !== hex.toUpperCase()) inp.value = hex;
    }
    const sInputs = inspectorEl.querySelectorAll('[data-ctx-shape]');
    for (let i = 0; i < sInputs.length; i++) {
      const inp = sInputs[i];
      const key = inp.dataset.ctxShape;
      const range = Spec.SHAPE_RANGES[key];
      const def = range ? range[2] : 1;
      const val = typeof shape[key] === 'number' ? shape[key] : def;
      if (inp !== document.activeElement) inp.value = String(val);
      const unit = inp.dataset.unit || '';
      const valSpan = inp.parentElement ? inp.parentElement.querySelector('.ctx-val') : null;
      if (valSpan) valSpan.textContent = (unit === 'px' ? Math.round(val) : Number(val).toFixed(2)) + unit;
    }
  }

  function renderPartInspector() {
    if (!inspectorEl || mode !== 'part') return;
    const raw = getRaw();
    const skin = getSkin();
    if (!raw || !skin) return;

    const partId = selectedPartId;
    const shape = skin.shape;
    const pal = skin.palette;

    if (mountedInspectorKey === partId && inspectorEl.childElementCount > 0) {
      syncInspectorValues(skin);
      return;
    }
    mountedInspectorKey = partId;

    let colorsHtml = '';
    let slidersHtml = '';

    if (partId === 'leftArm' || partId === 'rightArm') {
      colorsHtml =
        colorChip('手臂底毛', 'legs', colorToHex(pal.legs, '#1A1A1E')) +
        colorChip('小爪底色', 'paws', colorToHex(pal.paws, '#FFFFFF'));
      slidersHtml =
        sliderRow('双手间距', 'armSpacing', 0.55, 1.60, 0.02, shape.armSpacing || 1.0, '×') +
        sliderRow('根部高低', 'armRootY', -18, 18, 1, shape.armRootY || 0, 'px') +
        sliderRow('手臂长短', 'armLength', 0.65, 1.45, 0.02, shape.armLength || 1.0, '×') +
        sliderRow('双爪错落', 'pawStagger', 0, 1, 0.05, shape.pawStagger != null ? shape.pawStagger : 1.0, '');
    } else if (partId === 'hindLeg') {
      colorsHtml =
        colorChip('后腿底毛', 'hindLeg', colorToHex(pal.hindLeg || pal.legs, '#1A1A1E')) +
        colorChip('后爪底色', 'hindPaw', colorToHex(pal.hindPaw || pal.paws, '#FFFFFF'));
      slidersHtml =
        sliderRow('根部左右', 'hindLegRootX', -16, 16, 1, shape.hindLegRootX || 0, 'px') +
        sliderRow('根部高低', 'hindLegRootY', -14, 14, 1, shape.hindLegRootY || 0, 'px') +
        sliderRow('后腿粗细', 'hindLegWidth', 0.70, 1.45, 0.02, shape.hindLegWidth || 1.0, '×') +
        sliderRow('伸出长度', 'hindLegReach', 0.75, 1.35, 0.02, shape.hindLegReach || 1.0, '×');
    } else if (partId === 'hindPaws') {
      colorsHtml =
        colorChip('坐姿后爪底', 'hindPaw', colorToHex(pal.hindPaw || pal.paws, '#FFFFFF')) +
        colorChip('躯干底毛', 'body', colorToHex(pal.body, '#1A1A1E'));
      slidersHtml =
        sliderRow('双爪错落', 'pawStagger', 0, 1, 0.05, shape.pawStagger != null ? shape.pawStagger : 1.0, '') +
        sliderRow('身体胖瘦', 'bodyWidth', 0.85, 1.35, 0.02, shape.bodyWidth || 1.0, '×');
    } else if (partId === 'head') {
      colorsHtml =
        colorChip('头部底色', 'headBody', colorToHex(pal.headBody || pal.body, '#1A1A1E')) +
        colorChip('胡须', 'whiskers', colorToHex(pal.whiskers, '#DCDCDC'));
      slidersHtml =
        sliderRow('头部大小', 'headScale', 0.90, 1.15, 0.01, shape.headScale || 1.0, '×') +
        sliderRow('腮帮圆润', 'cheekFullness', 0.85, 1.25, 0.01, shape.cheekFullness || 1.0, '×');
    } else if (partId === 'eyes') {
      colorsHtml =
        colorChip('左眼底色', 'irisLeft', colorToHex(pal.irisLeft || pal.iris, '#D2E83A')) +
        colorChip('右眼底色', 'irisRight', colorToHex(pal.irisRight || pal.iris, '#D2E83A')) +
        colorChip('默认瞳孔', 'pupil', colorToHex(pal.pupil || pal.pupilLeft, '#141416'));
      slidersHtml =
        sliderRow('头部大小', 'headScale', 0.90, 1.15, 0.01, shape.headScale || 1.0, '×');
    } else if (partId === 'ears') {
      colorsHtml =
        colorChip('外耳底色', 'earOuter', colorToHex(pal.earOuter, '#1A1A1E'));
      slidersHtml =
        sliderRow('耳朵大小', 'earSize', 0.80, 1.25, 0.02, shape.earSize || 1.0, '×') +
        sliderRow('双耳间距', 'earSpacing', 0.65, 1.35, 0.02, shape.earSpacing || 1.0, '×') +
        sliderRow('耳根宽度', 'earBaseWidth', 0.65, 1.40, 0.02, shape.earBaseWidth || 1.0, '×') +
        sliderRow('耳尖锐度', 'earPointiness', 0.50, 1.50, 0.02, shape.earPointiness || 1.0, '×');
    } else if (partId === 'body') {
      colorsHtml =
        colorChip('躯干底色', 'body', colorToHex(pal.body, '#1A1A1E'));
      slidersHtml =
        sliderRow('身体胖瘦', 'bodyWidth', 0.85, 1.35, 0.02, shape.bodyWidth || 1.0, '×') +
        sliderRow('脖子粗细', 'neckWidth', 0.65, 1.40, 0.02, shape.neckWidth || 1.0, '×');
    } else if (partId === 'tail') {
      colorsHtml =
        colorChip('尾巴底色', 'tail', colorToHex(pal.tail, '#1A1A1E'));
      slidersHtml =
        sliderRow('尾巴长度', 'tailLength', 0.70, 1.30, 0.02, shape.tailLength || 1.0, '×') +
        sliderRow('尾巴粗细', 'tailThickness', 0.70, 1.50, 0.02, shape.tailThickness || 1.0, '×') +
        sliderRow('尾根高低', 'tailRootY', -14, 14, 1, shape.tailRootY || 0, 'px');
    }

    inspectorEl.innerHTML =
      '<div class="ctx-colors-row">' + colorsHtml + '</div>' +
      '<div class="ctx-sliders-grid">' + slidersHtml + '</div>';

    const pInputs = inspectorEl.querySelectorAll('[data-ctx-pal]');
    for (let i = 0; i < pInputs.length; i++) {
      pInputs[i].addEventListener('input', function () {
        const key = this.dataset.ctxPal;
        const val = this.value.toUpperCase();
        const r = getRaw();
        if (!r) return;
        if (!r.palette) r.palette = {};
        if (key === 'irisLeft') {
          if (!r.palette.irisRight && r.palette.iris) r.palette.irisRight = r.palette.iris;
          r.palette.irisLeft = val;
          r.palette.iris = val;
        } else if (key === 'irisRight') {
          if (!r.palette.irisLeft && r.palette.iris) r.palette.irisLeft = r.palette.iris;
          r.palette.irisRight = val;
        } else if (key === 'pupil') {
          r.palette.pupil = val;
          delete r.palette.pupilLeft;
          delete r.palette.pupilRight;
        } else if (key === 'body' || key === 'headBody') {
          r.palette[key] = val;
          delete r.palette.bodyShade;
        } else {
          r.palette[key] = val;
        }
        if (key === 'legs') r.idleLegs = 'legs';
        notifyChange(false);
      });
      pInputs[i].addEventListener('change', () => notifyChange(true));
    }

    const sInputs = inspectorEl.querySelectorAll('[data-ctx-shape]');
    for (let i = 0; i < sInputs.length; i++) {
      sInputs[i].addEventListener('input', function () {
        const key = this.dataset.ctxShape;
        const val = parseFloat(this.value);
        const r = getRaw();
        if (!r) return;
        if (!r.shape) r.shape = { build: 'standard' };
        r.shape[key] = val;
        const unit = this.dataset.unit || '';
        const valSpan = this.parentElement.querySelector('.ctx-val');
        if (valSpan) valSpan.textContent = (unit === 'px' ? Math.round(val) : val.toFixed(2)) + unit;
        notifyChange(false);
      });
      sInputs[i].addEventListener('change', () => notifyChange(true));
    }
  }

  // -------------------------------------------------------------------------
  // True PS-Style Transparent Layers Drawer (Tab 3)
  // -------------------------------------------------------------------------
  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function drawLayerThumbnails(root, texKey) {
    if (!root || !Layers) return;
    const layers = Layers.getLayers(texKey);
    const byId = {};
    for (let i = 0; i < layers.length; i++) byId[layers[i].id] = layers[i];
    const thumbs = root.querySelectorAll('canvas[data-layer-thumb]');
    for (let i = 0; i < thumbs.length; i++) {
      const cvs = thumbs[i];
      const layer = byId[cvs.dataset.layerThumb];
      if (!layer || !layer.canvas) continue;
      const cx = cvs.getContext('2d');
      cx.clearRect(0, 0, cvs.width, cvs.height);
      cx.drawImage(layer.canvas, 0, 0, cvs.width, cvs.height);
    }
  }

  function renderPartLayersDrawer() {
    if (!layersPaneEl || !Layers || mode !== 'part') return;
    const partId = selectedPartId;
    const texKey = getDefaultTexKeyForPart(partId);
    const layers = Layers.getLayers(texKey);
    const activeLayer = Layers.getActiveLayer(texKey);
    const opts = Layers.getOptions();

    updateActiveLayerPillUI(texKey);

    // Lightweight structural signature so thumbnails repaint without killing active slider focus
    const structSig = partId + '|' + texKey + '|' +
      (activeLayer ? [activeLayer.id, activeLayer.blendMode, Math.round(activeLayer.opacity * 100), activeLayer.clipToBelow ? 1 : 0, activeLayer.alphaLock ? 1 : 0].join(':') : '') + '|' +
      layers.map((l) => l.id + ':' + l.name + ':' + (l.visible ? 1 : 0) + ':' + (l.clipToBelow ? 1 : 0) + ':' + (l.alphaLock ? 1 : 0)).join(',') + '|' +
      [opts.hideDefaultPupil ? 1 : 0, opts.hideDefaultNose ? 1 : 0, opts.hideDefaultMouth ? 1 : 0].join('');

    if (mountedLayersKey === structSig && layersPaneEl.childElementCount > 0) {
      drawLayerThumbnails(layersPaneEl, texKey);
      return;
    }
    mountedLayersKey = structSig;

    let subToggleHtml = '';
    if (isDualPart(partId)) {
      const p = PART_BY_ID[partId];
      const labels = partId === 'ears' ? ['左耳', '右耳'] : (partId === 'eyes' ? ['左眼', '右眼'] : ['左后爪', '右后爪']);
      subToggleHtml =
        '<div class="ps-dual-switch" style="display:flex;gap:4px;">' +
          p.spaces.map((sp, idx) =>
            '<button type="button" class="mini-btn' + (sp === texKey ? ' active' : '') + '" style="' + (sp === texKey ? 'background:#d97736;color:#fff;border-color:#d97736;' : '') + '" data-sub-tex="' + sp + '">' + labels[idx] + '</button>'
          ).join('') +
        '</div>';
    }

    const activeIdx = activeLayer ? layers.findIndex((l) => l.id === activeLayer.id) : -1;
    const canClip = activeIdx > 0;
    const canMerge = activeIdx > 0;

    const blendOptsHtml = Layers.BLEND_MODES.map((bm) =>
      '<option value="' + bm.id + '"' + (activeLayer && activeLayer.blendMode === bm.id ? ' selected' : '') + '>' + bm.label + '</option>'
    ).join('');

    const opPct = activeLayer ? Math.round(activeLayer.opacity * 100) : 100;

    const propBarHtml = activeLayer
      ? '<div class="ps-layer-prop-bar">' +
          '<div class="ps-layer-prop-row">' +
            '<select id="ps-layer-blend" aria-label="混合模式">' + blendOptsHtml + '</select>' +
            '<span style="font-size:11px;color:#6c5e52;">透明</span>' +
            '<input type="range" id="ps-layer-opacity" min="0" max="100" step="1" value="' + opPct + '" />' +
            '<span class="tabular" id="ps-layer-opacity-val" style="font-size:11px;color:#5a4e43;min-width:30px;text-align:right;">' + opPct + '%</span>' +
          '</div>' +
          '<div class="ps-layer-prop-row">' +
            '<button type="button" class="ctx-layer-op' + (activeLayer.clipToBelow ? ' is-on' : '') + '" id="ps-layer-clip" style="width:auto;padding:0 7px;"' + (canClip ? '' : ' disabled') + ' title="剪贴蒙版：仅在下方相邻图层非透明像素内显示">↳ 剪贴</button>' +
            '<button type="button" class="ctx-layer-op' + (activeLayer.alphaLock ? ' is-on' : '') + '" id="ps-layer-alock" style="width:auto;padding:0 7px;" title="锁定透明像素：只可在已有像素上涂色，不溢出边缘">🔒 锁透明</button>' +
            '<button type="button" class="ctx-layer-op" id="ps-layer-dup" style="width:auto;padding:0 7px;" title="复制当前图层">复制</button>' +
            '<button type="button" class="ctx-layer-op" id="ps-layer-merge" style="width:auto;padding:0 7px;"' + (canMerge ? '' : ' disabled') + ' title="与下方图层向下合并">向下合并</button>' +
            '<button type="button" class="ctx-layer-op" id="ps-layer-clear" style="width:auto;padding:0 7px;" title="清空当前层像素">清空层</button>' +
          '</div>' +
        '</div>'
      : '';

    let rowsHtml = '';
    for (let li = layers.length - 1; li >= 0; li--) {
      const l = layers[li];
      const isAct = activeLayer && l.id === activeLayer.id;
      const bmMeta = Layers.BLEND_MODES.find((b) => b.id === l.blendMode);
      const metaBits = [];
      if (l.blendMode !== 'normal' && bmMeta) metaBits.push(bmMeta.label);
      if (l.opacity < 0.99) metaBits.push(Math.round(l.opacity * 100) + '%');
      if (l.alphaLock) metaBits.push('🔒');
      rowsHtml +=
        '<div class="ctx-layer-row' + (isAct ? ' active' : '') + (!l.visible ? ' is-hidden' : '') + (l.clipToBelow ? ' is-clipped' : '') + '" data-layer-select="' + l.id + '">' +
          (l.clipToBelow ? '<span class="ctx-layer-clip-arrow" title="剪贴蒙版到下方图层">↳</span>' : '') +
          '<button type="button" class="ctx-layer-eye" data-layer-toggle="' + l.id + '" title="' + (l.visible ? '隐藏图层' : '显示图层') + '">' + (l.visible ? '👁' : '🙈') + '</button>' +
          '<canvas class="ps-layer-thumb" width="28" height="28" data-layer-thumb="' + l.id + '"></canvas>' +
          '<span class="ctx-layer-name" data-layer-rename="' + l.id + '" title="双击重命名">' + escapeHtml(l.name) + '</span>' +
          (metaBits.length ? '<span class="ctx-layer-meta">' + metaBits.join(' · ') + '</span>' : '') +
          '<div class="ctx-layer-ops">' +
            '<button type="button" class="ctx-layer-op" data-layer-up="' + l.id + '"' + (li === layers.length - 1 ? ' disabled' : '') + ' title="上移">↑</button>' +
            '<button type="button" class="ctx-layer-op" data-layer-down="' + l.id + '"' + (li === 0 ? ' disabled' : '') + ' title="下移">↓</button>' +
            '<button type="button" class="ctx-layer-op danger" data-layer-del="' + l.id + '" title="' + (layers.length > 1 ? '删除图层' : '清空层') + '">×</button>' +
          '</div>' +
        '</div>';
    }

    let partOptsHtml = '';
    if (partId === 'eyes') {
      partOptsHtml =
        '<div class="ps-layer-prop-bar" style="gap:4px;">' +
          '<label class="ctx-grad-toggle"><input type="checkbox" id="opt-keep-pupil"' + (!opts.hideDefaultPupil ? ' checked' : '') + ' /><span>保留默认动态瞳孔与高光（会随鼠标追焦放大）</span></label>' +
        '</div>';
    } else if (partId === 'head') {
      partOptsHtml =
        '<div class="ps-layer-prop-bar" style="gap:4px;">' +
          '<label class="ctx-grad-toggle"><input type="checkbox" id="opt-show-vec-nose"' + (!opts.hideDefaultNose ? ' checked' : '') + ' /><span>额外叠加默认矢量鼻子（不建议与手绘重复开启）</span></label>' +
          '<label class="ctx-grad-toggle"><input type="checkbox" id="opt-show-vec-mouth"' + (!opts.hideDefaultMouth ? ' checked' : '') + ' /><span>额外叠加默认矢量嘴巴</span></label>' +
        '</div>';
    }

    layersPaneEl.innerHTML =
      '<div class="ctx-layers-panel">' +
        '<div class="ctx-layers-head">' +
          (subToggleHtml || '<span class="ctx-layers-title">透明纸叠加顺序</span>') +
          '<div class="ctx-layers-actions">' +
            '<button type="button" class="mini-btn" id="ctx-layer-add">+ 新建透明纸</button>' +
          '</div>' +
        '</div>' +
        propBarHtml +
        '<div class="ctx-layers-list">' + rowsHtml + '</div>' +
        partOptsHtml +
        '<div class="ps-layer-prop-row" style="justify-content:space-between;padding-top:2px;">' +
          '<button type="button" class="mini-btn" id="ps-quick-save-proj">保存原稿 (.kurocat-layers)</button>' +
          '<button type="button" class="mini-btn" id="ps-quick-load-proj">载入原稿</button>' +
        '</div>' +
      '</div>';

    drawLayerThumbnails(layersPaneEl, texKey);

    // Event bindings inside layers drawer
    const subBtns = layersPaneEl.querySelectorAll('[data-sub-tex]');
    for (let i = 0; i < subBtns.length; i++) {
      subBtns[i].addEventListener('click', function () {
        setActiveSubTexKey(partId, this.dataset.subTex);
        renderPartLayersDrawer();
        requestRedraw();
      });
    }

    const addBtn = layersPaneEl.querySelector('#ctx-layer-add');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const created = Layers.addLayer(texKey);
        if (created) {
          notifyChange(true);
          renderPartLayersDrawer();
          const api = API();
          if (api) api.showToast('已新建透明纸「' + created.name + '」');
        }
      });
    }

    const blendSel = layersPaneEl.querySelector('#ps-layer-blend');
    if (blendSel && activeLayer) {
      blendSel.addEventListener('change', function () {
        Layers.setLayerProp(texKey, activeLayer.id, 'blendMode', this.value);
        notifyChange(true);
        renderPartLayersDrawer();
      });
    }

    const opSlider = layersPaneEl.querySelector('#ps-layer-opacity');
    const opVal = layersPaneEl.querySelector('#ps-layer-opacity-val');
    if (opSlider && activeLayer) {
      let opSnapPending = true;
      opSlider.addEventListener('input', function () {
        const v = clamp(parseInt(this.value, 10) / 100, 0, 1);
        if (opVal) opVal.textContent = Math.round(v * 100) + '%';
        Layers.setLayerProp(texKey, activeLayer.id, 'opacity', v, !opSnapPending);
        opSnapPending = false;
        notifyChange(false, true);
      });
      opSlider.addEventListener('change', () => {
        opSnapPending = true;
        notifyChange(true);
        renderPartLayersDrawer();
      });
    }

    const clipBtn = layersPaneEl.querySelector('#ps-layer-clip');
    if (clipBtn && activeLayer) {
      clipBtn.addEventListener('click', () => {
        Layers.setLayerProp(texKey, activeLayer.id, 'clipToBelow', !activeLayer.clipToBelow);
        notifyChange(true);
        renderPartLayersDrawer();
      });
    }

    const alockBtn = layersPaneEl.querySelector('#ps-layer-alock');
    if (alockBtn && activeLayer) {
      alockBtn.addEventListener('click', () => {
        Layers.setLayerProp(texKey, activeLayer.id, 'alphaLock', !activeLayer.alphaLock);
        notifyChange(true);
        renderPartLayersDrawer();
      });
    }

    const dupBtn = layersPaneEl.querySelector('#ps-layer-dup');
    if (dupBtn && activeLayer) {
      dupBtn.addEventListener('click', () => {
        Layers.duplicateLayer(texKey, activeLayer.id);
        notifyChange(true);
        renderPartLayersDrawer();
      });
    }

    const mergeBtn = layersPaneEl.querySelector('#ps-layer-merge');
    if (mergeBtn && activeLayer) {
      mergeBtn.addEventListener('click', () => {
        Layers.mergeLayerDown(texKey, activeLayer.id);
        notifyChange(true);
        renderPartLayersDrawer();
      });
    }

    const clearLayerBtn = layersPaneEl.querySelector('#ps-layer-clear');
    if (clearLayerBtn && activeLayer) {
      clearLayerBtn.addEventListener('click', () => {
        Layers.clearLayer(texKey, activeLayer.id);
        notifyChange(true);
        renderPartLayersDrawer();
      });
    }

    const rowEls = layersPaneEl.querySelectorAll('[data-layer-select]');
    for (let i = 0; i < rowEls.length; i++) {
      rowEls[i].addEventListener('click', function () {
        Layers.setActiveLayer(texKey, this.dataset.layerSelect);
        renderPartLayersDrawer();
      });
    }

    const renameEls = layersPaneEl.querySelectorAll('[data-layer-rename]');
    for (let i = 0; i < renameEls.length; i++) {
      renameEls[i].addEventListener('dblclick', function (ev) {
        ev.stopPropagation();
        const lid = this.dataset.layerRename;
        const curName = this.textContent || '图层';
        const nextName = global.prompt('重命名透明纸图层：', curName);
        if (nextName && nextName.trim()) {
          Layers.renameLayer(texKey, lid, nextName.trim());
          renderPartLayersDrawer();
        }
      });
    }

    const eyeBtns = layersPaneEl.querySelectorAll('[data-layer-toggle]');
    for (let i = 0; i < eyeBtns.length; i++) {
      eyeBtns[i].addEventListener('click', function (ev) {
        ev.stopPropagation();
        const lid = this.dataset.layerToggle;
        const lyr = layers.find((x) => x.id === lid);
        if (!lyr) return;
        Layers.setLayerProp(texKey, lid, 'visible', !lyr.visible);
        notifyChange(true);
        renderPartLayersDrawer();
      });
    }

    const upBtns = layersPaneEl.querySelectorAll('[data-layer-up]');
    for (let i = 0; i < upBtns.length; i++) {
      upBtns[i].addEventListener('click', function (ev) {
        ev.stopPropagation();
        Layers.moveLayer(texKey, this.dataset.layerUp, 1);
        notifyChange(true);
        renderPartLayersDrawer();
      });
    }

    const downBtns = layersPaneEl.querySelectorAll('[data-layer-down]');
    for (let i = 0; i < downBtns.length; i++) {
      downBtns[i].addEventListener('click', function (ev) {
        ev.stopPropagation();
        Layers.moveLayer(texKey, this.dataset.layerDown, -1);
        notifyChange(true);
        renderPartLayersDrawer();
      });
    }

    const delBtns = layersPaneEl.querySelectorAll('[data-layer-del]');
    for (let i = 0; i < delBtns.length; i++) {
      delBtns[i].addEventListener('click', function (ev) {
        ev.stopPropagation();
        Layers.deleteLayer(texKey, this.dataset.layerDel);
        notifyChange(true);
        renderPartLayersDrawer();
      });
    }

    const keepPupilCb = layersPaneEl.querySelector('#opt-keep-pupil');
    if (keepPupilCb) {
      keepPupilCb.addEventListener('change', function () {
        Layers.setOption('hideDefaultPupil', !this.checked);
        notifyChange(true);
        requestRedraw();
      });
    }
    const vecNoseCb = layersPaneEl.querySelector('#opt-show-vec-nose');
    if (vecNoseCb) {
      vecNoseCb.addEventListener('change', function () {
        Layers.setOption('hideDefaultNose', !this.checked);
        notifyChange(true);
        requestRedraw();
      });
    }
    const vecMouthCb = layersPaneEl.querySelector('#opt-show-vec-mouth');
    if (vecMouthCb) {
      vecMouthCb.addEventListener('change', function () {
        Layers.setOption('hideDefaultMouth', !this.checked);
        notifyChange(true);
        requestRedraw();
      });
    }

    const qSave = layersPaneEl.querySelector('#ps-quick-save-proj');
    if (qSave) {
      qSave.addEventListener('click', () => {
        const b = document.getElementById('btn-export-layers-project');
        if (b) b.click();
      });
    }
    const qLoad = layersPaneEl.querySelector('#ps-quick-load-proj');
    if (qLoad) {
      qLoad.addEventListener('click', () => {
        const inp = document.getElementById('import-layers-project-input');
        if (inp) inp.click();
      });
    }
  }

  // -------------------------------------------------------------------------
  // Mirror Helpers for Pixel Strokes & Bucket
  // -------------------------------------------------------------------------
  function mirrorTargetFor(partId, texKey, pt) {
    if (!mirrorEnabled || !PART_BY_ID[partId] || !PART_BY_ID[partId].canMirror) return null;
    if (texKey === 'leftEar') return { texKey: 'rightEar', pt: { x: pt.x, y: pt.y } };
    if (texKey === 'rightEar') return { texKey: 'leftEar', pt: { x: pt.x, y: pt.y } };
    if (texKey === 'leftIris') return { texKey: 'rightIris', pt: { x: -pt.x, y: pt.y } };
    if (texKey === 'rightIris') return { texKey: 'leftIris', pt: { x: -pt.x, y: pt.y } };
    if (texKey === 'leftHindPaw') return { texKey: 'rightHindPaw', pt: { x: -pt.x, y: pt.y } };
    if (texKey === 'rightHindPaw') return { texKey: 'leftHindPaw', pt: { x: -pt.x, y: pt.y } };
    if (texKey === 'leftArm') return { texKey: 'rightArm', pt: { x: pt.x, y: pt.y } };
    if (texKey === 'rightArm') return { texKey: 'leftArm', pt: { x: pt.x, y: pt.y } };
    if (texKey === 'head' || texKey === 'body') return { texKey, pt: { x: -pt.x, y: pt.y } };
    return null;
  }

  // -------------------------------------------------------------------------
  // Floating Selection Transform Hit-Test & Drag Helpers
  // -------------------------------------------------------------------------
  function hitTestFloatingHandles(wPt, box, effScale) {
    if (!box) return null;
    const dx = wPt.x - box.cx;
    const dy = wPt.y - box.cy;
    const c = Math.cos(-box.rot), s = Math.sin(-box.rot);
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    const r = 10 / Math.max(0.4, effScale);
    const stemLen = 20 / effScale;

    if (Math.hypot(lx, ly - (-box.hh - stemLen)) <= r * 1.15) return { mode: 'rotate' };
    const corners = [
      { id: 'nw', x: -box.hw, y: -box.hh },
      { id: 'ne', x: box.hw, y: -box.hh },
      { id: 'se', x: box.hw, y: box.hh },
      { id: 'sw', x: -box.hw, y: box.hh }
    ];
    for (let i = 0; i < corners.length; i++) {
      if (Math.hypot(lx - corners[i].x, ly - corners[i].y) <= r) return { mode: 'scale', corner: corners[i].id };
    }
    if (Math.abs(lx) <= box.hw + 4 / effScale && Math.abs(ly) <= box.hh + 4 / effScale) {
      return { mode: 'move' };
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Canvas Pointer, Wheel & Pinch Events
  // -------------------------------------------------------------------------
  function getCanvasScreenPt(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * viewW,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * viewH
    };
  }

  function getTouchPair() {
    const ids = Object.keys(activeTouches);
    if (ids.length < 2) return null;
    const a = activeTouches[ids[0]];
    const b = activeTouches[ids[1]];
    return {
      cx: (a.x + b.x) * 0.5,
      cy: (a.y + b.y) * 0.5,
      dist: Math.max(10, Math.hypot(b.x - a.x, b.y - a.y))
    };
  }

  function worldPolyFromRect(a, b) {
    return [
      { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
      { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) },
      { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
      { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) }
    ];
  }

  function bindCanvasEvents() {
    canvas.addEventListener('contextmenu', (e) => {
      if (mode === 'part') e.preventDefault();
    });

    canvas.addEventListener('wheel', (e) => {
      if (mode !== 'part') return;
      e.preventDefault();
      const sPt = getCanvasScreenPt(e);
      const dy = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaY;
      const factor = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0024));
      setPartViewport(viewZoom * factor, sPt);
    }, { passive: false });

    canvas.addEventListener('pointerdown', (e) => {
      const skin = getSkin();
      if (!skin) return;
      const sPt = getCanvasScreenPt(e);

      if (mode === 'exploded') {
        const hit = hitTestExplodedPart(screenToExplodedPt(sPt), skin);
        if (hit) openPartEditor(hit);
        return;
      }
      if (mode !== 'part' || !Layers) return;
      canvas.setPointerCapture(e.pointerId);

      if (e.pointerType === 'touch') {
        activeTouches[e.pointerId] = sPt;
        const pair = getTouchPair();
        if (pair) {
          drawing = false;
          panning = false;
          pinchPrev = pair;
          requestRedraw();
          return;
        }
      }

      const wantsPan = panToolActive || spacePanHeld || e.button === 1 || e.button === 2;
      if (wantsPan) {
        panning = true;
        panPointerId = e.pointerId;
        panStart = { x: sPt.x, y: sPt.y, panX: viewPanX, panY: viewPanY };
        canvas.style.cursor = 'grabbing';
        requestRedraw();
        return;
      }

      if (e.button !== 0) return;

      const wPt = screenToWorldPt(sPt);
      const mapped = fromPartCanvas(selectedPartId, wPt);
      const targetTexKey = isDualPart(selectedPartId) ? mapped.space : getDefaultTexKeyForPart(selectedPartId);
      setActiveSubTexKey(selectedPartId, targetTexKey);

      // 1. If a floating selection/import transform is active on this part, test handles FIRST
      const ft = Layers.getFloatingTransform();
      if (ft && PART_BY_ID[selectedPartId].spaces.indexOf(ft.texKey) !== -1) {
        const effScale = Math.max(0.25, fitScale * viewZoom);
        const box = getFloatingWorldBox(ft, skin, selectedPartId);
        const hit = hitTestFloatingHandles(wPt, box, effScale);
        if (hit) {
          const ftPartC = Layers.texToPart(ft.texKey, ft.cx, ft.cy);
          const ftWorldC = partPtToWorldCanvas(selectedPartId, ft.texKey, ftPartC, skin);
          transformDrag = {
            mode: hit.mode,
            corner: hit.corner || null,
            startW: wPt,
            texKey: ft.texKey,
            origCx: ft.cx,
            origCy: ft.cy,
            origScaleX: ft.scaleX,
            origScaleY: ft.scaleY,
            origRot: ft.rot || 0,
            centerW: ftWorldC,
            startDist: Math.max(8, Math.hypot(wPt.x - ftWorldC.x, wPt.y - ftWorldC.y)),
            startAng: Math.atan2(wPt.y - ftWorldC.y, wPt.x - ftWorldC.x)
          };
          requestRedraw();
          return;
        } else {
          // Clicked outside active floating transform box -> auto-commit!
          Layers.commitFloatingTransform();
          notifyChange(true);
          updateSelectionBarUI();
          renderPartLayersDrawer();
          if (activeTool === 'selectRect' || activeTool === 'selectLasso') {
            // Fall through to start a new selection
          } else {
            return;
          }
        }
      }

      // 2. Selection tools (Rect / Lasso)
      if (activeTool === 'selectRect' || activeTool === 'selectLasso') {
        marqueeDraft = {
          kind: activeTool === 'selectRect' ? 'rect' : 'lasso',
          texKey: targetTexKey,
          startW: wPt,
          curW: wPt,
          ptsW: [wPt]
        };
        requestRedraw();
        return;
      }

      // 3. Eyedropper
      if (activeTool === 'eyedropper') {
        let picked = Layers.sampleCompositeHex(targetTexKey, mapped);
        if (!picked && ctx && viewW > 0 && viewH > 0) {
          const sx = canvas.width / viewW, sy = canvas.height / viewH;
          const d = ctx.getImageData(clamp(Math.round(sPt.x * sx), 0, canvas.width - 1), clamp(Math.round(sPt.y * sy), 0, canvas.height - 1), 1, 1).data;
          if (d[3] >= 16) picked = Spec.rgbToHex(d[0], d[1], d[2]);
        }
        if (picked) {
          setBrushColor(picked);
          const api = API();
          if (api) api.showToast('已吸取颜色 ' + picked);
        }
        setTool(prevDrawTool);
        return;
      }

      // 4. Pixel Flood-Fill Bucket
      if (activeTool === 'bucket') {
        const ok1 = Layers.floodFillBucket(targetTexKey, mapped, brushColor, brushAlpha, bucketTolerance);
        const mir = mirrorTargetFor(selectedPartId, targetTexKey, mapped);
        let ok2 = false;
        if (mir) ok2 = Layers.floodFillBucket(mir.texKey, mir.pt, brushColor, brushAlpha, bucketTolerance);
        if (ok1 || ok2) {
          notifyChange(true);
          renderPartLayersDrawer();
        } else {
          const api = API();
          if (api) api.showToast('油漆桶请点击贴图画布内区域（若开了“锁定透明”，透明区域不可填充）');
        }
        return;
      }

      // 5. Pixel Brush / Eraser / Smudge / Airbrush / Soft / Calligraphy / FillBrush
      activeDrawSpace = targetTexKey;
      const strokeOpts = {
        tool: activeTool,
        color: brushColor,
        size: brushPartSizeFor(selectedPartId),
        alpha: brushAlpha
      };
      activeStrokePrimary = Layers.beginBrushStroke(targetTexKey, mapped, strokeOpts);
      const mir = mirrorTargetFor(selectedPartId, targetTexKey, mapped);
      activeStrokeMirror = mir ? Layers.beginBrushStroke(mir.texKey, mir.pt, strokeOpts) : null;
      drawing = !!activeStrokePrimary;
      lastPaintSyncAt = performance.now();
      notifyChange(false, true);
    });

    canvas.addEventListener('pointermove', (e) => {
      const skin = getSkin();
      if (!skin) return;
      const sPt = getCanvasScreenPt(e);

      if (mode === 'exploded') {
        const hit = hitTestExplodedPart(screenToExplodedPt(sPt), skin);
        if (hit !== hoverPartId) {
          hoverPartId = hit;
          canvas.style.cursor = hit ? 'pointer' : 'default';
          requestRedraw();
        }
        return;
      }
      if (mode !== 'part' || !Layers) return;

      if (e.pointerType === 'touch' && activeTouches[e.pointerId]) {
        activeTouches[e.pointerId] = sPt;
        const pair = getTouchPair();
        if (pair && pinchPrev) {
          const factor = pair.dist / pinchPrev.dist;
          viewPanX += pair.cx - pinchPrev.cx;
          viewPanY += pair.cy - pinchPrev.cy;
          setPartViewport(viewZoom * factor, { x: pair.cx, y: pair.cy });
          pinchPrev = pair;
          return;
        }
      }

      if (panning && e.pointerId === panPointerId && panStart) {
        viewPanX = panStart.panX + (sPt.x - panStart.x);
        viewPanY = panStart.panY + (sPt.y - panStart.y);
        clampViewPan();
        updateZoomControlsUI();
        requestRedraw();
        return;
      }

      const wPt = screenToWorldPt(sPt);
      cursorCanvasPt = wPt;

      // Active floating transform drag
      if (transformDrag) {
        const td = transformDrag;
        if (td.mode === 'move') {
          const p0 = fromPartCanvas(selectedPartId, td.startW);
          const p1 = fromPartCanvas(selectedPartId, wPt);
          const t0 = Layers.partToTex(td.texKey, p0);
          const t1 = Layers.partToTex(td.texKey, p1);
          Layers.updateFloatingTransform({ cx: td.origCx + (t1.x - t0.x), cy: td.origCy + (t1.y - t0.y) });
        } else if (td.mode === 'scale') {
          const dist = Math.max(4, Math.hypot(wPt.x - td.centerW.x, wPt.y - td.centerW.y));
          const f = clamp(dist / td.startDist, 0.08, 6.0);
          Layers.updateFloatingTransform({ scaleX: td.origScaleX * f, scaleY: td.origScaleY * f });
        } else if (td.mode === 'rotate') {
          const ang = Math.atan2(wPt.y - td.centerW.y, wPt.x - td.centerW.x);
          Layers.updateFloatingTransform({ rot: td.origRot + (ang - td.startAng) });
        }
        notifyChange(false, true);
        return;
      }

      // Active marquee / lasso drag
      if (marqueeDraft) {
        marqueeDraft.curW = wPt;
        if (marqueeDraft.kind === 'lasso') {
          const last = marqueeDraft.ptsW[marqueeDraft.ptsW.length - 1];
          if (!last || Math.hypot(wPt.x - last.x, wPt.y - last.y) >= 3) marqueeDraft.ptsW.push(wPt);
        }
        requestRedraw();
        return;
      }

      if (!drawing) {
        const ft = Layers.getFloatingTransform();
        if (ft && PART_BY_ID[selectedPartId].spaces.indexOf(ft.texKey) !== -1 && !panToolActive && !spacePanHeld) {
          const box = getFloatingWorldBox(ft, skin, selectedPartId);
          const hit = hitTestFloatingHandles(wPt, box, Math.max(0.25, fitScale * viewZoom));
          if (hit) {
            canvas.style.cursor = hit.mode === 'move' ? 'move' : (hit.mode === 'rotate' ? 'grab' : 'nwse-resize');
          } else {
            canvas.style.cursor = cursorForActiveTool();
          }
        } else {
          canvas.style.cursor = cursorForActiveTool();
        }
        requestRedraw();
        return;
      }

      const mapped = fromPartCanvas(selectedPartId, wPt);
      if (activeStrokePrimary) {
        Layers.continueBrushStroke(activeStrokePrimary, mapped, e.pressure || 0.5);
      }
      if (activeStrokeMirror) {
        const mir = mirrorTargetFor(selectedPartId, activeDrawSpace, mapped);
        if (mir) Layers.continueBrushStroke(activeStrokeMirror, mir.pt, e.pressure || 0.5);
      }
      const now = performance.now();
      if (now - lastPaintSyncAt >= 28) {
        lastPaintSyncAt = now;
        notifyChange(false, true);
      } else {
        requestRedraw();
      }
    });

    const endPointer = (e) => {
      if (e && e.pointerType === 'touch') {
        delete activeTouches[e.pointerId];
        if (Object.keys(activeTouches).length < 2) pinchPrev = null;
      }
      if (panning && (!e || e.pointerId === panPointerId)) {
        panning = false;
        panPointerId = null;
        panStart = null;
        if (mode === 'part') canvas.style.cursor = cursorForActiveTool();
        requestRedraw();
        return;
      }
      if (transformDrag) {
        transformDrag = null;
        notifyChange(false, false);
        requestRedraw();
        return;
      }
      if (marqueeDraft) {
        const md = marqueeDraft;
        marqueeDraft = null;
        const polyW = md.kind === 'rect' ? worldPolyFromRect(md.startW, md.curW) : md.ptsW;
        if (polyW && polyW.length >= 3) {
          const polyPart = polyW.map((wp) => fromPartCanvas(selectedPartId, wp));
          const ft = Layers.createSelectionFromPartPolygon(md.texKey, polyPart);
          if (!ft) {
            const api = API();
            if (api) api.showToast('当前选区内在该透明纸层没有像素（可切到包含图案的图层后重试）');
          }
          updateSelectionBarUI();
          notifyChange(false, false);
        }
        requestRedraw();
        return;
      }
      if (!drawing) return;
      drawing = false;
      const pSess = activeStrokePrimary;
      const mSess = activeStrokeMirror;
      activeStrokePrimary = null;
      activeStrokeMirror = null;
      Layers.finishBrushStrokePair(pSess, mSess);
      notifyChange(false, false);
      renderPartLayersDrawer();
      requestRedraw();
    };

    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('pointerleave', () => {
      hoverPartId = null;
      cursorCanvasPt = null;
      requestRedraw();
    });
  }

  // -------------------------------------------------------------------------
  // Floating Live #cat-canvas Interactive Skeleton Handles ("调骨架")
  // -------------------------------------------------------------------------
  function toggleSkeletonMode(force) {
    skeletonMode = typeof force === 'boolean' ? force : !skeletonMode;
    activeSkeletonHandle = null;
    hoverSkeletonHandle = null;
    if (skeletonToggleBtn) skeletonToggleBtn.classList.toggle('active', skeletonMode);
    const api = API();
    if (api && skeletonMode) {
      api.showToast('已开启「调骨架」，直接拖动桌宠小猫身上的橙色圆点即可调整间距、根部和长短');
    }
  }

  function handleLiveCanvasPointerDown(canvasPt, transforms, animState) {
    if (!skeletonMode) return false;
    const skin = getSkin();
    const raw = getRaw();
    if (!skin || !raw) return false;
    const handles = Renderer.getSkeletonHandles(skin, transforms.seatX, transforms.seatY, transforms.headCenter, animState);
    let best = null, bestD = 16;
    for (let i = 0; i < handles.length; i++) {
      const d = Math.hypot(handles[i].x - canvasPt.x, handles[i].y - canvasPt.y);
      if (d < bestD) { bestD = d; best = handles[i]; }
    }
    if (!best) return false;
    activeSkeletonHandle = best.id;
    skeletonDragStart = { x: canvasPt.x, y: canvasPt.y, shape: Object.assign({}, skin.shape) };
    return true;
  }

  function handleLiveCanvasPointerMove(canvasPt, transforms, animState) {
    if (!skeletonMode) return false;
    const skin = getSkin();
    const raw = getRaw();
    if (!skin || !raw) return false;
    if (!activeSkeletonHandle || !skeletonDragStart) {
      const handles = Renderer.getSkeletonHandles(skin, transforms.seatX, transforms.seatY, transforms.headCenter, animState);
      let best = null, bestD = 16;
      for (let i = 0; i < handles.length; i++) {
        const d = Math.hypot(handles[i].x - canvasPt.x, handles[i].y - canvasPt.y);
        if (d < bestD) { bestD = d; best = handles[i]; }
      }
      hoverSkeletonHandle = best ? best.id : null;
      return !!best;
    }
    if (!raw.shape) raw.shape = { build: 'standard' };
    const dx = canvasPt.x - skeletonDragStart.x;
    const dy = canvasPt.y - skeletonDragStart.y;
    const orig = skeletonDragStart.shape;
    if (activeSkeletonHandle === 'armRootY') raw.shape.armRootY = round2(clamp((orig.armRootY || 0) + dy, -18, 18));
    else if (activeSkeletonHandle === 'armSpacingR') raw.shape.armSpacing = round2(clamp((orig.armSpacing || 1) + dx / 24, 0.55, 1.60));
    else if (activeSkeletonHandle === 'armSpacingL') raw.shape.armSpacing = round2(clamp((orig.armSpacing || 1) - dx / 24, 0.55, 1.60));
    else if (activeSkeletonHandle === 'armLength') raw.shape.armLength = round2(clamp((orig.armLength || 1) + dy / 42, 0.65, 1.45));
    else if (activeSkeletonHandle === 'earTip') {
      raw.shape.earSize = round2(clamp((orig.earSize || 1) - dy / 36, 0.80, 1.25));
      raw.shape.earSpacing = round2(clamp((orig.earSpacing || 1) + dx / 36, 0.65, 1.35));
    } else if (activeSkeletonHandle === 'bodyWidth') raw.shape.bodyWidth = round2(clamp((orig.bodyWidth || 1) + dx / 44, 0.85, 1.35));
    else if (activeSkeletonHandle === 'tailTip') {
      raw.shape.tailLength = round2(clamp((orig.tailLength || 1) + dx / 54, 0.70, 1.30));
      raw.shape.tailRootY = round2(clamp((orig.tailRootY || 0) + dy * 0.7, -14, 14));
    } else if (activeSkeletonHandle === 'hindLegRoot') {
      raw.shape.hindLegRootX = round2(clamp((orig.hindLegRootX || 0) + dx, -16, 16));
      raw.shape.hindLegRootY = round2(clamp((orig.hindLegRootY || 0) + dy, -14, 14));
    }
    notifyChange(false);
    if (mode === 'part') renderPartInspector();
    return true;
  }

  function handleLiveCanvasPointerUp() {
    if (!activeSkeletonHandle) return false;
    activeSkeletonHandle = null;
    skeletonDragStart = null;
    notifyChange(true);
    return true;
  }

  // -------------------------------------------------------------------------
  // Tool & Color Bar Bindings
  // -------------------------------------------------------------------------
  function setTool(tool) {
    activeTool = tool;
    if (tool !== 'eyedropper' && tool !== 'bucket' && tool !== 'selectRect' && tool !== 'selectLasso' && tool !== 'eraser') {
      prevDrawTool = tool;
    }
    if (panToolActive) setPanToolActive(false);
    if (bucketTolRow) bucketTolRow.hidden = tool !== 'bucket';

    if (brushDockEl) {
      const btns = brushDockEl.querySelectorAll('[data-brush-tool]');
      for (let i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].dataset.brushTool === tool);
      }
    }
    if (quickToolsEl) {
      const qBtns = quickToolsEl.querySelectorAll('[data-quick-tool]');
      const qKey =
        tool === 'selectRect' ? 'selectRect' :
        tool === 'selectLasso' ? 'selectLasso' :
        tool === 'eraser' ? 'eraser' :
        tool === 'bucket' ? 'bucket' :
        tool === 'eyedropper' ? 'eyedropper' : 'draw';
      for (let i = 0; i < qBtns.length; i++) {
        qBtns[i].classList.toggle('active', qBtns[i].dataset.quickTool === qKey);
      }
    }
    if (canvas && mode === 'part') canvas.style.cursor = cursorForActiveTool();
    requestRedraw();
  }

  function setBrushColor(hex) {
    if (!Spec.isValidHex(hex)) return;
    brushColor = hex.toUpperCase();
    if (colorInput) colorInput.value = brushColor.slice(0, 7);
    if (brushDotEl) brushDotEl.style.background = brushColor;
    if (swatchesWrap) {
      const dots = swatchesWrap.querySelectorAll('.exploded-swatch');
      for (let i = 0; i < dots.length; i++) {
        dots[i].classList.toggle('active', dots[i].dataset.color === brushColor);
      }
    }
  }

  function clearCurrentPart() {
    if (!Layers || mode !== 'part') return;
    const part = PART_BY_ID[selectedPartId];
    if (!part) return;
    const texKey = getDefaultTexKeyForPart(selectedPartId);
    Layers.clearPartAll(texKey);
    if (isDualPart(selectedPartId) && mirrorEnabled) {
      for (let i = 0; i < part.spaces.length; i++) {
        if (part.spaces[i] !== texKey) Layers.clearPartAll(part.spaces[i]);
      }
    } else if ((selectedPartId === 'leftArm' || selectedPartId === 'rightArm') && mirrorEnabled) {
      const other = selectedPartId === 'leftArm' ? 'rightArm' : 'leftArm';
      Layers.clearPartAll(other);
    }
    notifyChange(true);
    renderPartLayersDrawer();
    const api = API();
    if (api) api.showToast('已清空「' + part.label + '」透明纸像素');
  }

  function init() {
    canvas = document.getElementById('exploded-canvas');
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(CW * dpr);
    canvas.height = Math.round(CH * dpr);
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    workbenchEl = document.getElementById('workshop-view');
    heroOverlayEl = document.getElementById('hero-start-bar');
    leftPaneEl = document.getElementById('exploded-pane');
    partHeaderEl = document.getElementById('exploded-head');
    partBackBtn = document.getElementById('btn-exploded-back');
    partPillsWrap = document.getElementById('exploded-part-pills');
    mirrorToggleEl = document.getElementById('exploded-mirror-toggle');
    clearPartBtn = document.getElementById('btn-exploded-clear-part');
    importImgInput = document.getElementById('import-layer-img-input');
    brushDockEl = document.getElementById('exploded-brush-dock');
    inspectorEl = document.getElementById('exploded-part-inspector');
    layersPaneEl = document.getElementById('exploded-layers-pane');
    quickToolsEl = document.getElementById('ps-quick-tools');
    floatingCornerEl = document.getElementById('ps-floating-corner');
    cornerDrawerEl = document.getElementById('ps-corner-drawer');
    drawerTitleEl = document.getElementById('ps-drawer-title');
    brushDotEl = document.getElementById('ps-brush-dot');
    layerCountEl = document.getElementById('ps-layer-count');
    activeLayerPillEl = document.getElementById('ps-active-layer-pill');
    activeLayerNameEl = document.getElementById('ps-active-layer-name');
    selectionBarEl = document.getElementById('ps-selection-bar');
    selInfoEl = document.getElementById('ps-sel-info');
    selDebgBtn = document.getElementById('btn-sel-debg');
    skeletonToggleBtn = document.getElementById('btn-toggle-skeleton');

    if (activeLayerPillEl) {
      activeLayerPillEl.addEventListener('click', () => {
        setCornerTab(activeCornerTab === 'layers' ? null : 'layers');
      });
    }

    if (floatingCornerEl) {
      const cornerTabs = floatingCornerEl.querySelectorAll('[data-ps-tab]');
      for (let i = 0; i < cornerTabs.length; i++) {
        cornerTabs[i].addEventListener('click', function () {
          const tab = this.dataset.psTab;
          setCornerTab(activeCornerTab === tab ? null : tab);
        });
      }
      const closeCornerBtn = document.getElementById('btn-ps-drawer-close');
      if (closeCornerBtn) closeCornerBtn.addEventListener('click', () => setCornerTab(null));
    }

    if (quickToolsEl) {
      const qBtns = quickToolsEl.querySelectorAll('[data-quick-tool]');
      for (let i = 0; i < qBtns.length; i++) {
        qBtns[i].addEventListener('click', function () {
          const q = this.dataset.quickTool;
          if (q === 'draw') setTool(prevDrawTool || 'calligraphy');
          else setTool(q);
        });
      }
    }

    // Bind Selection / Import transform action bar
    const btnSelCommit = document.getElementById('btn-sel-commit');
    const btnSelDup = document.getElementById('btn-sel-dup');
    const btnSelDel = document.getElementById('btn-sel-del');
    const btnSelClear = document.getElementById('btn-sel-clear');
    if (btnSelCommit && Layers) {
      btnSelCommit.addEventListener('click', () => {
        Layers.commitFloatingTransform();
        notifyChange(true);
        updateSelectionBarUI();
        renderPartLayersDrawer();
      });
    }
    if (btnSelDup && Layers) {
      btnSelDup.addEventListener('click', () => {
        Layers.duplicateFloatingTransform();
        notifyChange(true);
        updateSelectionBarUI();
      });
    }
    if (selDebgBtn && Layers) {
      selDebgBtn.addEventListener('click', () => {
        if (Layers.removeFloatingWhiteBg()) {
          notifyChange(false);
          const api = API();
          if (api) api.showToast('已自动去除背景白底');
        }
      });
    }
    if (btnSelDel && Layers) {
      btnSelDel.addEventListener('click', () => {
        Layers.deleteFloatingTransform();
        notifyChange(true);
        updateSelectionBarUI();
        renderPartLayersDrawer();
      });
    }
    if (btnSelClear && Layers) {
      btnSelClear.addEventListener('click', () => {
        Layers.cancelFloatingTransform();
        notifyChange(false);
        updateSelectionBarUI();
        renderPartLayersDrawer();
      });
    }

    // Bind Import Image As Layer
    if (importImgInput && Layers) {
      importImgInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            if (mode !== 'part') openPartEditor(selectedPartId || 'head');
            const texKey = getDefaultTexKeyForPart(selectedPartId);
            Layers.importImageAsLayer(texKey, img, file.name.replace(/\.[^.]+$/, ''));
            setCornerTab('layers');
            notifyChange(false);
            updateSelectionBarUI();
            renderPartLayersDrawer();
            const api = API();
            if (api) api.showToast('已导入图片图层：拖动移位、四角缩放、顶部旋转，确定后点「✓ 落位」');
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
      });
    }

    sizeInput = document.getElementById('exploded-brush-size');
    sizeValEl = document.getElementById('exploded-brush-size-val');
    alphaInput = document.getElementById('exploded-brush-alpha');
    alphaValEl = document.getElementById('exploded-brush-alpha-val');
    bucketTolRow = document.getElementById('exploded-bucket-tol-row');
    bucketTolInput = document.getElementById('exploded-bucket-tol');
    bucketTolValEl = document.getElementById('exploded-bucket-tol-val');
    colorInput = document.getElementById('exploded-brush-color');
    swatchesWrap = document.getElementById('exploded-swatches');
    zoomBarEl = document.getElementById('exploded-zoom-bar');
    zoomOutBtn = document.getElementById('btn-part-zoom-out');
    zoomInBtn = document.getElementById('btn-part-zoom-in');
    zoomResetBtn = document.getElementById('btn-part-zoom-reset');
    panToggleBtn = document.getElementById('btn-part-pan-toggle');

    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => setPartViewport(viewZoom / 1.25));
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => setPartViewport(viewZoom * 1.25));
    if (zoomResetBtn) zoomResetBtn.addEventListener('click', resetPartViewport);
    if (panToggleBtn) panToggleBtn.addEventListener('click', () => setPanToolActive(!panToolActive));

    const isTypingTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
      if (tag === 'INPUT' && el.type !== 'color' && el.type !== 'range' && el.type !== 'checkbox' && el.type !== 'button') return true;
      return false;
    };

    const syncBrushSize = (val, updateInputText) => {
      const clamped = round2(clamp(val, 0.2, 24));
      brushSize = clamped;
      if (sizeInput) sizeInput.value = String(clamped);
      if (sizeValEl && updateInputText !== false) sizeValEl.value = clamped.toFixed(1);
      requestRedraw();
    };

    document.addEventListener('keydown', (e) => {
      if (mode !== 'part' || isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === 'Space' && !mod && !e.altKey) {
        if (!spacePanHeld) {
          spacePanHeld = true;
          if (canvas) canvas.style.cursor = 'grab';
          requestRedraw();
        }
        e.preventDefault();
      } else if ((e.key === '+' || e.key === '=') && !mod) {
        e.preventDefault();
        setPartViewport(viewZoom * 1.25);
      } else if (e.key === '-' && !mod) {
        e.preventDefault();
        setPartViewport(viewZoom / 1.25);
      } else if (e.key === '0' && !mod) {
        e.preventDefault();
        resetPartViewport();
      } else if (e.key === '[') {
        syncBrushSize(brushSize - (brushSize > 4 ? 1 : 0.4), true);
      } else if (e.key === ']') {
        syncBrushSize(brushSize + (brushSize >= 4 ? 1 : 0.4), true);
      } else if ((e.key === 'm' || e.key === 'M') && !mod && !e.altKey) {
        setTool('selectRect');
      } else if ((e.key === 'l' || e.key === 'L') && !mod && !e.altKey) {
        setTool('selectLasso');
      } else if ((e.key === 'b' || e.key === 'B') && !mod && !e.altKey) {
        setTool(prevDrawTool || 'calligraphy');
      } else if ((e.key === 'e' || e.key === 'E') && !mod && !e.altKey) {
        setTool('eraser');
      } else if ((e.key === 'g' || e.key === 'G') && !mod && !e.altKey) {
        setTool('bucket');
      } else if ((e.key === 'i' || e.key === 'I') && !mod && !e.altKey) {
        setTool('eyedropper');
      } else if ((e.key === 'd' || e.key === 'D') && mod && Layers && Layers.getFloatingTransform()) {
        e.preventDefault();
        Layers.duplicateFloatingTransform();
        notifyChange(true);
      } else if (e.key === 'Enter' && Layers && Layers.getFloatingTransform()) {
        e.preventDefault();
        Layers.commitFloatingTransform();
        notifyChange(true);
        updateSelectionBarUI();
        renderPartLayersDrawer();
      } else if (e.key === 'Escape') {
        if (Layers && Layers.getFloatingTransform()) {
          Layers.cancelFloatingTransform();
          notifyChange(false);
          updateSelectionBarUI();
          renderPartLayersDrawer();
          e.preventDefault();
        } else if (activeCornerTab) {
          setCornerTab(null);
          e.preventDefault();
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && Layers && Layers.getFloatingTransform()) {
        e.preventDefault();
        Layers.deleteFloatingTransform();
        notifyChange(true);
        updateSelectionBarUI();
        renderPartLayersDrawer();
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && spacePanHeld) {
        spacePanHeld = false;
        if (canvas && mode === 'part' && !panning) canvas.style.cursor = cursorForActiveTool();
        requestRedraw();
      }
    });
    window.addEventListener('blur', () => {
      if (spacePanHeld) { spacePanHeld = false; requestRedraw(); }
    });

    const decoStrip = document.getElementById('deco-gallery');
    const decoLeftBtn = document.getElementById('btn-deco-scroll-left');
    const decoRightBtn = document.getElementById('btn-deco-scroll-right');
    if (decoStrip) {
      decoStrip.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          decoStrip.scrollLeft += e.deltaY;
        }
      }, { passive: false });
    }
    if (decoLeftBtn && decoStrip) decoLeftBtn.addEventListener('click', () => { decoStrip.scrollLeft -= 250; });
    if (decoRightBtn && decoStrip) decoRightBtn.addEventListener('click', () => { decoStrip.scrollLeft += 250; });

    window.addEventListener('resize', scheduleFitCanvases);
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(scheduleFitCanvases);
      const expWrap = document.getElementById('exploded-canvas-wrap');
      if (expWrap) ro.observe(expWrap);
    }

    const btnStartEdit = document.getElementById('btn-hero-start');
    if (btnStartEdit) btnStartEdit.addEventListener('click', () => enterExplodedMode(true));

    const btnStartBlank = document.getElementById('btn-hero-blank');
    if (btnStartBlank) {
      btnStartBlank.addEventListener('click', () => {
        const api = API();
        if (api && Spec.BLANK_WHITE_SKIN) api.loadExternalSkin(Spec.BLANK_WHITE_SKIN, '纯白素胚');
        enterExplodedMode(true);
      });
    }

    const btnStartPhoto = document.getElementById('btn-hero-photo');
    if (btnStartPhoto) {
      btnStartPhoto.addEventListener('click', () => {
        enterExplodedMode(false);
        openDrawer('more', 'photo');
      });
    }

    const btnStartTemplate = document.getElementById('btn-hero-templates');
    if (btnStartTemplate) {
      btnStartTemplate.addEventListener('click', () => {
        enterExplodedMode(false);
        openDrawer('more', 'templates');
      });
    }

    if (partBackBtn) partBackBtn.addEventListener('click', backToExploded);
    if (partPillsWrap) {
      partPillsWrap.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-exploded-part]');
        if (!btn) return;
        openPartEditor(btn.dataset.explodedPart);
      });
    }

    if (mirrorToggleEl) {
      mirrorToggleEl.addEventListener('change', () => {
        mirrorEnabled = mirrorToggleEl.checked;
        requestRedraw();
      });
    }
    if (clearPartBtn) clearPartBtn.addEventListener('click', clearCurrentPart);
    if (skeletonToggleBtn) skeletonToggleBtn.addEventListener('click', () => toggleSkeletonMode());

    if (brushDockEl) {
      brushDockEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-brush-tool]');
        if (!btn) return;
        setTool(btn.dataset.brushTool);
      });
    }

    const setDecoDockCollapsed = (collapsed) => {
      const dockCard = document.getElementById('deco-dock-card');
      const dockBtn = document.getElementById('btn-deco-dock-toggle');
      if (!dockCard) return;
      dockCard.classList.toggle('collapsed', !!collapsed);
      if (dockBtn) {
        dockBtn.textContent = collapsed ? '展开配饰' : '收起';
        dockBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      }
      scheduleFitCanvases();
    };
    window.__kuroSetDecoDockCollapsed = setDecoDockCollapsed;

    const btnDecoDockToggle = document.getElementById('btn-deco-dock-toggle');
    if (btnDecoDockToggle) {
      btnDecoDockToggle.addEventListener('click', () => {
        const dockCard = document.getElementById('deco-dock-card');
        setDecoDockCollapsed(!(dockCard && dockCard.classList.contains('collapsed')));
      });
    }

    if (sizeInput) sizeInput.addEventListener('input', () => syncBrushSize(parseFloat(sizeInput.value), true));
    if (sizeValEl) {
      sizeValEl.addEventListener('input', () => {
        const v = parseFloat(sizeValEl.value);
        if (isFinite(v) && v >= 0.2 && v <= 24) syncBrushSize(v, false);
      });
      sizeValEl.addEventListener('change', () => {
        const v = parseFloat(sizeValEl.value);
        syncBrushSize(isFinite(v) ? v : brushSize, true);
      });
      sizeValEl.addEventListener('blur', () => {
        const v = parseFloat(sizeValEl.value);
        syncBrushSize(isFinite(v) ? v : brushSize, true);
      });
    }

    const syncBrushAlpha = (val, updateInputText) => {
      const clamped = round2(clamp(val, 0.05, 1));
      brushAlpha = clamped;
      if (alphaInput) alphaInput.value = String(clamped);
      if (alphaValEl && updateInputText !== false) alphaValEl.value = String(Math.round(clamped * 100));
    };
    if (alphaInput) alphaInput.addEventListener('input', () => syncBrushAlpha(parseFloat(alphaInput.value), true));
    if (alphaValEl) {
      alphaValEl.addEventListener('input', () => {
        const pct = parseFloat(alphaValEl.value);
        if (isFinite(pct) && pct >= 5 && pct <= 100) syncBrushAlpha(pct / 100, false);
      });
      alphaValEl.addEventListener('change', () => {
        const pct = parseFloat(alphaValEl.value);
        syncBrushAlpha(isFinite(pct) ? pct / 100 : brushAlpha, true);
      });
      alphaValEl.addEventListener('blur', () => {
        const pct = parseFloat(alphaValEl.value);
        syncBrushAlpha(isFinite(pct) ? pct / 100 : brushAlpha, true);
      });
    }

    const syncBucketTol = (val, updateInputText) => {
      const clamped = Math.round(clamp(val, 0, 140));
      bucketTolerance = clamped;
      if (bucketTolInput) bucketTolInput.value = String(clamped);
      if (bucketTolValEl && updateInputText !== false) bucketTolValEl.value = String(clamped);
    };
    if (bucketTolInput) bucketTolInput.addEventListener('input', () => syncBucketTol(parseFloat(bucketTolInput.value), true));
    if (bucketTolValEl) {
      bucketTolValEl.addEventListener('input', () => {
        const v = parseFloat(bucketTolValEl.value);
        if (isFinite(v) && v >= 0 && v <= 140) syncBucketTol(v, false);
      });
      bucketTolValEl.addEventListener('change', () => {
        const v = parseFloat(bucketTolValEl.value);
        syncBucketTol(isFinite(v) ? v : bucketTolerance, true);
      });
    }

    if (colorInput) colorInput.addEventListener('input', () => setBrushColor(colorInput.value));

    if (swatchesWrap) {
      swatchesWrap.innerHTML = '';
      for (let i = 0; i < SWATCH_COLORS.length; i++) {
        const hex = SWATCH_COLORS[i];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'exploded-swatch' + (hex === brushColor ? ' active' : '');
        b.dataset.color = hex;
        b.style.background = hex;
        b.title = hex;
        b.addEventListener('click', () => setBrushColor(hex));
        swatchesWrap.appendChild(b);
      }
    }

    if (Layers && typeof Layers.onChange === 'function') {
      Layers.onChange((kind) => {
        if (mode === 'part') {
          if (kind === 'reset' || kind === 'undo' || kind === 'redo' || kind === 'layers' || kind === 'layer-select' || kind === 'options' || kind === 'selection') {
            renderPartLayersDrawer();
            updateSelectionBarUI();
          }
          requestRedraw();
        } else if (mode === 'exploded') {
          requestRedraw();
        }
      });
    }

    bindDrawerControls();
    bindCanvasEvents();
    setTool('calligraphy');
  }

  // -------------------------------------------------------------------------
  // Progressive Disclosure Drawers & "?" Help Popover
  // -------------------------------------------------------------------------
  let openDrawerName = null;

  function openDrawer(name, subTab) {
    const backdrop = document.getElementById('studio-drawer-backdrop');
    const decoDrawer = document.getElementById('drawer-accessories');
    const moreDrawer = document.getElementById('drawer-more');
    const helpPopover = document.getElementById('help-popover');
    if (helpPopover) helpPopover.hidden = true;

    openDrawerName = name;
    if (backdrop) backdrop.hidden = !name;
    if (decoDrawer) decoDrawer.hidden = name !== 'accessories';
    if (moreDrawer) moreDrawer.hidden = name !== 'more';

    if (name === 'more' && subTab) {
      const api = API();
      if (api && typeof api.switchTab === 'function') api.switchTab(subTab);
    }
  }

  function closeDrawers() {
    openDrawer(null);
  }

  function bindDrawerControls() {
    const btnDeco = document.getElementById('btn-open-deco-drawer');
    const btnMore = document.getElementById('btn-open-more-drawer');
    const btnHelp = document.getElementById('btn-open-help');
    const helpPop = document.getElementById('help-popover');
    const backdrop = document.getElementById('studio-drawer-backdrop');
    const closeBtns = document.querySelectorAll('[data-close-drawer]');

    if (btnDeco) btnDeco.addEventListener('click', () => openDrawer(openDrawerName === 'accessories' ? null : 'accessories'));
    if (btnMore) btnMore.addEventListener('click', () => openDrawer(openDrawerName === 'more' ? null : 'more', 'photo'));
    if (backdrop) backdrop.addEventListener('click', closeDrawers);
    for (let i = 0; i < closeBtns.length; i++) closeBtns[i].addEventListener('click', closeDrawers);

    if (btnHelp && helpPop) {
      btnHelp.addEventListener('click', (e) => {
        e.stopPropagation();
        helpPop.hidden = !helpPop.hidden;
      });
      document.addEventListener('click', (e) => {
        if (!helpPop.hidden && !helpPop.contains(e.target) && e.target !== btnHelp) helpPop.hidden = true;
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (openDrawerName) closeDrawers();
        if (helpPop) helpPop.hidden = true;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.KuroExplodedStudio = {
    getMode: () => mode,
    getPartViewport: () => ({ zoom: viewZoom, panX: viewPanX, panY: viewPanY, panTool: panToolActive }),
    setPartViewport,
    resetPartViewport,
    enterExplodedMode,
    openPartEditor,
    backToExploded,
    openDrawer,
    closeDrawers,
    toggleSkeletonMode,
    isSkeletonMode: () => skeletonMode,
    getSkeletonOverlayState: () => skeletonMode ? { activeId: activeSkeletonHandle, hoverId: hoverSkeletonHandle } : null,
    handleLiveCanvasPointerDown,
    handleLiveCanvasPointerMove,
    handleLiveCanvasPointerUp,
    onSkinSynced: (syncOpts) => {
      if (syncOpts && syncOpts.fastPaint) {
        requestRedraw();
        return;
      }
      if (mode === 'part') {
        renderPartInspector();
        renderPartLayersDrawer();
      }
      requestRedraw();
    }
  };
})(window);
