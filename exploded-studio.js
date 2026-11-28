/* KuroCat Exploded-View Component Studio & WYSIWYG Multi-Brush Engine */
(function (global) {
  'use strict';

  const Spec = global.KuroSpec;
  const Renderer = global.KuroRenderer;
  const clamp = Spec.clamp;
  const round2 = Spec.round2;

  const SWATCH_COLORS = [
    '#1A1A1E', '#3B3430', '#6E6660', '#B5AEA6', '#F4EFE6', '#FFFFFF',
    '#E89B4C', '#C96A28', '#8C5222', '#F4A9B8', '#E56B6F', '#E9C44A',
    '#7BC47F', '#6CB4EE'
  ];

  // 7 intuitive physical components (including the 3-key kicking hindLeg, hiding internal `skull` jargon)
  const PARTS = [
    { id: 'ears', label: '耳朵', spaces: ['leftEar', 'rightEar'], canMirror: true, defaultMirror: true, explodeDx: 0, explodeDy: -84 },
    { id: 'head', label: '头部', spaces: ['head', 'skull'], canMirror: true, defaultMirror: true, explodeDx: 0, explodeDy: -36 },
    { id: 'body', label: '身体', spaces: ['body'], canMirror: true, defaultMirror: true, explodeDx: 0, explodeDy: 46 },
    { id: 'leftArm', label: '左手臂', spaces: ['leftArm'], canMirror: true, defaultMirror: true, explodeDx: -146, explodeDy: -6 },
    { id: 'rightArm', label: '右手臂', spaces: ['rightArm'], canMirror: true, defaultMirror: true, explodeDx: 146, explodeDy: -6 },
    { id: 'hindLeg', label: '后腿', spaces: ['hindLeg'], canMirror: false, defaultMirror: false, explodeDx: -124, explodeDy: 106 },
    { id: 'tail', label: '尾巴', spaces: ['tail'], canMirror: false, defaultMirror: false, explodeDx: 112, explodeDy: 106 }
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
  let activeTool = 'calligraphy'; // 'select' | 'pen' | 'calligraphy' | 'soft' | 'airbrush' | 'smudge' | 'fillBrush' | 'bucket' | 'eraser' | 'eyedropper'
  let prevDrawTool = 'calligraphy';
  let brushColor = '#1A1A1E';
  let brushSize = 4.2;
  let brushAlpha = 1.0;
  let mirrorEnabled = true;

  // Active stroke state
  let drawing = false;
  let activeDrawSpace = 'head';
  let draftPts = [];       // [{ x, y, p, t }] in part space
  let smudgeColor = null;
  let erasedDuringDrag = false;
  let cursorCanvasPt = null;

  // PS-style selection & transform state
  let selectedItems = []; // [{ type: 'mark' | 'region', index, mirrorIndex }]
  let selDrag = null;     // { mode: 'marquee' | 'move' | 'scale', startW, curW, handle, centerW, startDist, snapshots, moved }

  // Top-right PS floating corner state
  let activeCornerTab = null; // null | 'brush' | 'body' | 'layers'

  // Skeleton drag state on right-side live #cat-canvas
  let skeletonMode = false;
  let activeSkeletonHandle = null;
  let hoverSkeletonHandle = null;
  let skeletonDragStart = null;
  let autoHindPoseActive = false;
  let mountedInspectorKey = '';

  // Part paint viewport zoom & pan state (0.6x ~ 4.0x, crisp vector redraw)
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
  let skeletonToggleBtn = null;
  let sizeInput = null;
  let sizeValEl = null;
  let alphaInput = null;
  let alphaValEl = null;
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

  function notifyChange(commitNow) {
    const api = API();
    if (!api) return;
    api.syncSkin(true);
    if (commitNow && typeof api.commitHistoryNow === 'function') {
      api.commitHistoryNow();
    }
    requestRedraw();
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
  // Part Coordinate Systems for Zoomed Painting View (CW x CH)
  // -------------------------------------------------------------------------
  // The tail's real half width in tail space is 5.5 (it scales with shape.tailThickness, so 5.5 always reaches the
  // edge); the board draws exactly that band, so nothing painted outside it looks like part of the tail.
  const TAIL_EDGE_Y = 5.5;
  const TAIL_BOARD_Y = 13;
  const PART_VIEW = {
    head: {
      scale: 3.75,
      toCanvas: (p) => ({ x: CW * 0.5 + p.x * 3.75, y: CH * 0.52 + p.y * 3.75 }),
      fromCanvas: (c) => ({ x: (c.x - CW * 0.5) / 3.75, y: (c.y - CH * 0.52) / 3.75 })
    },
    ears: {
      scale: 2.1,
      // Split canvas into left ear (center x = CW*0.29) and right ear (center x = CW*0.71)
      toCanvasFor: (p, space) => {
        const cx = space === 'leftEar' ? CW * 0.29 : CW * 0.71;
        return { x: cx + p.x * 2.0, y: CH * 0.80 + p.y * 2.1 };
      },
      fromCanvasAuto: (c) => {
        const space = c.x < CW * 0.5 ? 'leftEar' : 'rightEar';
        const cx = space === 'leftEar' ? CW * 0.29 : CW * 0.71;
        return { space: space, x: (c.x - cx) / 2.0, y: (c.y - CH * 0.80) / 2.1 };
      }
    },
    body: {
      scale: 3.05,
      toCanvas: (p) => ({ x: CW * 0.5 + p.x * 3.05, y: CH * 0.86 + p.y * 3.05 }),
      fromCanvas: (c) => ({ x: (c.x - CW * 0.5) / 3.05, y: (c.y - CH * 0.86) / 3.05 })
    },
    leftArm: {
      scale: 4.1,
      // part.x (0..100 shoulder->paw) maps top->bottom; part.y (-10..10) maps right->left for leftArm
      toCanvas: (p) => ({ x: CW * 0.5 - p.y * 7.2, y: 48 + (p.x / 100) * (CH - 118) }),
      fromCanvas: (c) => ({ x: ((c.y - 48) / (CH - 118)) * 100, y: (CW * 0.5 - c.x) / 7.2 })
    },
    rightArm: {
      scale: 4.1,
      toCanvas: (p) => ({ x: CW * 0.5 + p.y * 7.2, y: 48 + (p.x / 100) * (CH - 118) }),
      fromCanvas: (c) => ({ x: ((c.y - 48) / (CH - 118)) * 100, y: (c.x - CW * 0.5) / 7.2 })
    },
    hindLeg: {
      scale: 4.1,
      // part.x (0..100 hip->hindPaw) maps top->bottom; part.y (-10..10) maps left->right
      toCanvas: (p) => ({ x: CW * 0.5 + p.y * 6.8, y: 48 + (p.x / 100) * (CH - 118) }),
      fromCanvas: (c) => ({ x: ((c.y - 48) / (CH - 118)) * 100, y: (c.x - CW * 0.5) / 6.8 })
    },
    tail: {
      scale: 4.2,
      // part.x (0..100 root->tip) maps left->right; part.y (-10..10) maps vertical offset
      toCanvas: (p) => ({ x: 64 + (p.x / 100) * (CW - 128), y: CH * 0.5 + p.y * TAIL_BOARD_Y }),
      fromCanvas: (c) => ({ x: ((c.x - 64) / (CW - 128)) * 100, y: (c.y - CH * 0.5) / TAIL_BOARD_Y })
    }
  };

  function toPartCanvas(partId, pt, spaceOverride) {
    if (partId === 'ears') {
      return PART_VIEW.ears.toCanvasFor(pt, spaceOverride || 'leftEar');
    }
    return PART_VIEW[partId].toCanvas(pt);
  }

  function fromPartCanvas(partId, cPt) {
    if (partId === 'ears') {
      return PART_VIEW.ears.fromCanvasAuto(cPt);
    }
    const p = PART_VIEW[partId].fromCanvas(cPt);
    if (partId === 'body') {
      const skin = getSkin();
      const bw = (skin && skin.shape && skin.shape.bodyWidth) || 1;
      return { space: 'body', x: p.x / bw, y: p.y };
    }
    return { space: partId === 'head' ? 'head' : partId, x: p.x, y: p.y };
  }

  // -------------------------------------------------------------------------
  // Drawing Helpers: Regions & Marks in a Part's Coordinate System
  // -------------------------------------------------------------------------
  function drawRegionMapped(ctxRef, region, mapFn) {
    const flat = region.flat;
    if (!flat || flat.length < 3) return;
    ctxRef.save();
    ctxRef.beginPath();
    for (let i = 0; i < flat.length; i++) {
      const q = mapFn(flat[i]);
      if (i === 0) ctxRef.moveTo(q.x, q.y);
      else ctxRef.lineTo(q.x, q.y);
    }
    ctxRef.closePath();
    ctxRef.fillStyle = rgbaCss(region.fill);
    ctxRef.fill();
    ctxRef.restore();
  }

  function drawMarkMapped(ctxRef, mark, mapFn, widthScale) {
    const scaled = mark.stroke
      ? Object.assign({}, mark, { width: Math.max(0.25, (mark.width || 2) * widthScale) })
      : mark;
    Renderer.drawMark(ctxRef, scaled, 'round', mapFn);
  }

  function drawSpaceArt(ctxRef, skin, spaces, mapFn, widthScale) {
    for (let i = 0; i < skin.regions.length; i++) {
      const r = skin.regions[i];
      if (spaces.indexOf(r.space) !== -1) drawRegionMapped(ctxRef, r, mapFn);
    }
    for (let i = 0; i < skin.marks.length; i++) {
      const m = skin.marks[i];
      if (spaces.indexOf(m.space) !== -1) drawMarkMapped(ctxRef, m, mapFn, widthScale);
    }
  }

  // -------------------------------------------------------------------------
  // Exploded View: Draw & Hit-Test the 6 Floating Components
  // -------------------------------------------------------------------------
  function getExplodedMetrics(skin, t) {
    const s = skin.shape;
    const cx = CW * 0.5;
    const cy = CH * 0.52;
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

    // Assembled base positions (balanced inside 600x460 canvas with crisp separation when exploded)
    const S = 1.85;
    const bodyBaseX = cx;
    const bodyBaseY = cy + 62;
    const headBaseX = cx;
    const headBaseY = cy - 48;
    const earsBaseX = cx;
    const earsBaseY = headBaseY - 38 * hs;
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
        attachX: earsBaseX, attachY: earsBaseY + 12,
        hit: { rx: 86 * esp * hs, ry: 44 * es * hs }
      },
      head: {
        x: headBaseX + PART_BY_ID.head.explodeDx * t,
        y: headBaseY + PART_BY_ID.head.explodeDy * t,
        attachX: headBaseX, attachY: headBaseY + 34,
        hit: { rx: 82 * hs * cf, ry: 72 * hs }
      },
      body: {
        x: bodyBaseX + PART_BY_ID.body.explodeDx * t,
        y: bodyBaseY + PART_BY_ID.body.explodeDy * t,
        attachX: bodyBaseX, attachY: bodyBaseY - 40,
        hit: { rx: 94 * bw, ry: 82 }
      },
      leftArm: {
        x: (bodyBaseX - armSpreadX) + PART_BY_ID.leftArm.explodeDx * t,
        y: armTopY + PART_BY_ID.leftArm.explodeDy * t,
        h: armSpanH,
        attachX: bodyBaseX - armSpreadX, attachY: armTopY,
        hit: { rx: 32, ry: armSpanH * 0.58 + 18 }
      },
      rightArm: {
        x: (bodyBaseX + armSpreadX) + PART_BY_ID.rightArm.explodeDx * t,
        y: armTopY + PART_BY_ID.rightArm.explodeDy * t,
        h: armSpanH,
        attachX: bodyBaseX + armSpreadX, attachY: armTopY,
        hit: { rx: 32, ry: armSpanH * 0.58 + 18 }
      },
      hindLeg: {
        x: (bodyBaseX - 50 * bw) + PART_BY_ID.hindLeg.explodeDx * t,
        y: (bodyBaseY - 12) + PART_BY_ID.hindLeg.explodeDy * t,
        attachX: bodyBaseX - 50 * bw, attachY: bodyBaseY - 6,
        w: 66 * (s.hindLegReach || 1),
        thick: 24 * (s.hindLegWidth || 1),
        hit: { rx: 52, ry: 30 }
      },
      tail: {
        x: tailRootX + PART_BY_ID.tail.explodeDx * t,
        y: tailRootY + PART_BY_ID.tail.explodeDy * t,
        attachX: tailRootX - 10, attachY: tailRootY,
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

    // Subtle architectural tether lines when exploded
    if (t > 0.08) {
      ctx.save();
      ctx.globalAlpha = clamp((t - 0.08) * 0.75, 0, 0.6);
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(160, 134, 112, 0.55)';
      ctx.lineWidth = 1.25;
      const links = [
        [m.ears.x, m.ears.y + 8, m.head.x, m.head.y - 44 * m.hs],
        [m.head.x, m.head.y + 52 * m.hs, m.body.x, m.body.y - 74],
        [m.leftArm.x + 12, m.leftArm.y + 10, m.body.x - 42 * m.bw, m.body.y - 46],
        [m.rightArm.x - 12, m.rightArm.y + 10, m.body.x + 42 * m.bw, m.body.y - 46],
        [m.hindLeg.x + 24, m.hindLeg.y - 6, m.body.x - 52 * m.bw, m.body.y - 4],
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

    // Helper for part scale boost on hover
    const hScale = (id) => (hoverPartId === id ? 1.055 : 1.0);

    // 1. Tail (back layer)
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
      const mapTail = (pt) => {
        const u = clamp(pt.x / 100, 0, 1);
        const p = sampleTail(u);
        const tan = sampleTan(u);
        const len = Math.max(0.001, Math.hypot(tan.x, tan.y));
        const nx = -tan.y / len, ny = tan.x / len;
        return { x: p.x + nx * (pt.y / 10) * (thick * 0.5), y: p.y + ny * (pt.y / 10) * (thick * 0.5) };
      };

      // Soft floating drop shadow (no thick white border)
      ctx.save();
      drawFloatingShadow(ctx, isHov);
      const leftPts = [], rightPts = [];
      const half = thick * 0.5;
      for (let i = 0; i <= 20; i++) {
        const u = i / 20;
        leftPts.push(mapTail({ x: u * 100, y: 10 }));
        rightPts.push(mapTail({ x: u * 100, y: -10 }));
      }
      ctx.beginPath();
      ctx.moveTo(leftPts[0].x, leftPts[0].y);
      for (let i = 1; i < leftPts.length; i++) ctx.lineTo(leftPts[i].x, leftPts[i].y);
      const tipAng = Math.atan2(tip.y - c2.y, tip.x - c2.x);
      ctx.arc(tip.x, tip.y, half, tipAng + Math.PI * 0.5, tipAng - Math.PI * 0.5, true);
      for (let i = rightPts.length - 1; i >= 0; i--) ctx.lineTo(rightPts[i].x, rightPts[i].y);
      const rootAng = Math.atan2(c1.y - r0.y, c1.x - r0.x);
      ctx.arc(r0.x, r0.y, half, rootAng - Math.PI * 0.5, rootAng + Math.PI * 0.5, true);
      ctx.closePath();
      ctx.fillStyle = partFillStyle(ctx, skin, 'tail', r0.x, r0.y, tip.x, tip.y, pal.tail);
      ctx.fill();
      ctx.restore();

      // Tail clipped art + clean hairline
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(leftPts[0].x, leftPts[0].y);
      for (let i = 1; i < leftPts.length; i++) ctx.lineTo(leftPts[i].x, leftPts[i].y);
      ctx.arc(tip.x, tip.y, half, tipAng + Math.PI * 0.5, tipAng - Math.PI * 0.5, true);
      for (let i = rightPts.length - 1; i >= 0; i--) ctx.lineTo(rightPts[i].x, rightPts[i].y);
      ctx.arc(r0.x, r0.y, half, rootAng - Math.PI * 0.5, rootAng + Math.PI * 0.5, true);
      ctx.closePath();
      ctx.clip();
      if (pal.tailTip) {
        ctx.strokeStyle = rgbaCss(pal.tailTip);
        ctx.lineWidth = thick + 4;
        ctx.lineCap = 'round';
        const pMid = sampleTail(0.76);
        ctx.beginPath();
        ctx.moveTo(pMid.x, pMid.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
      }
      drawSpaceArt(ctx, skin, ['tail'], mapTail, 1.8);
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(leftPts[0].x, leftPts[0].y);
      for (let i = 1; i < leftPts.length; i++) ctx.lineTo(leftPts[i].x, leftPts[i].y);
      ctx.arc(tip.x, tip.y, half, tipAng + Math.PI * 0.5, tipAng - Math.PI * 0.5, true);
      for (let i = rightPts.length - 1; i >= 0; i--) ctx.lineTo(rightPts[i].x, rightPts[i].y);
      ctx.arc(r0.x, r0.y, half, rootAng - Math.PI * 0.5, rootAng + Math.PI * 0.5, true);
      ctx.closePath();
      ctx.strokeStyle = isHov ? '#D97736' : 'rgba(92, 76, 64, 0.16)';
      ctx.lineWidth = isHov ? 2.2 : 1.2;
      ctx.stroke();
      ctx.restore();
      drawPartLabel(ctx, m.tail.x + 12, m.tail.y + 32, '尾巴', isHov);
    })();

    // 1b. Hind Leg (3-key kicking leg, lower-left balanced opposite tail)
    (function drawExplodedHindLeg() {
      const isHov = hoverPartId === 'hindLeg';
      const sc = hScale('hindLeg');
      const hl = m.hindLeg;
      const len = hl.w;
      const r = hl.thick * 0.5;
      const hlBase = pal.hindLeg || pal.legs;
      const hlPaw = pal.hindPaw || pal.paws;

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

      ctx.save();
      traceHL();
      ctx.clip();
      const mapHL = (pt) => {
        const u = clamp(pt.x / 100, 0, 1);
        return { x: len * 0.45 - u * len * 0.9, y: (pt.y / 10) * r };
      };
      drawSpaceArt(ctx, skin, ['hindLeg'], mapHL, 1.5);
      // Hind paw cap at outer (left) end
      ctx.fillStyle = rgbaCss(hlPaw);
      ctx.beginPath();
      ctx.ellipse(-len * 0.42, 0, 14, r * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
      if (pal.pawPads) {
        ctx.fillStyle = rgbaCss(pal.pawPads);
        ctx.beginPath();
        ctx.ellipse(-len * 0.44, 1, 3.6, 4.8, 0, 0, Math.PI * 2);
        ctx.fill();
        for (let txi = -1; txi <= 1; txi++) {
          ctx.beginPath();
          ctx.ellipse(-len * 0.44 - 6.5 - (txi === 0 ? 1 : 0), txi * 4.5, 1.9, 1.9, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      traceHL();
      ctx.strokeStyle = isHov ? '#D97736' : 'rgba(92, 76, 64, 0.18)';
      ctx.lineWidth = isHov ? 2.2 : 1.2;
      ctx.stroke();
      ctx.restore();

      drawPartLabel(ctx, hl.x - 4, hl.y + 30, '后腿', isHov);
    })();

    // 2. Body (center anchor)
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

      ctx.save();
      traceBody();
      ctx.clip();
      drawSpaceArt(ctx, skin, ['body'], (p) => ({ x: p.x * bw * bScale, y: p.y * bScale }), bScale);
      ctx.restore();

      traceBody();
      ctx.strokeStyle = isHov ? '#D97736' : 'rgba(92, 76, 64, 0.16)';
      ctx.lineWidth = isHov ? 2.4 : 1.2;
      ctx.stroke();
      ctx.restore();
      drawPartLabel(ctx, m.body.x, m.body.y + 46, '身体', isHov);
    })();

    // 3. Ears (floating pair above head)
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

        ctx.save();
        const g = traceEarTriangle(ctx, bx, by, sign, 1.0, 1.0, m.es * m.hs, skin.shape.earBaseWidth || 1, skin.shape.earPointiness || 1);
        ctx.clip();
        if (pal.earInner) {
          ctx.fillStyle = rgbaCss(pal.earInner);
          traceEarTriangle(ctx, bx, by - 4, sign, 0.56, 0.62, m.es * m.hs, skin.shape.earBaseWidth || 1, skin.shape.earPointiness || 1);
          ctx.fill();
        }
        const mapEar = (p) => {
          const u = p.x / 100, v = -p.y / 100;
          return {
            x: bx + u * (g.outX - g.inX) + v * (g.tipX - bx),
            y: by + v * (g.tipY - by)
          };
        };
        drawSpaceArt(ctx, skin, [space], mapEar, 1.05);
        ctx.restore();

        traceEarTriangle(ctx, bx, by, sign, 1.0, 1.0, m.es * m.hs, skin.shape.earBaseWidth || 1, skin.shape.earPointiness || 1);
        ctx.strokeStyle = isHov ? '#D97736' : 'rgba(92, 76, 64, 0.16)';
        ctx.lineWidth = isHov ? 2.2 : 1.2;
        ctx.stroke();
      }
      ctx.restore();
      drawPartLabel(ctx, m.ears.x, m.ears.y - 46 * m.es * m.hs, '耳朵', isHov);
    })();

    // 4. Head (unified face + crown + live eyes/nose/mouth/whiskers)
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

      ctx.save();
      traceHead();
      ctx.clip();
      drawSpaceArt(ctx, skin, ['head', 'skull'], (p) => ({ x: p.x * hS, y: p.y * hS }), hS);
      ctx.restore();

      // Overlay cute eyes (supporting heterochromia & custom pupil color), nose, mouth, whiskers
      for (let side = -1; side <= 1; side += 2) {
        const isLeft = side < 0;
        const irisSrc = (isLeft ? pal.irisLeft : pal.irisRight) || pal.iris;
        const pupilSrc = (isLeft ? pal.pupilLeft : pal.pupilRight) || pal.pupil;
        const ex = side * 16.5 * hS;
        const ey = -5 * hS;
        ctx.fillStyle = irisSrc ? rgbaCss(irisSrc) : '#D2E83A';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 9.2 * hS, 8.2 * hS, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = pupilSrc ? rgbaCss(pupilSrc) : '#141416';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 3.0 * hS, 6.2 * hS, 0, 0, Math.PI * 2);
        ctx.fill();
        // Whiskers
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
      // Nose & mouth
      ctx.fillStyle = pal.nose ? rgbaCss(pal.nose) : '#EB9CA8';
      ctx.beginPath();
      ctx.ellipse(0, 7.5 * hS, 3.2 * hS, 2.2 * hS, 0, 0, Math.PI * 2);
      ctx.fill();
      const mouthHidden = !!(pal.mouth && pal.mouth.a !== undefined && pal.mouth.a < 0.01);
      if (!mouthHidden) {
        ctx.strokeStyle = pal.mouth ? rgbaCss(pal.mouth) : 'rgba(110,92,84,0.75)';
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

    // 5 & 6. Left & Right Arms + Paws
    ['leftArm', 'rightArm'].forEach((armId) => {
      const isLeft = armId === 'leftArm';
      const sign = isLeft ? -1 : 1;
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
        if (armGrad) {
          return partFillStyle(ctx, skin, armId, 0, 0, 0, armH, pal.legs);
        } else if (skin.idleLegsTinted !== false && pal.belly && !Spec.sameColor(pal.belly, pal.legs)) {
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

      ctx.save();
      traceArm();
      ctx.clip();
      const mapArm = (pt) => {
        const u = clamp(pt.x / 100, 0, 1);
        return { x: sign * (pt.y / 10) * (armW * 0.48), y: u * armH };
      };
      drawSpaceArt(ctx, skin, [armId], mapArm, 1.9);
      // Paw cap at bottom
      ctx.fillStyle = rgbaCss(pal.paws);
      ctx.beginPath();
      ctx.ellipse(0, armH - 8, armW * 0.48, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      if (pal.pawPads) {
        ctx.fillStyle = rgbaCss(pal.pawPads);
        ctx.beginPath();
        ctx.ellipse(0, armH - 4, 5.2, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
        for (let txi = -1; txi <= 1; txi++) {
          ctx.beginPath();
          ctx.ellipse(txi * 5.8, armH - 10.5 - (txi === 0 ? 1.5 : 0), 2.3, 2.0, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // Subtle crease rim
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
    // Test front-to-back order (arms -> head -> ears -> body -> tail)
    const tests = [
      { id: 'leftArm', cx: m.leftArm.x, cy: m.leftArm.y + m.leftArm.h * 0.5, rx: m.leftArm.hit.rx, ry: m.leftArm.hit.ry },
      { id: 'rightArm', cx: m.rightArm.x, cy: m.rightArm.y + m.rightArm.h * 0.5, rx: m.rightArm.hit.rx, ry: m.rightArm.hit.ry },
      { id: 'head', cx: m.head.x, cy: m.head.y, rx: m.head.hit.rx, ry: m.head.hit.ry },
      { id: 'ears', cx: m.ears.x, cy: m.ears.y - 12, rx: m.ears.hit.rx, ry: m.ears.hit.ry },
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
  // Zoomed Part Paint Canvas Rendering
  // -------------------------------------------------------------------------
  // Exact 2.5D build metrics matching renderer.js (STANDARD_BUILD / SLEEK_BUILD)
  // Silhouette proportions of the cat actually being drawn (standard / sleek), straight from the renderer.
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
    // Connect down to jaw curve (head jawSide starts at (44*cf, 8) -> (0, 34) -> (-44*cf, 8))
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

  // Head dynamic bleed envelope: region exposed when yaw/pitch/tilt rotates the 3D head dome
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
    // Exact resting 2.5D headCenter.y - seatY offset (126 + bd.headLift - 226)
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

    // Build exact top chin-notch curve matching renderer.js jawSide(false, cf)
    const jaw = Spec.jawSide(false, cf);
    ctxRef.moveTo(lCheek.x, lCheek.y);
    // Trace jaw curve left -> chin -> right (jaw indices 3..length-2 run right->left, so reverse)
    for (let i = jaw.length - 2; i >= 3; i--) {
      const jp = jaw[i];
      // Clamp jaw horizontal extent to the cheek outer edge so neck corners join smoothly
      const clampedX = clamp(jp.x, -cheekHalfW, cheekHalfW);
      const pt = H(clampedX, jp.y);
      ctxRef.lineTo(pt.x, pt.y);
    }
    ctxRef.lineTo(rCheek.x, rCheek.y);
    // Exact 2.5D right neck -> hip -> bottom -> left hip -> left neck Beziers
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

  // Body dynamic bleed envelope: includes the neck/upper-chest hidden behind the resting chin
  // that becomes visible when the cat looks up, turns its head, or tilts its head.
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

  function traceZoomedPartSilhouette(ctxRef, partId, skin, earSpace) {
    const s = skin.shape;
    if (partId === 'head') {
      const bd = get25DBuild(skin);
      const c = PART_VIEW.head.toCanvas({ x: 0, y: 0 });
      const ry = Math.abs(bd.crownBaseY) * PART_VIEW.head.scale;
      traceHeadWithJaw(ctxRef, (p) => PART_VIEW.head.toCanvas(p), s.cheekFullness, skin);
      return { x0: c.x, y0: c.y - ry, x1: c.x, y1: c.y + 34 * PART_VIEW.head.scale };
    }
    if (partId === 'ears') {
      const sp = earSpace || 'leftEar';
      const sign = sp === 'leftEar' ? -1 : 1;
      const cx = sp === 'leftEar' ? CW * 0.29 : CW * 0.71;
      const by = CH * 0.80;
      const g = traceEarTriangle(ctxRef, cx, by, sign, 2.15, 2.35, 1.0, s.earBaseWidth || 1, s.earPointiness || 1);
      return { x0: cx, y0: by, x1: g.tipX, y1: g.tipY };
    }
    if (partId === 'body') {
      return traceBodyWithJaw25D(ctxRef, skin);
    }
    if (partId === 'leftArm' || partId === 'rightArm' || partId === 'hindLeg') {
      const top = toPartCanvas(partId, { x: 0, y: 0 });
      const bot = toPartCanvas(partId, { x: 100, y: 0 });
      const hw = Math.abs(toPartCanvas(partId, { x: 0, y: 10 }).x - top.x); // y = ±10 is the limb edge
      ctxRef.beginPath();
      ctxRef.moveTo(top.x - hw, top.y + 38);
      ctxRef.arc(top.x, top.y + 38, hw, Math.PI, 0, false);
      ctxRef.lineTo(bot.x + hw * 0.9, bot.y - 6);
      ctxRef.arc(bot.x, bot.y - 6, hw * 0.9, 0, Math.PI, false);
      ctxRef.closePath();
      return { x0: top.x, y0: top.y, x1: bot.x, y1: bot.y + 56 };
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

  // Build calligraphy tapered ribbon polygon in part space from draftPts
  function buildCalligraphyPolygon(pts, baseSize) {
    if (!pts || pts.length < 2) return null;
    // Compute cumulative arc length
    const dists = [0];
    for (let i = 1; i < pts.length; i++) {
      dists.push(dists[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    const totalLen = dists[dists.length - 1];
    if (totalLen < 0.4) return null;

    const leftSide = [];
    const rightSide = [];
    let smoothW = baseSize * 0.4;

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const len = Math.max(0.001, Math.hypot(tx, ty));
      const nx = -ty / len;
      const ny = tx / len;

      const u = dists[i] / totalLen;
      // Entry & exit taper for authentic calligraphy nib flick
      const entryTaper = clamp(u / 0.14, 0.18, 1.0);
      const exitTaper = clamp((1 - u) / 0.22, 0.12, 1.0);
      const dt = i > 0 ? Math.max(4, p.t - prev.t) : 16;
      const speed = i > 0 ? Math.hypot(p.x - prev.x, p.y - prev.y) / dt : 0;
      const speedMul = clamp(1.22 - speed * 0.55, 0.48, 1.25);
      const pressMul = p.p > 0.02 ? clamp(0.45 + p.p * 1.15, 0.4, 1.6) : 1.0;

      const targetW = baseSize * 0.65 * entryTaper * exitTaper * speedMul * pressMul;
      smoothW = i === 0 ? targetW : smoothW * 0.55 + targetW * 0.45;
      const hw = Math.max(0.28, smoothW);

      leftSide.push([round2(p.x + nx * hw), round2(p.y + ny * hw)]);
      rightSide.push([round2(p.x - nx * hw), round2(p.y - ny * hw)]);
    }
    rightSide.reverse();
    return leftSide.concat(rightSide);
  }

  function simplifyPoints(pts, minDist, maxPts) {
    if (!pts || pts.length <= 2) return pts || [];
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = out[out.length - 1];
      if (Math.hypot(pts[i].x - prev.x, pts[i].y - prev.y) >= minDist) {
        out.push(pts[i]);
      }
    }
    out.push(pts[pts.length - 1]);
    if (out.length > maxPts) {
      const step = (out.length - 1) / (maxPts - 1);
      const sampled = [];
      for (let i = 0; i < maxPts; i++) sampled.push(out[Math.round(i * step)]);
      return sampled;
    }
    return out;
  }

  function renderPartPaintCanvas(skin) {
    const pal = skin.palette;
    const partId = selectedPartId;
    const effScale = Math.max(0.25, fitScale * viewZoom);

    const drawSingleUnit = (unitSpace, fallbackCol) => {
      const mapFn = (p) => {
        if (partId === 'body') {
          return PART_VIEW.body.toCanvas({ x: p.x * (skin.shape.bodyWidth || 1), y: p.y });
        }
        return toPartCanvas(partId, p, unitSpace);
      };
      const wScale = partId === 'ears' ? 2.15 : PART_VIEW[partId].scale;

      const useBleed = hasDynamicBleed(partId);

      // Soft floating drop shadow (no thick white sticker border)
      ctx.save();
      drawFloatingShadow(ctx, false);
      const gradBox0 = useBleed
        ? traceZoomedPartBleed(ctx, partId, skin, unitSpace)
        : traceZoomedPartSilhouette(ctx, partId, skin, unitSpace);
      ctx.fillStyle = partFillStyle(ctx, skin, unitSpace, gradBox0.x0, gradBox0.y0, gradBox0.x1, gradBox0.y1, fallbackCol);
      ctx.fill();
      ctx.restore();

      // Clipped part art + live draft stroke (expanded to dynamic bleed for head/body so users can see & edit neck/turn-exposed areas)
      ctx.save();
      if (useBleed) {
        traceZoomedPartBleed(ctx, partId, skin, unitSpace);
      } else {
        traceZoomedPartSilhouette(ctx, partId, skin, unitSpace);
      }
      ctx.clip();

      // Ear inner pink preview
      if (partId === 'ears' && pal.earInner) {
        const sign = unitSpace === 'leftEar' ? -1 : 1;
        const cx = unitSpace === 'leftEar' ? CW * 0.29 : CW * 0.71;
        traceEarTriangle(ctx, cx, CH * 0.80 - 10, sign, 1.25, 1.45, 1.0, skin.shape.earBaseWidth || 1, skin.shape.earPointiness || 1);
        ctx.fillStyle = rgbaCss(pal.earInner);
        ctx.fill();
      }
      // Tail tip preview
      if (partId === 'tail' && pal.tailTip) {
        const tipStart = toPartCanvas('tail', { x: 76, y: 0 });
        ctx.fillStyle = rgbaCss(pal.tailTip);
        ctx.fillRect(tipStart.x, 0, CW - tipStart.x, CH);
      }

      // Draw saved regions & marks
      const spacesToDraw = partId === 'head' ? ['head', 'skull'] : [unitSpace];
      drawSpaceArt(ctx, skin, spacesToDraw, mapFn, wScale);

      // Draw LIVE stroke in progress (100% WYSIWYG — zero dashed confirm!)
      if (drawing && draftPts.length >= 1) {
        const shouldDrawHere =
          activeDrawSpace === unitSpace ||
          (partId === 'ears' && mirrorEnabled && activeDrawSpace !== unitSpace);
        if (shouldDrawHere) {
          const ptsToDraw = (partId === 'ears' && activeDrawSpace !== unitSpace)
            ? draftPts.map((pt) => ({ x: -pt.x, y: pt.y, p: pt.p, t: pt.t }))
            : draftPts;
          drawDraftStroke(ctx, ptsToDraw, mapFn, wScale, partId !== 'ears' && mirrorEnabled && PART_BY_ID[partId].canMirror && partId !== 'leftArm' && partId !== 'rightArm');
        }
      }

      // Arm / HindLeg paw cap preview flush with bottom rounded cap
      if (partId === 'leftArm' || partId === 'rightArm' || partId === 'hindLeg') {
        const bot = toPartCanvas(partId, { x: 100, y: 0 });
        const pawCol = partId === 'hindLeg' ? (pal.hindPaw || pal.paws) : pal.paws;
        ctx.fillStyle = rgbaCss(pawCol);
        ctx.beginPath();
        ctx.ellipse(bot.x, bot.y + 10, 68, 56, 0, 0, Math.PI * 2);
        ctx.fill();
        if (pal.pawPads) {
          ctx.fillStyle = rgbaCss(pal.pawPads);
          ctx.beginPath();
          ctx.ellipse(bot.x, bot.y + 14, 14, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          for (let txi = -1; txi <= 1; txi++) {
            ctx.beginPath();
            ctx.ellipse(bot.x + txi * 16, bot.y - 4 - (txi === 0 ? 4 : 0), 6, 5.2, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      ctx.restore();

      // Dynamic bleed band overlay + dashed bleed outline + solid resting-view silhouette contour
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
        ctx.fillStyle = 'rgba(255, 249, 240, 0.28)';
        ctx.fill('evenodd');
        ctx.restore();

        // Dashed outer boundary for dynamic turn/look-up exposed bleed zone
        ctx.save();
        traceZoomedPartBleed(ctx, partId, skin, unitSpace);
        ctx.setLineDash([5 / effScale, 4 / effScale]);
        ctx.strokeStyle = 'rgba(217, 119, 54, 0.58)';
        ctx.lineWidth = 1.35 / effScale;
        ctx.stroke();
        ctx.restore();
      }

      // Solid silhouette contour (resting front-view visible boundary)
      traceZoomedPartSilhouette(ctx, partId, skin, unitSpace);
      ctx.strokeStyle = useBleed ? 'rgba(72, 58, 48, 0.48)' : 'rgba(92, 76, 64, 0.25)';
      ctx.lineWidth = (useBleed ? 1.65 : 1.5) / effScale;
      ctx.stroke();

      // Paw-cuff divider hint for arms/hindLeg (x >= 72 is covered by paw color in renderer)
      if (partId === 'leftArm' || partId === 'rightArm' || partId === 'hindLeg') {
        const cuffY = toPartCanvas(partId, { x: 72, y: 0 }).y;
        const hw = Math.abs(toPartCanvas(partId, { x: 0, y: 10 }).x - toPartCanvas(partId, { x: 0, y: 0 }).x);
        ctx.save();
        ctx.setLineDash([4 / effScale, 4 / effScale]);
        ctx.strokeStyle = 'rgba(217, 119, 54, 0.45)';
        ctx.lineWidth = 1.2 / effScale;
        ctx.beginPath();
        ctx.moveTo(CW * 0.5 - hw, cuffY);
        ctx.lineTo(CW * 0.5 + hw, cuffY);
        ctx.stroke();
        ctx.restore();
      }

      // Gentle anatomical guide overlays (eyes/nose/mouth on head, supporting heterochromia & pupil color)
      if (partId === 'head') {
        const hs = PART_VIEW.head.scale;
        ctx.save();
        for (let side = -1; side <= 1; side += 2) {
          const isLeft = side < 0;
          const irisSrc = (isLeft ? pal.irisLeft : pal.irisRight) || pal.iris;
          const pupilSrc = (isLeft ? pal.pupilLeft : pal.pupilRight) || pal.pupil;
          const e = toPartCanvas('head', { x: side * 17.2, y: -2 }); // renderer eye centre
          ctx.fillStyle = irisSrc ? rgbaCss(irisSrc, 0.9) : 'rgba(210, 232, 58, 0.88)';
          ctx.beginPath();
          ctx.ellipse(e.x, e.y, 9.2 * hs, 8.2 * hs, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = pupilSrc ? rgbaCss(pupilSrc, 0.92) : 'rgba(20,20,22,0.88)';
          ctx.beginPath();
          ctx.ellipse(e.x, e.y, 3.0 * hs, 6.2 * hs, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        const n = toPartCanvas('head', { x: 0, y: 8.2 });
        const noseHidden = isNoseHidden(pal);
        if (noseHidden) {
          ctx.save();
          ctx.setLineDash([3 / effScale, 2.5 / effScale]);
          ctx.strokeStyle = 'rgba(217, 119, 54, 0.82)';
          ctx.lineWidth = 1.25 / effScale;
          ctx.beginPath();
          ctx.moveTo(n.x - 2.6 * hs, n.y - 1.2 * hs);
          ctx.quadraticCurveTo(n.x, n.y - 1.8 * hs, n.x + 2.6 * hs, n.y - 1.2 * hs);
          ctx.quadraticCurveTo(n.x + 2.0 * hs, n.y + 0.7 * hs, n.x, n.y + 1.7 * hs);
          ctx.quadraticCurveTo(n.x - 2.0 * hs, n.y + 0.7 * hs, n.x - 2.6 * hs, n.y - 1.2 * hs);
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.fillStyle = pal.nose ? rgbaCss(pal.nose, 0.9) : 'rgba(235, 156, 168, 0.9)';
          ctx.beginPath();
          ctx.moveTo(n.x - 2.3 * hs, n.y - 1.1 * hs);
          ctx.quadraticCurveTo(n.x, n.y - 1.6 * hs, n.x + 2.3 * hs, n.y - 1.1 * hs);
          ctx.quadraticCurveTo(n.x + 1.8 * hs, n.y + 0.6 * hs, n.x, n.y + 1.5 * hs);
          ctx.quadraticCurveTo(n.x - 1.8 * hs, n.y + 0.6 * hs, n.x - 2.3 * hs, n.y - 1.1 * hs);
          ctx.closePath();
          ctx.fill();
        }
        const mouthHidden = !!(pal.mouth && pal.mouth.a !== undefined && pal.mouth.a < 0.01);
        if (!mouthHidden) {
          const mL = toPartCanvas('head', { x: -3.5, y: 11 });
          const mR = toPartCanvas('head', { x: 3.5, y: 11 });
          ctx.strokeStyle = pal.mouth ? rgbaCss(pal.mouth, 0.9) : 'rgba(110,92,84,0.75)';
          ctx.lineWidth = 1.6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(mL.x, mL.y, 3.6 * hs, 0.15, Math.PI - 0.15);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(mR.x, mR.y, 3.6 * hs, 0.15, Math.PI - 0.15);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Active feature-layer focus highlight on canvas so the user clearly sees what layer they are editing
      const curLayerId = activeLayerByPart[partId];
      if (isFeatureLayerId(curLayerId)) {
        ctx.save();
        ctx.setLineDash([4.5 / effScale, 3.5 / effScale]);
        ctx.strokeStyle = 'rgba(217, 119, 54, 0.92)';
        ctx.lineWidth = 1.8 / effScale;
        if (partId === 'head' && curLayerId === '__feat:eyes') {
          const hs = PART_VIEW.head.scale;
          for (let side = -1; side <= 1; side += 2) {
            const e = toPartCanvas('head', { x: side * 17.2, y: -2 });
            ctx.beginPath();
            ctx.ellipse(e.x, e.y, 11.2 * hs, 10.2 * hs, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        } else if (partId === 'head' && curLayerId === '__feat:nose') {
          const hs = PART_VIEW.head.scale;
          const n = toPartCanvas('head', { x: 0, y: 8.2 });
          ctx.beginPath();
          ctx.ellipse(n.x, n.y, 5.8 * hs, 4.2 * hs, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (partId === 'head' && curLayerId === '__feat:mouth') {
          const hs = PART_VIEW.head.scale;
          const m = toPartCanvas('head', { x: 0, y: 12.2 });
          ctx.beginPath();
          ctx.ellipse(m.x, m.y, 11.5 * hs, 6.0 * hs, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (partId === 'ears' && curLayerId === '__feat:earInner') {
          const sign = unitSpace === 'leftEar' ? -1 : 1;
          const cx = unitSpace === 'leftEar' ? CW * 0.29 : CW * 0.71;
          traceEarTriangle(ctx, cx, CH * 0.80 - 10, sign, 1.32, 1.52, 1.0, skin.shape.earBaseWidth || 1, skin.shape.earPointiness || 1);
          ctx.stroke();
        } else if ((partId === 'leftArm' || partId === 'rightArm' || partId === 'hindLeg') && curLayerId === '__feat:paws') {
          const bot = toPartCanvas(partId, { x: 100, y: 0 });
          ctx.beginPath();
          ctx.ellipse(bot.x, bot.y + 4, 72, 62, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (partId === 'tail' && curLayerId === '__feat:tailTip') {
          const tipStart = toPartCanvas('tail', { x: 76, y: 0 });
          const tipEnd = toPartCanvas('tail', { x: 100, y: 0 });
          const hh = TAIL_EDGE_Y * TAIL_BOARD_Y;
          ctx.strokeRect(tipStart.x, tipStart.y - hh - 3, (tipEnd.x - tipStart.x) + hh + 3, hh * 2 + 6);
        } else if (curLayerId === '__feat:base') {
          traceZoomedPartSilhouette(ctx, partId, skin, unitSpace);
          ctx.stroke();
        }
        ctx.restore();
      }
    };

    if (partId === 'ears') {
      drawSingleUnit('leftEar', pal.earOuter);
      drawSingleUnit('rightEar', pal.earOuter);
      // Center symmetry divider
      if (mirrorEnabled) {
        ctx.save();
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = 'rgba(217, 119, 54, 0.35)';
        ctx.beginPath();
        ctx.moveTo(CW * 0.5, 44);
        ctx.lineTo(CW * 0.5, CH - 34);
        ctx.stroke();
        ctx.restore();
      }
    } else if (partId === 'head') {
      drawSingleUnit('head', pal.headBody || pal.body);
      ctx.save();
      ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(115, 98, 84, 0.72)';
      ctx.textAlign = 'left';
      const _tr = window.t || ((s) => s);
      ctx.fillText(_tr('实线：正脸可见 · 虚线：转头/抬头露出区（可编辑）'), 12, CH - 12);
      ctx.restore();
    } else if (partId === 'body') {
      drawSingleUnit('body', pal.body);
      ctx.save();
      ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(115, 98, 84, 0.72)';
      ctx.textAlign = 'left';
      const _tr = window.t || ((s) => s);
      ctx.fillText(_tr('实线：正脸可见 · 虚线：抬头/转头露出脖子区（可编辑）'), 12, 24);
      ctx.restore();
    } else if (partId === 'leftArm' || partId === 'rightArm') {
      drawSingleUnit(partId, pal.legs);
      // Clean side annotations outside the arm silhouette
      ctx.save();
      ctx.font = '500 11.5px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(115, 98, 84, 0.78)';
      ctx.textAlign = 'left';
      const _tr = window.t || ((s) => s);
      ctx.fillText(_tr('← 肩部（根部）'), CW * 0.5 + 88, 66);
      ctx.fillText(_tr('← 小爪子'), CW * 0.5 + 88, CH - 64);
      ctx.restore();
    } else if (partId === 'hindLeg') {
      drawSingleUnit('hindLeg', pal.hindLeg || pal.legs);
      ctx.save();
      ctx.font = '500 11.5px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(115, 98, 84, 0.78)';
      ctx.textAlign = 'left';
      const _tr = window.t || ((s) => s);
      ctx.fillText(_tr('← 腿根（臀部）'), CW * 0.5 + 84, 66);
      ctx.fillText(_tr('← 后爪子（三键踩键）'), CW * 0.5 + 84, CH - 64);
      ctx.restore();
    } else if (partId === 'tail') {
      drawSingleUnit('tail', pal.tail);
      ctx.save();
      ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(115, 98, 84, 0.72)';
      const _tr = window.t || ((s) => s);
      ctx.fillText(_tr('尾根'), 42, CH * 0.5 + 96);
      ctx.textAlign = 'right';
      ctx.fillText(_tr('尾尖'), CW - 42, CH * 0.5 + 96);
      ctx.restore();
    }

    // Center symmetry axis guide for head / body
    if (mirrorEnabled && (partId === 'head' || partId === 'body')) {
      ctx.save();
      ctx.setLineDash([4 / effScale, 5 / effScale]);
      ctx.strokeStyle = 'rgba(217, 119, 54, 0.28)';
      ctx.lineWidth = 1.1 / effScale;
      ctx.beginPath();
      ctx.moveTo(CW * 0.5, 30);
      ctx.lineTo(CW * 0.5, CH - 24);
      ctx.stroke();
      ctx.restore();
    }

    // Selection box overlay (marquee or active transform box with 4 corner handles)
    if (activeTool === 'select') {
      const raw = getRaw();
      if (raw && selectedItems.length > 0) {
        const box = computeSelectionWorldBBox(raw, skin);
        if (box) {
          ctx.save();
          ctx.fillStyle = 'rgba(37, 99, 235, 0.06)';
          ctx.fillRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
          ctx.setLineDash([4 / effScale, 3 / effScale]);
          ctx.strokeStyle = '#2563EB';
          ctx.lineWidth = 1.4 / effScale;
          ctx.strokeRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
          ctx.setLineDash([]);
          const hr = 4.2 / effScale;
          const corners = [
            { x: box.minX, y: box.minY },
            { x: box.maxX, y: box.minY },
            { x: box.maxX, y: box.maxY },
            { x: box.minX, y: box.maxY }
          ];
          for (let ci = 0; ci < corners.length; ci++) {
            ctx.beginPath();
            ctx.arc(corners[ci].x, corners[ci].y, hr, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            ctx.strokeStyle = '#2563EB';
            ctx.lineWidth = 1.5 / effScale;
            ctx.stroke();
          }
          ctx.restore();
        }
      }
      if (selDrag && selDrag.mode === 'marquee' && selDrag.startW && selDrag.curW) {
        const x0 = Math.min(selDrag.startW.x, selDrag.curW.x);
        const y0 = Math.min(selDrag.startW.y, selDrag.curW.y);
        const w = Math.abs(selDrag.curW.x - selDrag.startW.x);
        const h = Math.abs(selDrag.curW.y - selDrag.startW.y);
        ctx.save();
        ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
        ctx.fillRect(x0, y0, w, h);
        ctx.setLineDash([4 / effScale, 3 / effScale]);
        ctx.strokeStyle = '#2563EB';
        ctx.lineWidth = 1.25 / effScale;
        ctx.strokeRect(x0, y0, w, h);
        ctx.restore();
      }
    }

    // Brush cursor preview ring (scales naturally with zoomed part while keeping crisp screen stroke)
    if (cursorCanvasPt && !panning && !panToolActive && !spacePanHeld && activeTool !== 'bucket' && activeTool !== 'eyedropper' && activeTool !== 'select') {
      const wScale = partId === 'ears' ? 2.15 : PART_VIEW[partId].scale;
      const r = Math.max(2.2 / effScale, brushSize * wScale * (activeTool === 'airbrush' ? 1.1 : 0.55));
      ctx.save();
      ctx.beginPath();
      ctx.arc(cursorCanvasPt.x, cursorCanvasPt.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = activeTool === 'eraser' ? '#E5484D' : 'rgba(36, 30, 26, 0.65)';
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

  function drawDraftStroke(ctxRef, pts, mapFn, wScale, mirrorX) {
    const colHex = activeTool === 'smudge' && smudgeColor ? smudgeColor : brushColor;
    const baseCol = Spec.parseHexColor(colHex) || { r: 0.12, g: 0.12, b: 0.14, a: 1 };
    const col = Object.assign({}, baseCol, { a: baseCol.a * (activeTool === 'smudge' ? clamp(brushAlpha * 0.45, 0.12, 0.55) : brushAlpha) });

    const renderOne = (pointArr) => {
      if (activeTool === 'calligraphy') {
        const poly = buildCalligraphyPolygon(pointArr, brushSize);
        if (!poly) return;
        const mObj = {
          stroke: false,
          color: col,
          points: poly.map((xy) => ({ x: xy[0], y: xy[1] }))
        };
        drawMarkMapped(ctxRef, mObj, mapFn, wScale);
      } else if (activeTool === 'fillBrush') {
        if (pointArr.length < 2) return;
        const mObj = {
          stroke: false,
          color: col,
          points: pointArr.map((p) => ({ x: p.x, y: p.y }))
        };
        drawMarkMapped(ctxRef, mObj, mapFn, wScale);
      } else {
        const brushKind =
          activeTool === 'soft' ? 'soft' :
          activeTool === 'airbrush' ? 'airbrush' :
          activeTool === 'smudge' ? 'smudge' : 'round';
        const mObj = {
          stroke: true,
          brush: brushKind,
          softness: activeTool === 'airbrush' ? 0.85 : 0.72,
          width: activeTool === 'airbrush' ? brushSize * 1.45 : brushSize,
          color: col,
          points: pointArr.map((p) => ({ x: p.x, y: p.y }))
        };
        drawMarkMapped(ctxRef, mObj, mapFn, wScale);
      }
    };

    renderOne(pts);
    if (mirrorX) {
      renderOne(pts.map((p) => ({ x: -p.x, y: p.y, p: p.p, t: p.t })));
    }
  }

  // -------------------------------------------------------------------------
  // Commit Drawn Stroke Immediately to rawSkin (WYSIWYG + Ctrl+Z)
  // -------------------------------------------------------------------------
  function buildMarkObject(space, pts) {
    const colHex = (activeTool === 'smudge' && smudgeColor ? smudgeColor : brushColor).toUpperCase();
    const alpha = activeTool === 'smudge' ? round2(clamp(brushAlpha * 0.45, 0.12, 0.55)) : round2(brushAlpha);

    if (activeTool === 'calligraphy') {
      const simplified = simplifyPoints(pts, 0.9, 64);
      const poly = buildCalligraphyPolygon(simplified, brushSize);
      if (!poly || poly.length < 3) return null;
      const out = { space: space, kind: 'polygon', color: colHex, points: poly };
      if (alpha < 0.999) out.alpha = alpha;
      return out;
    }

    if (activeTool === 'fillBrush') {
      const simplified = simplifyPoints(pts, 1.4, 96);
      if (simplified.length < 3) return null;
      const out = {
        space: space,
        kind: 'polygon',
        color: colHex,
        points: simplified.map((p) => [round2(p.x), round2(p.y)])
      };
      if (alpha < 0.999) out.alpha = alpha;
      return out;
    }

    const simplified = simplifyPoints(pts, 1.1, 96);
    if (simplified.length < 2) {
      // Single tap dot -> tiny 2-point stroke
      const p0 = pts[0];
      simplified.push({ x: p0.x + 0.35, y: p0.y + 0.05 });
    }
    const brushKind =
      activeTool === 'soft' ? 'soft' :
      activeTool === 'airbrush' ? 'airbrush' :
      activeTool === 'smudge' ? 'smudge' : 'round';
    const out = {
      space: space,
      kind: 'stroke',
      color: colHex,
      width: round2(clamp(activeTool === 'airbrush' ? brushSize * 1.45 : brushSize, 0.2, 24)),
      points: simplified.map((p) => [round2(p.x), round2(p.y)])
    };
    if (brushKind !== 'round') {
      out.brush = brushKind;
      out.softness = activeTool === 'airbrush' ? 0.85 : 0.72;
    }
    if (alpha < 0.999) out.alpha = alpha;
    return out;
  }

  function mirrorSpaceAndPts(space, pts) {
    if (space === 'leftEar') return { space: 'rightEar', pts: pts.map((p) => ({ x: -p.x, y: p.y, p: p.p, t: p.t })) };
    if (space === 'rightEar') return { space: 'leftEar', pts: pts.map((p) => ({ x: -p.x, y: p.y, p: p.p, t: p.t })) };
    if (space === 'leftArm') return { space: 'rightArm', pts: pts.map((p) => ({ x: p.x, y: p.y, p: p.p, t: p.t })) };
    if (space === 'rightArm') return { space: 'leftArm', pts: pts.map((p) => ({ x: p.x, y: p.y, p: p.p, t: p.t })) };
    if (space === 'head' || space === 'body') return { space: space, pts: pts.map((p) => ({ x: -p.x, y: p.y, p: p.p, t: p.t })) };
    return null;
  }

  // -------------------------------------------------------------------------
  // PS-Style Per-Part Layer Stack (feature layers + paint layers + base layer)
  // -------------------------------------------------------------------------
  const activeLayerByPart = {};

  const FEATURE_LAYERS_BY_PART = {
    head: [
      { id: '__feat:eyes', name: '眼睛层（虹膜/瞳孔）', position: 'top' },
      { id: '__feat:nose', name: '鼻子层（纯色/手绘）', position: 'top' },
      { id: '__feat:mouth', name: '嘴巴与胡须层', position: 'top' },
      { id: '__feat:base', name: '头部底色 / 渐变层', position: 'bottom' }
    ],
    ears: [
      { id: '__feat:earInner', name: '内耳层', position: 'top' },
      { id: '__feat:base', name: '外耳底色 / 渐变层', position: 'bottom' }
    ],
    body: [
      { id: '__feat:base', name: '躯干底色 / 渐变层', position: 'bottom' }
    ],
    leftArm: [
      { id: '__feat:paws', name: '爪子与肉垫层', position: 'top' },
      { id: '__feat:base', name: '手臂底色 / 渐变层', position: 'bottom' }
    ],
    rightArm: [
      { id: '__feat:paws', name: '爪子与肉垫层', position: 'top' },
      { id: '__feat:base', name: '手臂底色 / 渐变层', position: 'bottom' }
    ],
    hindLeg: [
      { id: '__feat:paws', name: '后爪与肉垫层', position: 'top' },
      { id: '__feat:base', name: '后腿底色 / 渐变层', position: 'bottom' }
    ],
    tail: [
      { id: '__feat:tailTip', name: '尾尖层', position: 'top' },
      { id: '__feat:base', name: '尾巴底色 / 渐变层', position: 'bottom' }
    ]
  };

  function isFeatureLayerId(id) {
    return typeof id === 'string' && id.indexOf('__feat:') === 0;
  }

  function getPartFeatureLayers(partId) {
    return FEATURE_LAYERS_BY_PART[partId] || FEATURE_LAYERS_BY_PART.body;
  }

  function getFeatureLayerMeta(partId, layerId) {
    const list = getPartFeatureLayers(partId);
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === layerId) return list[i];
    }
    return null;
  }

  function getPartSpaces(partId) {
    const p = PART_BY_ID[partId];
    return p ? p.spaces : [partId];
  }

  function ensurePartLayers(raw, partId) {
    if (!raw) return [];
    if (!raw._layers || typeof raw._layers !== 'object') raw._layers = {};
    let layers = raw._layers[partId];
    if (!Array.isArray(layers) || layers.length === 0) {
      layers = [{ id: 'L1', name: '花纹层 1', visible: true }];
      raw._layers[partId] = layers;
    }
    const spaces = getPartSpaces(partId);
    const validPaintIds = new Set(layers.map((l) => l.id));
    if (Array.isArray(raw.marks)) {
      for (let i = 0; i < raw.marks.length; i++) {
        const m = raw.marks[i];
        if (!m || spaces.indexOf(m.space) === -1) continue;
        const isFeatMark = (partId === 'head') && (m._layerId === '__feat:nose' || m._layerId === '__feat:mouth');
        if (!isFeatMark && (!m._layerId || !validPaintIds.has(m._layerId))) {
          m._layerId = layers[0].id;
        }
      }
    }
    const cur = activeLayerByPart[partId];
    const validFeat = isFeatureLayerId(cur) && !!getFeatureLayerMeta(partId, cur);
    if (!cur || (!validPaintIds.has(cur) && !validFeat)) {
      activeLayerByPart[partId] = layers[layers.length - 1].id;
    }
    return layers;
  }

  function getActivePaintLayer(raw, partId) {
    const layers = ensurePartLayers(raw, partId);
    const id = activeLayerByPart[partId];
    for (let i = 0; i < layers.length; i++) {
      if (layers[i].id === id) return layers[i];
    }
    return layers[layers.length - 1];
  }

  function getCurrentLayerDisplayName(raw, partId) {
    const id = activeLayerByPart[partId];
    const feat = getFeatureLayerMeta(partId, id);
    if (feat) return feat.name;
    const paint = getActivePaintLayer(raw, partId);
    return paint ? paint.name : '花纹层 1';
  }

  function updateActiveLayerPillUI(raw, partId) {
    if (!activeLayerPillEl) return;
    activeLayerPillEl.hidden = mode !== 'part';
    if (mode !== 'part' || !raw) return;
    const isFeat = isFeatureLayerId(activeLayerByPart[partId]);
    activeLayerPillEl.classList.toggle('is-feature', isFeat);
    if (activeLayerNameEl) {
      activeLayerNameEl.textContent = getCurrentLayerDisplayName(raw, partId);
    }
  }

  function syncPartMarksByLayers(raw, partId) {
    if (!raw || !Array.isArray(raw.marks)) return;
    const layers = ensurePartLayers(raw, partId);
    const spaces = getPartSpaces(partId);
    const visById = {};
    const buckets = {};
    for (let i = 0; i < layers.length; i++) {
      visById[layers[i].id] = layers[i].visible !== false;
      buckets[layers[i].id] = [];
    }
    const featMouthMarks = [];
    const featNoseMarks = [];
    const otherMarks = [];
    for (let i = 0; i < raw.marks.length; i++) {
      const m = raw.marks[i];
      if (!m || spaces.indexOf(m.space) === -1) {
        otherMarks.push(m);
        continue;
      }
      if (partId === 'head' && m._layerId === '__feat:mouth') {
        delete m._hidden;
        featMouthMarks.push(m);
        continue;
      }
      if (partId === 'head' && m._layerId === '__feat:nose') {
        delete m._hidden;
        featNoseMarks.push(m);
        continue;
      }
      const lid = (m._layerId && buckets[m._layerId]) ? m._layerId : layers[0].id;
      m._layerId = lid;
      if (visById[lid]) delete m._hidden;
      else m._hidden = true;
      buckets[lid].push(m);
    }
    const orderedPartMarks = [];
    for (let i = 0; i < layers.length; i++) {
      const arr = buckets[layers[i].id];
      for (let j = 0; j < arr.length; j++) orderedPartMarks.push(arr[j]);
    }
    for (let i = 0; i < featMouthMarks.length; i++) orderedPartMarks.push(featMouthMarks[i]);
    for (let i = 0; i < featNoseMarks.length; i++) orderedPartMarks.push(featNoseMarks[i]);
    raw.marks = otherMarks.concat(orderedPartMarks);
  }

  function countLayerMarks(raw, partId, layerId) {
    if (!raw || !Array.isArray(raw.marks)) return 0;
    const spaces = getPartSpaces(partId);
    let n = 0;
    for (let i = 0; i < raw.marks.length; i++) {
      const m = raw.marks[i];
      if (m && spaces.indexOf(m.space) !== -1 && m._layerId === layerId) n++;
    }
    return n;
  }

  function createPartLayer(raw, partId, customName) {
    const layers = ensurePartLayers(raw, partId);
    let maxNum = layers.length;
    for (let i = 0; i < layers.length; i++) {
      const match = String(layers[i].id || '').match(/^L(\d+)$/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
    const nextId = 'L' + (maxNum + 1);
    const layer = {
      id: nextId,
      name: customName || ('花纹层 ' + (layers.length + 1)),
      visible: true
    };
    layers.push(layer);
    activeLayerByPart[partId] = layer.id;
    return layer;
  }

  // Handle direct canvas click/paint when a feature layer (eyes/nose/mouth/earInner/paws/tailTip/base) is active.
  // Returns true if handled as a palette/feature-layer action (skip freehand mark stroke),
  // or false if it should proceed as a freehand mark stroke (e.g. hand-painting multi-color nose or mouth).
  function handleFeatureLayerCanvasAction(raw, skin, partId, sPt, wPt, mapped) {
    const curId = activeLayerByPart[partId];
    if (!isFeatureLayerId(curId)) return false;
    if (!raw.palette) raw.palette = {};
    const api = API();
    const c = brushColor.toUpperCase();

    if (curId === '__feat:eyes' && partId === 'head') {
      const side = mapped.x < 0 ? 'left' : 'right';
      const ex = side === 'left' ? -17.2 : 17.2;
      const ey = -2;
      const dx = mapped.x - ex;
      const dy = mapped.y - ey;
      const inPupil = (dx * dx) / (3.8 * 3.8) + (dy * dy) / (6.8 * 6.8) <= 1.0;
      const inIris = (dx * dx) / (11.2 * 11.2) + (dy * dy) / (10.2 * 10.2) <= 1.0;

      if (inPupil) {
        if (mirrorEnabled) {
          raw.palette.pupil = c;
          delete raw.palette.pupilLeft;
          delete raw.palette.pupilRight;
        } else {
          if (!raw.palette.pupilLeft) raw.palette.pupilLeft = colorToHex(skin.palette.pupilLeft || skin.palette.pupil, '#141416');
          if (!raw.palette.pupilRight) raw.palette.pupilRight = colorToHex(skin.palette.pupilRight || skin.palette.pupil, '#141416');
          if (side === 'left') raw.palette.pupilLeft = c;
          else raw.palette.pupilRight = c;
        }
        notifyChange(true);
        renderPartInspector();
        if (api) api.showToast((mirrorEnabled ? '双眼瞳孔' : (side === 'left' ? '左眼瞳孔' : '右眼瞳孔')) + '已设为 ' + c);
        return true;
      }
      if (inIris) {
        if (mirrorEnabled) {
          raw.palette.iris = c;
          raw.palette.irisLeft = c;
          raw.palette.irisRight = c;
        } else {
          if (!raw.palette.irisLeft) raw.palette.irisLeft = colorToHex(skin.palette.irisLeft || skin.palette.iris, '#D2E83A');
          if (!raw.palette.irisRight) raw.palette.irisRight = colorToHex(skin.palette.irisRight || skin.palette.iris, '#D2E83A');
          if (side === 'left') raw.palette.irisLeft = c;
          else raw.palette.irisRight = c;
          raw.palette.iris = raw.palette.irisLeft;
        }
        notifyChange(true);
        renderPartInspector();
        if (api) api.showToast((mirrorEnabled ? '双眼虹膜' : (side === 'left' ? '左眼虹膜' : '右眼虹膜')) + '已设为 ' + c);
        return true;
      }
      if (api) api.showToast('当前在「眼睛层」：请直接点左/右眼虹膜或瞳孔上色（关掉“对称”可画异瞳）');
      return true;
    }

    if (curId === '__feat:nose' && partId === 'head') {
      if (activeTool === 'bucket') {
        raw.palette.nose = c;
        lastVisibleNoseHex = c;
        notifyChange(true);
        renderPartInspector();
        if (api) api.showToast('纯色鼻尖已设为 ' + c);
        return true;
      }
      // Freehand paint brush on nose layer -> auto-hide solid nose so multi-color nose marks show on top!
      if (!isNoseHidden(skin.palette)) {
        setNoseHidden(raw, true);
        if (api) api.showToast('已自动隐藏默认纯色鼻子，现在可自由手绘多色鼻子');
      }
      return false;
    }

    if (curId === '__feat:mouth' && partId === 'head') {
      if (activeTool === 'bucket') {
        raw.palette.mouth = c;
        lastVisibleMouthHex = c;
        notifyChange(true);
        renderPartInspector();
        if (api) api.showToast('嘴巴线条已设为 ' + c);
        return true;
      }
      if (!isMouthHidden(skin.palette)) {
        setMouthHidden(raw, true);
        if (api) api.showToast('已隐藏默认嘴巴线条，现在可自由手绘嘴巴/腮红');
      }
      return false;
    }

    if (curId === '__feat:earInner' && partId === 'ears') {
      raw.palette.earInner = c;
      notifyChange(true);
      renderPartInspector();
      if (api) api.showToast('内耳颜色已设为 ' + c);
      return true;
    }

    if (curId === '__feat:paws' && (partId === 'leftArm' || partId === 'rightArm' || partId === 'hindLeg')) {
      const bot = toPartCanvas(partId, { x: 100, y: 0 });
      const hitPad = (wPt.y >= bot.y - 14 && wPt.y <= bot.y + 30 && Math.abs(wPt.x - bot.x) <= 28);
      if (hitPad) {
        raw.palette.pawPads = c;
        if (api) api.showToast('肉垫颜色已设为 ' + c);
      } else if (partId === 'hindLeg') {
        raw.palette.hindPaw = c;
        if (api) api.showToast('后爪颜色已设为 ' + c);
      } else {
        raw.palette.paws = c;
        if (api) api.showToast('小爪颜色已设为 ' + c);
      }
      notifyChange(true);
      renderPartInspector();
      return true;
    }

    if (curId === '__feat:tailTip' && partId === 'tail') {
      raw.palette.tailTip = c;
      notifyChange(true);
      renderPartInspector();
      if (api) api.showToast('尾尖颜色已设为 ' + c);
      return true;
    }

    if (curId === '__feat:base') {
      if (partId === 'head') {
        raw.palette.headBody = c;
        delete raw.palette.bodyShade;
        if (raw.partGradients) delete raw.partGradients.head;
      } else if (partId === 'body') {
        raw.palette.body = c;
        delete raw.palette.bodyShade;
        if (raw.partGradients) delete raw.partGradients.body;
      } else if (partId === 'ears') {
        raw.palette.earOuter = c;
        if (raw.partGradients) { delete raw.partGradients.leftEar; delete raw.partGradients.rightEar; }
      } else if (partId === 'leftArm' || partId === 'rightArm') {
        raw.palette.legs = c;
        raw.idleLegs = 'legs';
        if (raw.partGradients) {
          delete raw.partGradients[partId];
          if (mirrorEnabled) { delete raw.partGradients.leftArm; delete raw.partGradients.rightArm; }
        }
      } else if (partId === 'hindLeg') {
        raw.palette.hindLeg = c;
        if (raw.partGradients) delete raw.partGradients.hindLeg;
      } else if (partId === 'tail') {
        raw.palette.tail = c;
        if (raw.partGradients) delete raw.partGradients.tail;
      }
      notifyChange(true);
      renderPartInspector();
      const part = PART_BY_ID[partId];
      if (api && part) api.showToast('已将「' + part.label + '」底色设为 ' + c);
      return true;
    }

    return false;
  }

  function commitDraftStroke() {
    const raw = getRaw();
    const api = API();
    if (!raw || !draftPts.length) return;
    if (!raw.marks) raw.marks = [];

    const curId = activeLayerByPart[selectedPartId];
    const isFeatPaint = (selectedPartId === 'head') && (curId === '__feat:nose' || curId === '__feat:mouth');
    const activeLayer = isFeatPaint ? null : getActivePaintLayer(raw, selectedPartId);
    if (activeLayer && activeLayer.visible === false) {
      activeLayer.visible = true;
      if (api) api.showToast('已自动显示当前图层「' + activeLayer.name + '」');
    }

    const primary = buildMarkObject(activeDrawSpace, draftPts);
    if (!primary) return;
    primary._layerId = isFeatPaint ? curId : (activeLayer ? activeLayer.id : 'L1');

    const toAdd = [primary];
    if (mirrorEnabled && PART_BY_ID[selectedPartId].canMirror) {
      const mir = mirrorSpaceAndPts(activeDrawSpace, draftPts);
      if (mir) {
        const m2 = buildMarkObject(mir.space, mir.pts);
        if (m2) {
          m2._layerId = primary._layerId;
          toAdd.push(m2);
        }
      }
    }

    if (raw.marks.length + toAdd.length > Spec.MAX_MARKS) {
      if (api) api.showToast(`花纹笔触已达 ${Spec.MAX_MARKS} 条上限，可用橡皮擦清理后再画`);
      return;
    }

    for (let i = 0; i < toAdd.length; i++) raw.marks.push(toAdd[i]);
    syncPartMarksByLayers(raw, selectedPartId);
    notifyChange(true);
    renderPartInspector();
  }

  function distPointToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 <= 1e-9) return Math.hypot(px - ax, py - ay);
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  // -------------------------------------------------------------------------
  // PS-Style Selection Box: Hit-Test, Marquee, Move, Scale, Duplicate & Delete
  // -------------------------------------------------------------------------
  function partToWorld(partId, space, pt, skin) {
    if (partId === 'body') {
      const bw = (skin && skin.shape && skin.shape.bodyWidth) || 1;
      return PART_VIEW.body.toCanvas({ x: pt.x * bw, y: pt.y });
    }
    return toPartCanvas(partId, pt, space);
  }

  function updateSelectionBarUI() {
    if (!selectionBarEl) return;
    const active = mode === 'part' && activeTool === 'select' && selectedItems.length > 0;
    selectionBarEl.hidden = !active;
    if (active && selInfoEl) {
      selInfoEl.textContent = '已选 ' + selectedItems.length + ' 项 · 拖动改位 / 四角缩放';
    }
  }

  function clearSelection() {
    if (selectedItems.length === 0 && !selDrag) {
      updateSelectionBarUI();
      return;
    }
    selectedItems = [];
    selDrag = null;
    updateSelectionBarUI();
    requestRedraw();
  }

  function findMirrorItemIndex(raw, type, idx, partId) {
    if (!mirrorEnabled || !PART_BY_ID[partId] || !PART_BY_ID[partId].canMirror) return -1;
    if (type === 'mark') {
      const src = raw.marks && raw.marks[idx];
      if (!src || !src.points || !src.points.length) return -1;
      const p0 = { x: src.points[0][0], y: src.points[0][1] };
      const pLast = { x: src.points[src.points.length - 1][0], y: src.points[src.points.length - 1][1] };
      const mir = mirrorSpaceAndPts(src.space, [p0, pLast]);
      if (!mir) return -1;
      const spaces = mir.space === 'head' ? ['head', 'skull'] : [mir.space];
      const srcCol = String(src.color || '').toUpperCase();
      for (let i = raw.marks.length - 1; i >= 0; i--) {
        if (i === idx) continue;
        const m = raw.marks[i];
        if (!m || m._hidden || spaces.indexOf(m.space) === -1) continue;
        if (m.kind !== src.kind || String(m.color || '').toUpperCase() !== srcCol) continue;
        if (!m.points || m.points.length !== src.points.length) continue;
        const d0 = Math.hypot(m.points[0][0] - mir.pts[0].x, m.points[0][1] - mir.pts[0].y);
        const d1 = Math.hypot(m.points[m.points.length - 1][0] - mir.pts[1].x, m.points[m.points.length - 1][1] - mir.pts[1].y);
        if (d0 <= 2.5 && d1 <= 2.5) return i;
      }
    }
    return -1;
  }

  function getItemWorldPoints(raw, skin, item) {
    const out = [];
    if (item.type === 'mark') {
      const m = raw.marks && raw.marks[item.index];
      if (!m || !m.points) return out;
      for (let i = 0; i < m.points.length; i++) {
        out.push(partToWorld(selectedPartId, m.space, { x: m.points[i][0], y: m.points[i][1] }, skin));
      }
    } else if (item.type === 'region') {
      const r = raw.regions && raw.regions[item.index];
      if (!r || !r.anchors) return out;
      const flat = Spec.flattenRegion(r.anchors);
      for (let i = 0; i < flat.length; i++) {
        out.push(partToWorld(selectedPartId, r.space, flat[i], skin));
      }
    }
    return out;
  }

  function computeSelectionWorldBBox(raw, skin) {
    if (!raw || !selectedItems.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let count = 0;
    for (let i = 0; i < selectedItems.length; i++) {
      const pts = getItemWorldPoints(raw, skin, selectedItems[i]);
      for (let j = 0; j < pts.length; j++) {
        if (pts[j].x < minX) minX = pts[j].x;
        if (pts[j].x > maxX) maxX = pts[j].x;
        if (pts[j].y < minY) minY = pts[j].y;
        if (pts[j].y > maxY) maxY = pts[j].y;
        count++;
      }
    }
    if (!count) return null;
    const pad = 7;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    if (maxX - minX < 18) {
      const cx = (minX + maxX) * 0.5;
      minX = cx - 9; maxX = cx + 9;
    }
    if (maxY - minY < 18) {
      const cy = (minY + maxY) * 0.5;
      minY = cy - 9; maxY = cy + 9;
    }
    return { minX, minY, maxX, maxY };
  }

  function hitTestSelectionHandle(wPt, box, effScale) {
    if (!box) return null;
    const r = 9 / Math.max(0.4, effScale);
    const handles = [
      { id: 'nw', x: box.minX, y: box.minY },
      { id: 'ne', x: box.maxX, y: box.minY },
      { id: 'se', x: box.maxX, y: box.maxY },
      { id: 'sw', x: box.minX, y: box.maxY }
    ];
    for (let i = 0; i < handles.length; i++) {
      if (Math.hypot(wPt.x - handles[i].x, wPt.y - handles[i].y) <= r) return handles[i].id;
    }
    return null;
  }

  function hitTestPatternAt(raw, skin, partId, wPt) {
    const mapped = fromPartCanvas(partId, wPt);
    const spaces = mapped.space === 'head' ? ['head', 'skull'] : [mapped.space];
    const layers = ensurePartLayers(raw, partId);
    const curId = activeLayerByPart[partId];
    const activePaint = isFeatureLayerId(curId) ? null : getActivePaintLayer(raw, partId);
    const activeLayerId = (curId === '__feat:nose' || curId === '__feat:mouth') ? curId : (activePaint ? activePaint.id : null);

    // Search marks from topmost to bottommost (prefer active layer first, then any visible mark)
    if (Array.isArray(raw.marks)) {
      const searchPass = (onlyActive) => {
        for (let i = raw.marks.length - 1; i >= 0; i--) {
          const m = raw.marks[i];
          if (!m || m._hidden || spaces.indexOf(m.space) === -1) continue;
          if (onlyActive && activeLayerId && m._layerId !== activeLayerId) continue;
          if (markContainsPoint(m, mapped)) {
            return { type: 'mark', index: i, mirrorIndex: findMirrorItemIndex(raw, 'mark', i, partId) };
          }
        }
        return null;
      };
      const hitActive = (layers.length > 1 && activeLayer) ? searchPass(true) : null;
      if (hitActive) return hitActive;
      const hitAny = searchPass(false);
      if (hitAny) return hitAny;
    }

    // Fallback: hit-test regions
    const rIdx = findHitRegionIndex(skin, partId, mapped.space, wPt);
    if (rIdx !== -1) {
      return { type: 'region', index: rIdx, mirrorIndex: -1 };
    }
    return null;
  }

  function snapshotSelectedItems(raw) {
    const snaps = [];
    const seenMarks = new Set();
    const seenRegions = new Set();
    const pushSnap = (type, idx, isMirror) => {
      if (idx < 0) return;
      if (type === 'mark') {
        if (seenMarks.has(idx) || !raw.marks || !raw.marks[idx]) return;
        seenMarks.add(idx);
        const m = raw.marks[idx];
        snaps.push({
          type: 'mark', index: idx, isMirror, space: m.space,
          width: m.width || 2,
          points: m.points.map((p) => [p[0], p[1]])
        });
      } else if (type === 'region') {
        if (seenRegions.has(idx) || !raw.regions || !raw.regions[idx]) return;
        seenRegions.add(idx);
        const r = raw.regions[idx];
        snaps.push({
          type: 'region', index: idx, isMirror, space: r.space,
          anchors: r.anchors.map((a) => ({
            x: a.x, y: a.y,
            inX: a.inX !== undefined ? a.inX : a.x,
            inY: a.inY !== undefined ? a.inY : a.y,
            outX: a.outX !== undefined ? a.outX : a.x,
            outY: a.outY !== undefined ? a.outY : a.y
          }))
        });
      }
    };
    for (let i = 0; i < selectedItems.length; i++) {
      const it = selectedItems[i];
      pushSnap(it.type, it.index, false);
      if (it.mirrorIndex >= 0 && it.mirrorIndex !== it.index) {
        pushSnap(it.type, it.mirrorIndex, true);
      }
    }
    return snaps;
  }

  function computeSnapshotCenterPart(snaps, includeMirror) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < snaps.length; i++) {
      const s = snaps[i];
      if (!!s.isMirror !== !!includeMirror) continue;
      if (s.type === 'mark') {
        for (let j = 0; j < s.points.length; j++) {
          const x = s.points[j][0], y = s.points[j][1];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      } else {
        for (let j = 0; j < s.anchors.length; j++) {
          const a = s.anchors[j];
          if (a.x < minX) minX = a.x; if (a.x > maxX) maxX = a.x;
          if (a.y < minY) minY = a.y; if (a.y > maxY) maxY = a.y;
        }
      }
    }
    if (!isFinite(minX)) return { x: 0, y: 0 };
    return { x: (minX + maxX) * 0.5, y: (minY + maxY) * 0.5 };
  }

  function applySelectionMove(raw, partId, snaps, startW, curW) {
    const p0 = fromPartCanvas(partId, startW);
    const p1 = fromPartCanvas(partId, curW);
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const mirrorFlipX = partId !== 'leftArm' && partId !== 'rightArm';

    for (let i = 0; i < snaps.length; i++) {
      const s = snaps[i];
      const ddx = (s.isMirror && mirrorFlipX) ? -dx : dx;
      if (s.type === 'mark' && raw.marks[s.index]) {
        raw.marks[s.index].points = s.points.map((pt) => [
          round2(clamp(pt[0] + ddx, -400, 400)),
          round2(clamp(pt[1] + dy, -400, 400))
        ]);
      } else if (s.type === 'region' && raw.regions[s.index]) {
        raw.regions[s.index].anchors = s.anchors.map((a) => ({
          x: round2(clamp(a.x + ddx, -400, 400)),
          y: round2(clamp(a.y + dy, -400, 400)),
          inX: round2(clamp(a.inX + ddx, -400, 400)),
          inY: round2(clamp(a.inY + dy, -400, 400)),
          outX: round2(clamp(a.outX + ddx, -400, 400)),
          outY: round2(clamp(a.outY + dy, -400, 400))
        }));
      }
    }
  }

  function applySelectionScale(raw, snaps, scaleFactor) {
    const k = clamp(scaleFactor, 0.15, 5.0);
    const cMain = computeSnapshotCenterPart(snaps, false);
    const cMir = computeSnapshotCenterPart(snaps, true);
    for (let i = 0; i < snaps.length; i++) {
      const s = snaps[i];
      const c = s.isMirror ? cMir : cMain;
      if (s.type === 'mark' && raw.marks[s.index]) {
        const m = raw.marks[s.index];
        m.points = s.points.map((pt) => [
          round2(clamp(c.x + (pt[0] - c.x) * k, -400, 400)),
          round2(clamp(c.y + (pt[1] - c.y) * k, -400, 400))
        ]);
        if (m.kind === 'stroke') {
          m.width = round2(clamp(s.width * k, 0.2, 24));
        }
      } else if (s.type === 'region' && raw.regions[s.index]) {
        raw.regions[s.index].anchors = s.anchors.map((a) => ({
          x: round2(clamp(c.x + (a.x - c.x) * k, -400, 400)),
          y: round2(clamp(c.y + (a.y - c.y) * k, -400, 400)),
          inX: round2(clamp(c.x + (a.inX - c.x) * k, -400, 400)),
          inY: round2(clamp(c.y + (a.inY - c.y) * k, -400, 400)),
          outX: round2(clamp(c.x + (a.outX - c.x) * k, -400, 400)),
          outY: round2(clamp(c.y + (a.outY - c.y) * k, -400, 400))
        }));
      }
    }
  }

  function duplicateSelection() {
    const raw = getRaw();
    const api = API();
    if (!raw || !selectedItems.length) return;
    if (!raw.marks) raw.marks = [];
    const nextSel = [];
    const offset = 5;
    for (let i = 0; i < selectedItems.length; i++) {
      const it = selectedItems[i];
      if (it.type === 'mark' && raw.marks[it.index] && raw.marks.length < Spec.MAX_MARKS) {
        const src = raw.marks[it.index];
        const copy = JSON.parse(JSON.stringify(src));
        copy.points = copy.points.map((p) => [round2(clamp(p[0] + offset, -400, 400)), round2(clamp(p[1] + offset, -400, 400))]);
        raw.marks.push(copy);
        const newIdx = raw.marks.length - 1;
        let newMirIdx = -1;
        if (it.mirrorIndex >= 0 && raw.marks[it.mirrorIndex] && raw.marks.length < Spec.MAX_MARKS) {
          const mSrc = raw.marks[it.mirrorIndex];
          const mCopy = JSON.parse(JSON.stringify(mSrc));
          const flipX = selectedPartId !== 'leftArm' && selectedPartId !== 'rightArm';
          mCopy.points = mCopy.points.map((p) => [round2(clamp(p[0] + (flipX ? -offset : offset), -400, 400)), round2(clamp(p[1] + offset, -400, 400))]);
          raw.marks.push(mCopy);
          newMirIdx = raw.marks.length - 1;
        }
        nextSel.push({ type: 'mark', index: newIdx, mirrorIndex: newMirIdx });
      }
    }
    if (!nextSel.length) return;
    syncPartMarksByLayers(raw, selectedPartId);
    selectedItems = nextSel;
    notifyChange(true);
    renderPartInspector();
    updateSelectionBarUI();
    if (api) api.showToast('已复制选中图案并偏移');
  }

  function deleteSelection() {
    const raw = getRaw();
    if (!raw || !selectedItems.length) return;
    const delMarks = new Set();
    const delRegions = new Set();
    for (let i = 0; i < selectedItems.length; i++) {
      const it = selectedItems[i];
      if (it.type === 'mark') {
        delMarks.add(it.index);
        if (it.mirrorIndex >= 0) delMarks.add(it.mirrorIndex);
      } else if (it.type === 'region') {
        delRegions.add(it.index);
      }
    }
    if (delMarks.size > 0 && Array.isArray(raw.marks)) {
      raw.marks = raw.marks.filter((_, idx) => !delMarks.has(idx));
    }
    if (delRegions.size > 0 && Array.isArray(raw.regions)) {
      raw.regions = raw.regions.filter((_, idx) => !delRegions.has(idx));
    }
    selectedItems = [];
    selDrag = null;
    notifyChange(true);
    renderPartInspector();
    updateSelectionBarUI();
  }

  function nudgeSelection(dx, dy) {
    const raw = getRaw();
    if (!raw || !selectedItems.length) return;
    const snaps = snapshotSelectedItems(raw);
    const mirrorFlipX = selectedPartId !== 'leftArm' && selectedPartId !== 'rightArm';
    for (let i = 0; i < snaps.length; i++) {
      const s = snaps[i];
      const ddx = (s.isMirror && mirrorFlipX) ? -dx : dx;
      if (s.type === 'mark' && raw.marks[s.index]) {
        raw.marks[s.index].points = s.points.map((p) => [round2(clamp(p[0] + ddx, -400, 400)), round2(clamp(p[1] + dy, -400, 400))]);
      } else if (s.type === 'region' && raw.regions[s.index]) {
        raw.regions[s.index].anchors = s.anchors.map((a) => ({
          x: round2(clamp(a.x + ddx, -400, 400)),
          y: round2(clamp(a.y + dy, -400, 400)),
          inX: round2(clamp(a.inX + ddx, -400, 400)),
          inY: round2(clamp(a.inY + dy, -400, 400)),
          outX: round2(clamp(a.outX + ddx, -400, 400)),
          outY: round2(clamp(a.outY + dy, -400, 400))
        }));
      }
    }
    notifyChange(true);
    requestRedraw();
  }

  // Eraser: removes marks/regions near pointer in part space (using point-to-segment distance)
  function eraseAtPoint(space, pt) {
    const raw = getRaw();
    if (!raw) return false;
    const hitR = Math.max(4.5, brushSize * 1.45);
    const spacesToHit = [space];
    const ptsToHit = [pt];
    if (space === 'head') spacesToHit.push('skull');

    if (mirrorEnabled && PART_BY_ID[selectedPartId].canMirror) {
      const mir = mirrorSpaceAndPts(space, [pt]);
      if (mir) {
        spacesToHit.push(mir.space);
        ptsToHit.push(mir.pts[0]);
      }
    }

    let removed = false;
    const layers = ensurePartLayers(raw, selectedPartId);
    const curLayerId = activeLayerByPart[selectedPartId];
    const activeLayer = isFeatureLayerId(curLayerId) ? null : getActivePaintLayer(raw, selectedPartId);
    const targetLayerId = (curLayerId === '__feat:nose' || curLayerId === '__feat:mouth')
      ? curLayerId
      : (activeLayer ? activeLayer.id : null);
    const filterByActiveLayer = !!targetLayerId && (layers.length > 1 || isFeatureLayerId(curLayerId));
    if (raw.marks && raw.marks.length) {
      const before = raw.marks.length;
      raw.marks = raw.marks.filter((m) => {
        if (spacesToHit.indexOf(m.space) === -1) return true;
        if (m._hidden) return true;
        if (filterByActiveLayer && m._layerId !== targetLayerId) return true;
        const pts = m.points;
        if (!pts || !pts.length) return true;
        const tol = hitR + (m.width || 2) * 0.5;
        const polyPts = m.kind === 'polygon' && pts.length >= 3
          ? pts.map((p) => ({ x: p[0], y: p[1] }))
          : null;
        for (let k = 0; k < ptsToHit.length; k++) {
          const hp = ptsToHit[k];
          if (polyPts && Spec.pointInPolygon(hp, polyPts)) return false;
          if (pts.length === 1) {
            if (Math.hypot(pts[0][0] - hp.x, pts[0][1] - hp.y) <= tol) return false;
            continue;
          }
          for (let j = 0; j < pts.length - 1; j++) {
            const a = pts[j], b = pts[j + 1];
            if (distPointToSegment(hp.x, hp.y, a[0], a[1], b[0], b[1]) <= tol) {
              return false;
            }
          }
          if (polyPts) {
            const a = pts[pts.length - 1], b = pts[0];
            if (distPointToSegment(hp.x, hp.y, a[0], a[1], b[0], b[1]) <= tol) {
              return false;
            }
          }
        }
        return true;
      });
      if (raw.marks.length !== before) removed = true;
    }

    if (raw.regions && raw.regions.length) {
      const beforeR = raw.regions.length;
      raw.regions = raw.regions.filter((r) => {
        if (spacesToHit.indexOf(r.space) === -1) return true;
        const flat = Spec.flattenRegion(r.anchors);
        for (let k = 0; k < ptsToHit.length; k++) {
          const hp = ptsToHit[k];
          if (Spec.pointInPolygon(hp, flat)) return false;
          for (let j = 0; j < flat.length; j++) {
            const a = flat[j];
            const b = flat[(j + 1) % flat.length];
            if (distPointToSegment(hp.x, hp.y, a.x, a.y, b.x, b.y) <= hitR) return false;
          }
        }
        return true;
      });
      if (raw.regions.length !== beforeR) removed = true;
    }

    if (removed) {
      erasedDuringDrag = true;
      notifyChange(false);
    }
    return removed;
  }

  // Eyedropper / Smudge color sampler directly from rendered canvas pixels
  function sampleColorAtCanvasPt(sPt) {
    if (!ctx || !canvas || viewW <= 0 || viewH <= 0) return brushColor;
    const sx = canvas.width / viewW;
    const sy = canvas.height / viewH;
    const px = clamp(Math.round(sPt.x * sx), 0, canvas.width - 1);
    const py = clamp(Math.round(sPt.y * sy), 0, canvas.height - 1);
    try {
      const data = ctx.getImageData(px, py, 1, 1).data;
      if (data[3] < 20) return brushColor;
      return Spec.rgbToHex(data[0], data[1], data[2]);
    } catch (_) {
      return brushColor;
    }
  }

  function pointInPolygon(pt, poly) {
    if (!poly || poly.length < 3) return false;
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

  function findHitRegionIndex(skin, partId, unitSpace, wPt) {
    if (!skin || !skin.regions || !skin.regions.length) return -1;
    const spaces = partId === 'head' ? ['head', 'skull'] : [unitSpace];
    const mapFn = (p) => {
      if (partId === 'body') {
        return PART_VIEW.body.toCanvas({ x: p.x * (skin.shape.bodyWidth || 1), y: p.y });
      }
      return toPartCanvas(partId, p, unitSpace);
    };
    for (let i = skin.regions.length - 1; i >= 0; i--) {
      const r = skin.regions[i];
      if (spaces.indexOf(r.space) === -1 || !r.flat || r.flat.length < 3) continue;
      const poly = r.flat.map(mapFn);
      if (pointInPolygon(wPt, poly)) return i;
    }
    return -1;
  }

  function isPointInEarInner(skin, unitSpace, wPt) {
    if (!ctx || !skin) return false;
    const sign = unitSpace === 'leftEar' ? -1 : 1;
    const cx = unitSpace === 'leftEar' ? CW * 0.29 : CW * 0.71;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    traceEarTriangle(ctx, cx, CH * 0.80 - 10, sign, 1.25, 1.45, 1.0, skin.shape.earBaseWidth || 1, skin.shape.earPointiness || 1);
    const hit = ctx.isPointInPath(wPt.x, wPt.y);
    ctx.restore();
    return hit;
  }

  function markContainsPoint(m, pt) {
    const pts = m && m.points;
    if (!pts || !pts.length) return false;
    if (m.kind === 'polygon' && pts.length >= 3) {
      const poly = pts.map((p) => ({ x: p[0], y: p[1] }));
      if (Spec.pointInPolygon(pt, poly)) return true;
      for (let j = 0; j < pts.length; j++) {
        const a = pts[j], b = pts[(j + 1) % pts.length];
        if (distPointToSegment(pt.x, pt.y, a[0], a[1], b[0], b[1]) <= 3.2) return true;
      }
      return false;
    }
    const tol = Math.max(3.5, (m.width || 2) * 0.65);
    if (pts.length === 1) {
      return Math.hypot(pts[0][0] - pt.x, pts[0][1] - pt.y) <= tol;
    }
    for (let j = 0; j < pts.length - 1; j++) {
      const a = pts[j], b = pts[j + 1];
      if (distPointToSegment(pt.x, pt.y, a[0], a[1], b[0], b[1]) <= tol) return true;
    }
    return false;
  }

  function markBBox(m) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const pts = m && m.points || [];
    for (let i = 0; i < pts.length; i++) {
      const x = pts[i][0], y = pts[i][1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const pad = m.kind === 'stroke' ? Math.max(2.5, (m.width || 2) * 0.55) : 1.5;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  function marksTouchOrOverlap(a, b) {
    const ba = markBBox(a), bb = markBBox(b);
    if (ba.maxX < bb.minX || bb.maxX < ba.minX || ba.maxY < bb.minY || bb.maxY < ba.minY) return false;
    const ptsA = a.points || [], ptsB = b.points || [];
    const tol = (a.kind === 'stroke' ? Math.max(2.5, (a.width || 2) * 0.55) : 1.5)
              + (b.kind === 'stroke' ? Math.max(2.5, (b.width || 2) * 0.55) : 1.5);
    // Sample points from A against B (and vice-versa)
    const stepA = Math.max(1, Math.floor(ptsA.length / 18));
    for (let i = 0; i < ptsA.length; i += stepA) {
      const p = { x: ptsA[i][0], y: ptsA[i][1] };
      if (markContainsPoint(b, p)) return true;
      for (let j = 0; j < ptsB.length - 1; j++) {
        if (distPointToSegment(p.x, p.y, ptsB[j][0], ptsB[j][1], ptsB[j + 1][0], ptsB[j + 1][1]) <= tol) return true;
      }
    }
    const stepB = Math.max(1, Math.floor(ptsB.length / 18));
    for (let i = 0; i < ptsB.length; i += stepB) {
      const p = { x: ptsB[i][0], y: ptsB[i][1] };
      if (markContainsPoint(a, p)) return true;
    }
    return false;
  }

  function findHitMarkIndex(marks, spaces, pt) {
    if (!marks || !marks.length) return -1;
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i];
      if (!m || spaces.indexOf(m.space) === -1) continue;
      if (markContainsPoint(m, pt)) return i;
    }
    return -1;
  }

  function findEnclosingStrokeLoopIndex(marks, spaces, pt) {
    if (!marks || !marks.length) return -1;
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i];
      if (!m || m.kind !== 'stroke' || spaces.indexOf(m.space) === -1) continue;
      const pts = m.points;
      if (!pts || pts.length < 6) continue;
      const first = pts[0], last = pts[pts.length - 1];
      const bb = markBBox(m);
      const diag = Math.hypot(bb.maxX - bb.minX, bb.maxY - bb.minY);
      if (diag < 6) continue;
      const gap = Math.hypot(last[0] - first[0], last[1] - first[1]);
      // Treat as a closed hand-drawn loop if endpoints meet within 28% of loop diagonal (or <= 14 units)
      if (gap <= Math.max(14, diag * 0.28)) {
        const poly = pts.map((p) => ({ x: p[0], y: p[1] }));
        if (Spec.pointInPolygon(pt, poly)) return i;
      }
    }
    return -1;
  }

  function recolorConnectedMarks(marks, startIdx, spaces, newHex) {
    const start = marks[startIdx];
    if (!start) return 0;
    const origCol = String(start.color || '').toUpperCase().slice(0, 7);
    const visited = new Set([startIdx]);
    const queue = [startIdx];
    while (queue.length) {
      const idx = queue.shift();
      const cur = marks[idx];
      cur.color = newHex;
      for (let i = 0; i < marks.length; i++) {
        if (visited.has(i)) continue;
        const cand = marks[i];
        if (!cand || spaces.indexOf(cand.space) === -1) continue;
        if (String(cand.color || '').toUpperCase().slice(0, 7) !== origCol) continue;
        if (marksTouchOrOverlap(cur, cand)) {
          visited.add(i);
          queue.push(i);
        }
      }
    }
    return visited.size;
  }

  // Smart Paint Bucket (MS Paint-style):
  // 1) Recolor clicked user-drawn stroke/polygon (and connected same-color strokes)
  // 2) Fill inside a closed hand-drawn stroke loop (keeping the outline on top)
  // 3) Recolor clicked built-in/custom region
  // 4) Recolor innerEar / tailTip or part base palette
  function applyBucketToPart(partId, hex, wPt) {
    const raw = getRaw();
    const skin = getSkin();
    if (!raw || !skin) return;
    if (!raw.palette) raw.palette = {};
    const c = hex.toUpperCase();
    const api = API();

    const unitSpace = partId === 'ears'
      ? (wPt && wPt.x >= CW * 0.5 ? 'rightEar' : 'leftEar')
      : partId;

    // 0a. Hit-test user-drawn marks (topmost first) — recolors the clicked mark & connected same-color marks
    if (wPt && raw.marks && raw.marks.length) {
      const mapped = fromPartCanvas(partId, wPt);
      const spaces = mapped.space === 'head' ? ['head', 'skull'] : [mapped.space];
      const hitMarkIdx = findHitMarkIndex(raw.marks, spaces, mapped);
      if (hitMarkIdx !== -1) {
        let count = recolorConnectedMarks(raw.marks, hitMarkIdx, spaces, c);
        if (mirrorEnabled && PART_BY_ID[partId] && PART_BY_ID[partId].canMirror) {
          const mir = mirrorSpaceAndPts(mapped.space, [mapped]);
          if (mir) {
            const mirSpaces = mir.space === 'head' ? ['head', 'skull'] : [mir.space];
            const mIdx = findHitMarkIndex(raw.marks, mirSpaces, mir.pts[0]);
            if (mIdx !== -1 && mIdx !== hitMarkIdx) {
              count += recolorConnectedMarks(raw.marks, mIdx, mirSpaces, c);
            }
          }
        }
        notifyChange(true);
        renderPartInspector();
        if (api) api.showToast(count > 1 ? ('已将相连的 ' + count + ' 笔自绘色块改色为 ' + c) : ('已将自绘笔触/色块改色为 ' + c));
        return;
      }

      // 0b. Clicked inside a closed hand-drawn brush loop -> fill interior while keeping the outline on top
      const loopIdx = findEnclosingStrokeLoopIndex(raw.marks, spaces, mapped);
      if (loopIdx !== -1) {
        if (raw.marks.length < Spec.MAX_MARKS) {
          const loopMark = raw.marks[loopIdx];
          const fillPoly = {
            space: loopMark.space,
            kind: 'polygon',
            color: c,
            points: loopMark.points.map((p) => [p[0], p[1]])
          };
          if (brushAlpha < 0.999) fillPoly.alpha = round2(brushAlpha);
          raw.marks.splice(loopIdx, 0, fillPoly);
          if (mirrorEnabled && PART_BY_ID[partId] && PART_BY_ID[partId].canMirror && raw.marks.length < Spec.MAX_MARKS) {
            const mir = mirrorSpaceAndPts(mapped.space, [mapped]);
            if (mir) {
              const mirSpaces = mir.space === 'head' ? ['head', 'skull'] : [mir.space];
              const mLoopIdx = findEnclosingStrokeLoopIndex(raw.marks, mirSpaces, mir.pts[0]);
              if (mLoopIdx !== -1 && mLoopIdx !== loopIdx + 1) {
                const mLoop = raw.marks[mLoopIdx];
                const mFill = {
                  space: mLoop.space,
                  kind: 'polygon',
                  color: c,
                  points: mLoop.points.map((p) => [p[0], p[1]])
                };
                if (brushAlpha < 0.999) mFill.alpha = round2(brushAlpha);
                raw.marks.splice(mLoopIdx, 0, mFill);
              }
            }
          }
          notifyChange(true);
          renderPartInspector();
          if (api) api.showToast('已在闭合线条内填充颜色 ' + c);
          return;
        }
      }
    }

    // 1. Hit-test existing custom regions (topmost first) — e.g. tuxedo cat's white lower face
    if (wPt && raw.regions && raw.regions.length && skin.regions && skin.regions.length) {
      const hitIdx = findHitRegionIndex(skin, partId, unitSpace, wPt);
      if (hitIdx !== -1 && raw.regions[hitIdx]) {
        raw.regions[hitIdx].fill = c;
        let mirrorCount = 0;
        if (mirrorEnabled && PART_BY_ID[partId] && PART_BY_ID[partId].canMirror) {
          const mirrorSpace = partId === 'ears'
            ? (unitSpace === 'leftEar' ? 'rightEar' : 'leftEar')
            : unitSpace;
          const mirrorPt = { x: CW - wPt.x, y: wPt.y };
          const mIdx = findHitRegionIndex(skin, partId, mirrorSpace, mirrorPt);
          if (mIdx !== -1 && mIdx !== hitIdx && raw.regions[mIdx]) {
            raw.regions[mIdx].fill = c;
            mirrorCount = 1;
          }
        }
        notifyChange(true);
        renderPartInspector();
        if (api) api.showToast(mirrorCount ? ('已对称填充花纹色块为 ' + c) : ('已填充花纹色块为 ' + c));
        return;
      }
    }

    // 2. Hit-test built-in sub-regions: inner ear triangle & tail tip
    if (partId === 'ears' && wPt && skin.palette && skin.palette.earInner && isPointInEarInner(skin, unitSpace, wPt)) {
      raw.palette.earInner = c;
      notifyChange(true);
      renderPartInspector();
      if (api) api.showToast('已将「内耳」颜色填充为 ' + c);
      return;
    }
    if (partId === 'tail' && wPt && skin.palette && skin.palette.tailTip) {
      const tipStart = toPartCanvas('tail', { x: 76, y: 0 });
      if (wPt.x >= tipStart.x) {
        raw.palette.tailTip = c;
        notifyChange(true);
        renderPartInspector();
        if (api) api.showToast('已将「尾尖」颜色填充为 ' + c);
        return;
      }
    }

    // 3. Fallback: fill clicked part's base palette color
    if (partId === 'head') {
      raw.palette.headBody = c;
      delete raw.palette.bodyShade;
      if (raw.partGradients) delete raw.partGradients.head;
    } else if (partId === 'body') {
      raw.palette.body = c;
      delete raw.palette.bodyShade;
      if (raw.partGradients) delete raw.partGradients.body;
    } else if (partId === 'ears') {
      raw.palette.earOuter = c;
      if (raw.partGradients) {
        delete raw.partGradients.leftEar;
        delete raw.partGradients.rightEar;
      }
    } else if (partId === 'leftArm' || partId === 'rightArm') {
      raw.palette.legs = c;
      raw.idleLegs = 'legs';
      if (raw.partGradients) {
        delete raw.partGradients[partId];
        if (mirrorEnabled) {
          delete raw.partGradients.leftArm;
          delete raw.partGradients.rightArm;
        }
      }
    } else if (partId === 'hindLeg') {
      raw.palette.hindLeg = c;
      if (raw.partGradients) delete raw.partGradients.hindLeg;
    } else if (partId === 'tail') {
      raw.palette.tail = c;
      if (raw.partGradients) delete raw.partGradients.tail;
    }
    notifyChange(true);
    renderPartInspector();
    const part = PART_BY_ID[partId];
    if (api && part) api.showToast('已将「' + (partId === 'ears' ? '外耳' : part.label) + '」底色填充为 ' + c);
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

    // Full-bleed atelier studio dot grid spanning the entire canvas edge-to-edge
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
      if (zoomT < 1) {
        ctx.globalAlpha = clamp(zoomT * 1.15, 0.25, 1);
      }
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
  // Part Paint Viewport Zoom & Pan Helpers (Full-Bleed Isotropic Projection)
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

  function setPanToolActive(on) {
    panToolActive = !!on;
    if (panToggleBtn) panToggleBtn.classList.toggle('active', panToolActive);
    if (canvas && mode === 'part') {
      canvas.style.cursor = panToolActive ? 'grab' : (activeTool === 'eyedropper' || activeTool === 'bucket' ? 'crosshair' : 'none');
    }
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
    const isDesktopSplit = !!(workbenchEl && workbenchEl.classList.contains('mode-editing') && window.innerWidth > 1040);
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
    const catCanvas = document.getElementById('cat-canvas');
    const catFrame = document.getElementById('canvas-frame');
    if (catCanvas && catFrame) {
      if (isDesktopSplit) {
        const w = catFrame.clientWidth;
        const h = catFrame.clientHeight;
        if (w > 20 && h > 20) {
          const sc = Math.min(w / 720, h / 640);
          catCanvas.style.width = Math.floor(720 * sc) + 'px';
          catCanvas.style.height = Math.floor(640 * sc) + 'px';
        }
      } else {
        catCanvas.style.width = '';
        catCanvas.style.height = '';
      }
    }
  }

  function scheduleFitCanvases() {
    requestAnimationFrame(() => {
      fitStageCanvases();
      requestRedraw();
    });
  }

  // -------------------------------------------------------------------------
  // State Transitions: Hero -> Exploded -> Part
  // -------------------------------------------------------------------------
  function restoreAutoHindPose() {
    if (!autoHindPoseActive) return;
    autoHindPoseActive = false;
    const api = API();
    if (api && typeof api.setPose === 'function') api.setPose('idle');
  }

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
        activeCornerTab === 'body' ? '身材与部位配色' : '图层叠放（上盖下）';
    }
  }

  function enterExplodedMode(animate) {
    mode = 'exploded';
    hoverPartId = null;
    mountedInspectorKey = '';
    spacePanHeld = false;
    clearSelection();
    restoreAutoHindPose();
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
    scheduleFitCanvases();
    requestRedraw();
  }

  function openPartEditor(partId) {
    if (!PART_BY_ID[partId]) return;
    selectedPartId = partId;
    mode = 'part';
    hoverPartId = null;
    clearSelection();
    mirrorEnabled = PART_BY_ID[partId].defaultMirror;
    if (mirrorToggleEl) {
      mirrorToggleEl.checked = mirrorEnabled;
      mirrorToggleEl.disabled = !PART_BY_ID[partId].canMirror;
    }
    const api = API();
    if (partId === 'hindLeg') {
      autoHindPoseActive = true;
      if (api && typeof api.setPose === 'function') api.setPose('hindFoot');
    } else {
      restoreAutoHindPose();
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
    updatePartPillsUI();
    renderPartInspector();
    scheduleFitCanvases();
    requestRedraw();
  }

  function backToExploded() {
    mode = 'exploded';
    drawing = false;
    draftPts = [];
    cursorCanvasPt = null;
    mountedInspectorKey = '';
    spacePanHeld = false;
    clearSelection();
    restoreAutoHindPose();
    if (partHeaderEl) partHeaderEl.classList.remove('is-part');
    if (partBackBtn) partBackBtn.hidden = true;
    if (quickToolsEl) quickToolsEl.hidden = true;
    if (activeLayerPillEl) activeLayerPillEl.hidden = true;
    if (floatingCornerEl) floatingCornerEl.hidden = true;
    setCornerTab(null);
    if (window.__kuroSetDecoDockCollapsed) window.__kuroSetDecoDockCollapsed(false);
    resetPartViewport();
    explodeT = 1;
    explodeTarget = 1;
    zoomT = 0;
    zoomTarget = 0;
    updatePartPillsUI();
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
  // Contextual Per-Part Inspector (2-4 Sliders + Part Colors + Gradient Toggle)
  // -------------------------------------------------------------------------
  let lastVisibleMouthHex = '#6E5C54';
  let lastVisibleNoseHex = '#EB9CA8';

  function isMouthHidden(pal) {
    return !!(pal && pal.mouth && pal.mouth.a !== undefined && pal.mouth.a < 0.01);
  }

  function isNoseHidden(pal) {
    return !!(pal && (!pal.nose || (pal.nose.a !== undefined && pal.nose.a < 0.01)));
  }

  function setNoseHidden(raw, hide) {
    if (!raw) return;
    if (!raw.palette) raw.palette = {};
    if (hide) {
      const curNose = raw.palette.nose;
      if (curNose && Spec.isValidHex(curNose)) {
        const parsed = Spec.parseHexColor(curNose);
        if (parsed && parsed.a >= 0.01) lastVisibleNoseHex = curNose.slice(0, 7).toUpperCase();
      }
      raw.palette.nose = '#00000000';
    } else {
      const noseInp = inspectorEl && inspectorEl.querySelector('[data-ctx-pal="nose"]');
      raw.palette.nose = (noseInp && Spec.isValidHex(noseInp.value) ? noseInp.value.toUpperCase() : lastVisibleNoseHex) || '#EB9CA8';
    }
  }

  function setMouthHidden(raw, hide) {
    if (!raw) return;
    if (!raw.palette) raw.palette = {};
    if (hide) {
      const curMouth = raw.palette.mouth;
      if (curMouth && Spec.isValidHex(curMouth)) {
        const parsed = Spec.parseHexColor(curMouth);
        if (parsed && parsed.a >= 0.01) lastVisibleMouthHex = curMouth.slice(0, 7).toUpperCase();
      }
      raw.palette.mouth = '#00000000';
    } else {
      const mouthInp = inspectorEl && inspectorEl.querySelector('[data-ctx-pal="mouth"]');
      raw.palette.mouth = (mouthInp && Spec.isValidHex(mouthInp.value) ? mouthInp.value.toUpperCase() : lastVisibleMouthHex) || '#6E5C54';
    }
  }

  function getPaletteHexForChip(pal, key) {
    if (key === 'headBody') return colorToHex(pal.headBody || pal.body, '#1A1A1E');
    if (key === 'belly') return colorToHex(pal.belly || pal.body, '#FFFFFF');
    if (key === 'tailTip') return colorToHex(pal.tailTip || pal.tail, '#FFFFFF');
    if (key === 'hindLeg') return colorToHex(pal.hindLeg || pal.legs, '#1A1A1E');
    if (key === 'hindPaw') return colorToHex(pal.hindPaw || pal.paws, '#FFFFFF');
    if (key === 'irisLeft') return colorToHex(pal.irisLeft || pal.iris, '#D2E83A');
    if (key === 'irisRight') return colorToHex(pal.irisRight || pal.iris, '#D2E83A');
    if (key === 'pupil') return colorToHex(pal.pupil || pal.pupilLeft, '#141416');
    if (key === 'pupilLeft') return colorToHex(pal.pupilLeft || pal.pupil, '#141416');
    if (key === 'pupilRight') return colorToHex(pal.pupilRight || pal.pupil, '#141416');
    if (key === 'nose') {
      if (pal.nose && !isNoseHidden(pal)) return colorToHex(pal.nose, lastVisibleNoseHex);
      return lastVisibleNoseHex;
    }
    if (key === 'mouth') {
      if (pal.mouth && !isMouthHidden(pal)) return colorToHex(pal.mouth, lastVisibleMouthHex);
      return lastVisibleMouthHex;
    }
    return colorToHex(pal[key], '#1A1A1E');
  }

  function syncInspectorValues(skin, gradFrom, gradTo, gradStop) {
    if (!inspectorEl) return;
    const pal = skin.palette;
    const shape = skin.shape;

    const syncPalInputs = (root) => {
      if (!root) return;
      const pInputs = root.querySelectorAll('[data-ctx-pal]');
      for (let i = 0; i < pInputs.length; i++) {
        const inp = pInputs[i];
        if (inp === document.activeElement) continue;
        const hex = getPaletteHexForChip(pal, inp.dataset.ctxPal);
        if (inp.value.toUpperCase() !== hex.toUpperCase()) inp.value = hex;
      }
    };
    syncPalInputs(inspectorEl);
    syncPalInputs(layersPaneEl);

    const hideMouthCb = inspectorEl.querySelector('#ctx-hide-mouth');
    if (hideMouthCb) {
      hideMouthCb.checked = isMouthHidden(pal);
    }
    const hideNoseCb = inspectorEl.querySelector('#ctx-hide-nose');
    if (hideNoseCb) {
      hideNoseCb.checked = isNoseHidden(pal);
    }

    const gFrom = inspectorEl.querySelector('#ctx-grad-from');
    const gTo = inspectorEl.querySelector('#ctx-grad-to');
    const gStop = inspectorEl.querySelector('#ctx-grad-stop');
    if (gFrom && gFrom !== document.activeElement && gFrom.value.toUpperCase() !== gradFrom.toUpperCase()) {
      gFrom.value = gradFrom;
    }
    if (gTo && gTo !== document.activeElement && gTo.value.toUpperCase() !== gradTo.toUpperCase()) {
      gTo.value = gradTo;
    }
    if (gStop && gStop !== document.activeElement) {
      gStop.value = String(gradStop);
    }

    const sInputs = inspectorEl.querySelectorAll('[data-ctx-shape]');
    for (let i = 0; i < sInputs.length; i++) {
      const inp = sInputs[i];
      const key = inp.dataset.ctxShape;
      const range = Spec.SHAPE_RANGES[key];
      const def = range ? range[2] : 1;
      const val = typeof shape[key] === 'number' ? shape[key] : def;
      if (inp !== document.activeElement) {
        inp.value = String(val);
      }
      const unit = inp.dataset.unit || '';
      const valSpan = inp.parentElement ? inp.parentElement.querySelector('.ctx-val') : null;
      if (valSpan) {
        valSpan.textContent = (unit === 'px' ? Math.round(val) : Number(val).toFixed(2)) + unit;
      }
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

    const gradSpace = partId === 'ears' ? 'leftEar' : partId;
    const rawGrad = raw.partGradients && raw.partGradients[gradSpace];
    const hasGrad = !!(rawGrad && Spec.isValidHex(rawGrad.from) && Spec.isValidHex(rawGrad.to));
    let gradFrom = colorToHex(partId === 'head' ? (pal.headBody || pal.body) : pal.body, '#1A1A1E');
    let gradTo = colorToHex(pal.paws, '#FFFFFF');
    if (hasGrad) {
      gradFrom = rawGrad.from;
      gradTo = rawGrad.to;
    } else if (partId === 'leftArm' || partId === 'rightArm') {
      gradFrom = colorToHex(pal.belly || pal.body, '#FFFFFF');
      gradTo = colorToHex(pal.legs, '#1A1A1E');
    } else if (partId === 'hindLeg') {
      gradFrom = colorToHex(pal.hindLeg || pal.legs, '#1A1A1E');
      gradTo = colorToHex(pal.hindPaw || pal.paws, '#FFFFFF');
    }
    const gradStop = hasGrad && typeof rawGrad.stop === 'number' ? rawGrad.stop : 0.52;

    const partLayers = ensurePartLayers(raw, partId);
    const curLayerId = activeLayerByPart[partId];
    const activePaint = isFeatureLayerId(curLayerId) ? null : getActivePaintLayer(raw, partId);
    const layerSig = partLayers.map((l) => l.id + ':' + (l.visible !== false ? '1' : '0') + ':' + countLayerMarks(raw, partId, l.id)).join(',');
    const noseHidFlag = partId === 'head' ? (isNoseHidden(pal) ? '1' : '0') : '0';
    const mouthHidFlag = partId === 'head' ? (isMouthHidden(pal) ? '1' : '0') : '0';
    const noseCnt = partId === 'head' ? countLayerMarks(raw, 'head', '__feat:nose') : 0;
    const mouthCnt = partId === 'head' ? countLayerMarks(raw, 'head', '__feat:mouth') : 0;
    const featVisSig = (pal.earInner ? '1' : '0') + (pal.pawPads ? '1' : '0') + (pal.tailTip ? '1' : '0');

    updateActiveLayerPillUI(raw, partId);

    // Preserve live DOM inputs while dragging sliders / picking colors on the same part!
    const nextKey = partId + '|' + (hasGrad ? '1' : '0') + '|' + curLayerId + '|' + layerSig + '|' + noseHidFlag + mouthHidFlag + '|' + noseCnt + ',' + mouthCnt + '|' + featVisSig;
    if (mountedInspectorKey === nextKey && inspectorEl.childElementCount > 0) {
      syncInspectorValues(skin, gradFrom, gradTo, gradStop);
      return;
    }
    mountedInspectorKey = nextKey;

    let colorsHtml = '';
    let slidersHtml = '';

    if (partId === 'leftArm' || partId === 'rightArm') {
      colorsHtml =
        colorChip('手臂毛色', 'legs', colorToHex(pal.legs, '#1A1A1E')) +
        colorChip('小爪颜色', 'paws', colorToHex(pal.paws, '#FFFFFF')) +
        colorChip('肉垫颜色', 'pawPads', colorToHex(pal.pawPads, '#F3A6B2'));
      slidersHtml =
        sliderRow('双手间距', 'armSpacing', 0.55, 1.60, 0.02, shape.armSpacing || 1.0, '×') +
        sliderRow('根部高低', 'armRootY', -18, 18, 1, shape.armRootY || 0, 'px') +
        sliderRow('手臂长短', 'armLength', 0.65, 1.45, 0.02, shape.armLength || 1.0, '×') +
        sliderRow('双爪错落', 'pawStagger', 0, 1, 0.05, shape.pawStagger != null ? shape.pawStagger : 1.0, '');
    } else if (partId === 'hindLeg') {
      colorsHtml =
        colorChip('后腿毛色', 'hindLeg', colorToHex(pal.hindLeg || pal.legs, '#1A1A1E')) +
        colorChip('后爪颜色', 'hindPaw', colorToHex(pal.hindPaw || pal.paws, '#FFFFFF')) +
        colorChip('肉垫颜色', 'pawPads', colorToHex(pal.pawPads, '#F3A6B2'));
      slidersHtml =
        sliderRow('根部左右', 'hindLegRootX', -16, 16, 1, shape.hindLegRootX || 0, 'px') +
        sliderRow('根部高低', 'hindLegRootY', -14, 14, 1, shape.hindLegRootY || 0, 'px') +
        sliderRow('后腿粗细', 'hindLegWidth', 0.70, 1.45, 0.02, shape.hindLegWidth || 1.0, '×') +
        sliderRow('伸出长度', 'hindLegReach', 0.75, 1.35, 0.02, shape.hindLegReach || 1.0, '×');
    } else if (partId === 'head') {
      const mouthHidden = isMouthHidden(pal);
      const noseHidden = isNoseHidden(pal);
      if (pal.mouth && !mouthHidden) {
        lastVisibleMouthHex = colorToHex(pal.mouth, lastVisibleMouthHex);
      }
      if (pal.nose && !noseHidden) {
        lastVisibleNoseHex = colorToHex(pal.nose, lastVisibleNoseHex);
      }
      colorsHtml =
        colorChip('头部底色', 'headBody', colorToHex(pal.headBody || pal.body, '#1A1A1E')) +
        colorChip('左眼', 'irisLeft', colorToHex(pal.irisLeft || pal.iris, '#D2E83A')) +
        colorChip('右眼', 'irisRight', colorToHex(pal.irisRight || pal.iris, '#D2E83A')) +
        colorChip('瞳孔', 'pupil', colorToHex(pal.pupil || pal.pupilLeft, '#141416')) +
        colorChip('鼻尖', 'nose', getPaletteHexForChip(pal, 'nose')) +
        '<label class="ctx-grad-toggle" title="隐藏默认纯色鼻子后，可直接用画笔在鼻形虚线框内画多色/花鼻子">' +
          '<input type="checkbox" id="ctx-hide-nose"' + (noseHidden ? ' checked' : '') + ' />' +
          '<span>隐藏鼻子</span>' +
        '</label>' +
        colorChip('嘴巴', 'mouth', getPaletteHexForChip(pal, 'mouth')) +
        '<label class="ctx-grad-toggle">' +
          '<input type="checkbox" id="ctx-hide-mouth"' + (mouthHidden ? ' checked' : '') + ' />' +
          '<span>隐藏嘴巴</span>' +
        '</label>' +
        colorChip('胡须', 'whiskers', colorToHex(pal.whiskers, '#DCDCDC'));
      slidersHtml =
        sliderRow('头部大小', 'headScale', 0.90, 1.15, 0.01, shape.headScale || 1.0, '×') +
        sliderRow('腮帮圆润', 'cheekFullness', 0.85, 1.25, 0.01, shape.cheekFullness || 1.0, '×');
    } else if (partId === 'ears') {
      colorsHtml =
        colorChip('外耳毛色', 'earOuter', colorToHex(pal.earOuter, '#1A1A1E')) +
        colorChip('内耳颜色', 'earInner', colorToHex(pal.earInner, '#F3B4BE'));
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
        colorChip('尾巴底色', 'tail', colorToHex(pal.tail, '#1A1A1E')) +
        colorChip('尾尖颜色', 'tailTip', colorToHex(pal.tailTip || pal.tail, '#FFFFFF'));
      slidersHtml =
        sliderRow('尾巴长度', 'tailLength', 0.70, 1.30, 0.02, shape.tailLength || 1.0, '×') +
        sliderRow('尾巴粗细', 'tailThickness', 0.70, 1.50, 0.02, shape.tailThickness || 1.0, '×') +
        sliderRow('尾根高低', 'tailRootY', -14, 14, 1, shape.tailRootY || 0, 'px');
    }

    // Build PS-style full clickable & editable layer stack (topmost layer rendered first)
    const miniChip = (label, palKey, hex) =>
      '<label class="ctx-mini-chip"><span>' + label + '</span><input type="color" data-ctx-pal="' + palKey + '" value="' + hex + '" /></label>';

    const buildInlineFeatureEditor = (featId) => {
      if (curLayerId !== featId) return '';
      if (featId === '__feat:eyes') {
        return '<div class="ctx-layer-inline">' +
          '<div class="ctx-inline-row">' +
            miniChip('左眼', 'irisLeft', getPaletteHexForChip(pal, 'irisLeft')) +
            miniChip('右眼', 'irisRight', getPaletteHexForChip(pal, 'irisRight')) +
            miniChip('左瞳', 'pupilLeft', getPaletteHexForChip(pal, 'pupilLeft')) +
            miniChip('右瞳', 'pupilRight', getPaletteHexForChip(pal, 'pupilRight')) +
          '</div>' +
          '<div class="ctx-inline-tip">直接点击画布上的左/右眼虹膜或瞳孔也可直接上色（关掉右上「对称」可画异瞳）</div>' +
        '</div>';
      }
      if (featId === '__feat:nose') {
        return '<div class="ctx-layer-inline">' +
          '<div class="ctx-inline-row">' +
            miniChip('鼻尖纯色', 'nose', getPaletteHexForChip(pal, 'nose')) +
            '<button type="button" class="ctx-mini-btn" id="ctx-zoom-nose" title="放大并居中对准鼻子位置，方便精细涂画">放大看鼻子</button>' +
            (noseCnt > 0 ? '<button type="button" class="ctx-mini-btn danger" id="ctx-clear-nose-marks">清空手绘鼻</button>' : '') +
          '</div>' +
          '<div class="ctx-inline-tip">用油漆桶点画布可改纯色鼻；用画笔直接在鼻形框内涂画会自动切为多色手绘鼻子</div>' +
        '</div>';
      }
      if (featId === '__feat:mouth') {
        return '<div class="ctx-layer-inline">' +
          '<div class="ctx-inline-row">' +
            miniChip('嘴巴', 'mouth', getPaletteHexForChip(pal, 'mouth')) +
            miniChip('胡须', 'whiskers', colorToHex(pal.whiskers, '#DCDCDC')) +
            (mouthCnt > 0 ? '<button type="button" class="ctx-mini-btn danger" id="ctx-clear-mouth-marks">清空手绘嘴</button>' : '') +
          '</div>' +
          '<div class="ctx-inline-tip">隐藏默认嘴巴后可直接用画笔手绘特色嘴型；用油漆桶点画布可改嘴巴线色</div>' +
        '</div>';
      }
      if (featId === '__feat:earInner') {
        return '<div class="ctx-layer-inline">' +
          '<div class="ctx-inline-row">' +
            miniChip('内耳颜色', 'earInner', colorToHex(pal.earInner, '#F3B4BE')) +
          '</div>' +
          '<div class="ctx-inline-tip">直接点击画布上左/右内耳区域或在此调色，立即更新内耳颜色</div>' +
        '</div>';
      }
      if (featId === '__feat:paws') {
        const pawKey = partId === 'hindLeg' ? 'hindPaw' : 'paws';
        return '<div class="ctx-layer-inline">' +
          '<div class="ctx-inline-row">' +
            miniChip(partId === 'hindLeg' ? '后爪颜色' : '小爪颜色', pawKey, getPaletteHexForChip(pal, pawKey)) +
            miniChip('肉垫颜色', 'pawPads', colorToHex(pal.pawPads, '#F3A6B2')) +
          '</div>' +
          '<div class="ctx-inline-tip">直接点击画布底部的爪子或肉垫区域即可分别上色</div>' +
        '</div>';
      }
      if (featId === '__feat:tailTip') {
        return '<div class="ctx-layer-inline">' +
          '<div class="ctx-inline-row">' +
            miniChip('尾尖颜色', 'tailTip', getPaletteHexForChip(pal, 'tailTip')) +
          '</div>' +
          '<div class="ctx-inline-tip">直接点击尾巴右侧尾尖高亮区或在此改色，点击小眼睛可关闭尾尖分段</div>' +
        '</div>';
      }
      if (featId === '__feat:base') {
        const baseKey = partId === 'head' ? 'headBody' :
          (partId === 'ears' ? 'earOuter' :
          ((partId === 'leftArm' || partId === 'rightArm') ? 'legs' :
          (partId === 'hindLeg' ? 'hindLeg' : (partId === 'tail' ? 'tail' : 'body'))));
        return '<div class="ctx-layer-inline">' +
          '<div class="ctx-inline-row">' +
            miniChip('底色', baseKey, getPaletteHexForChip(pal, baseKey)) +
            '<button type="button" class="ctx-mini-btn" id="ctx-inline-grad-btn">' + (hasGrad ? '关闭渐变' : '开启组件渐变') + '</button>' +
          '</div>' +
          '<div class="ctx-inline-tip">点击画布直接填充该部位底色，也可前往右上「身材」调渐变过渡</div>' +
        '</div>';
      }
      return '';
    };

    const buildFeatureRow = (featId, title, badge, eyeFeatKey, isHiddenFeat) => {
      const isAct = curLayerId === featId;
      const eyeHtml = eyeFeatKey
        ? '<button type="button" class="ctx-layer-eye" data-layer-feature="' + eyeFeatKey + '" title="' + (isHiddenFeat ? '显示' : '隐藏') + '">' + (isHiddenFeat ? '🙈' : '👁') + '</button>'
        : '<span class="ctx-layer-dot"></span>';
      return '<div class="ctx-layer-row fixed-feature' + (isAct ? ' active' : '') + (isHiddenFeat ? ' is-hidden' : '') + '" data-layer-select="' + featId + '">' +
        eyeHtml +
        '<span class="ctx-layer-name">' + title + '</span>' +
        '<span class="ctx-layer-badge">' + (isAct ? '编辑中 · ' : '') + badge + '</span>' +
      '</div>' + buildInlineFeatureEditor(featId);
    };

    let layersListHtml = '';
    if (partId === 'head') {
      const nHid = isNoseHidden(pal);
      const mHid = isMouthHidden(pal);
      layersListHtml += buildFeatureRow('__feat:eyes', '眼睛层', '虹膜/瞳孔', null, false);
      layersListHtml += buildFeatureRow('__feat:nose', '鼻子层', nHid ? ('手绘 ' + noseCnt + ' 笔') : '纯色', 'nose', nHid);
      layersListHtml += buildFeatureRow('__feat:mouth', '嘴巴与胡须层', mHid ? ('手绘 ' + mouthCnt + ' 笔') : '默认', 'mouth', mHid);
    } else if (partId === 'ears') {
      layersListHtml += buildFeatureRow('__feat:earInner', '内耳层', pal.earInner ? '已开启' : '已隐藏', 'earInner', !pal.earInner);
    } else if (partId === 'leftArm' || partId === 'rightArm' || partId === 'hindLeg') {
      layersListHtml += buildFeatureRow('__feat:paws', partId === 'hindLeg' ? '后爪与肉垫层' : '爪子与肉垫层', '可点选上色', null, false);
    } else if (partId === 'tail') {
      layersListHtml += buildFeatureRow('__feat:tailTip', '尾尖层', pal.tailTip ? '已开启' : '已隐藏', 'tailTip', !pal.tailTip);
    }

    for (let li = partLayers.length - 1; li >= 0; li--) {
      const l = partLayers[li];
      const isAct = activePaint && l.id === activePaint.id;
      const isVis = l.visible !== false;
      const cnt = countLayerMarks(raw, partId, l.id);
      layersListHtml +=
        '<div class="ctx-layer-row' + (isAct ? ' active' : '') + (!isVis ? ' is-hidden' : '') + '" data-layer-select="' + l.id + '">' +
          '<button type="button" class="ctx-layer-eye" data-layer-toggle="' + l.id + '" title="' + (isVis ? '隐藏图层' : '显示图层') + '">' + (isVis ? '👁' : '🙈') + '</button>' +
          '<span class="ctx-layer-name">' + l.name + '</span>' +
          '<span class="ctx-layer-meta">' + cnt + ' 笔' + (isAct ? ' · 绘制中' : '') + '</span>' +
          '<div class="ctx-layer-ops">' +
            '<button type="button" class="ctx-layer-op" data-layer-up="' + l.id + '"' + (li === partLayers.length - 1 ? ' disabled' : '') + ' title="上移一层">↑</button>' +
            '<button type="button" class="ctx-layer-op" data-layer-down="' + l.id + '"' + (li === 0 ? ' disabled' : '') + ' title="下移一层">↓</button>' +
            '<button type="button" class="ctx-layer-op danger" data-layer-del="' + l.id + '" title="' + (partLayers.length > 1 ? '删除图层' : '清空该层笔触') + '">×</button>' +
          '</div>' +
        '</div>';
    }
    layersListHtml += buildFeatureRow('__feat:base', '底色 / 渐变层', hasGrad ? '渐变' : '纯色', null, false);

    const layersPanelHtml =
      '<div class="ctx-layers-panel">' +
        '<div class="ctx-layers-head">' +
          '<span class="ctx-layers-title">点任意层即可直接编辑</span>' +
          '<div class="ctx-layers-actions">' +
            (partId === 'head'
              ? '<button type="button" class="mini-btn" id="ctx-layer-nose-paint" title="切换到鼻子层并在鼻形框内手绘多色鼻子">画鼻子</button>'
              : '') +
            '<button type="button" class="mini-btn" id="ctx-layer-add">+ 新建图层</button>' +
          '</div>' +
        '</div>' +
        '<div class="ctx-layers-list">' + layersListHtml + '</div>' +
      '</div>';

    const layersHostEl = layersPaneEl || inspectorEl;
    if (layerCountEl) layerCountEl.textContent = String(partLayers.length);

    inspectorEl.innerHTML =
      '<div class="ctx-colors-row">' +
        colorsHtml +
        '<label class="ctx-grad-toggle">' +
          '<input type="checkbox" id="ctx-grad-enabled"' + (hasGrad ? ' checked' : '') + ' />' +
          '<span>组件渐变</span>' +
        '</label>' +
      '</div>' +
      (hasGrad
        ? '<div class="ctx-grad-bar">' +
            '<label class="ctx-color-chip"><span>起色</span><input type="color" id="ctx-grad-from" value="' + gradFrom + '" /></label>' +
            '<label class="ctx-color-chip"><span>终色</span><input type="color" id="ctx-grad-to" value="' + gradTo + '" /></label>' +
            '<label class="ctx-slider-mini"><span>过渡</span><input type="range" id="ctx-grad-stop" min="0.15" max="0.85" step="0.02" value="' + gradStop + '" /></label>' +
          '</div>'
        : '') +
      '<div class="ctx-sliders-grid">' + slidersHtml + '</div>';

    if (layersPaneEl) {
      layersPaneEl.innerHTML = layersPanelHtml;
    } else {
      inspectorEl.innerHTML += layersPanelHtml;
    }

    // Bind palette inputs across both Body & Layers tabs via one shared handler
    const applyPaletteEdit = (key, val) => {
      const r = getRaw();
      if (!r) return;
      if (!r.palette) r.palette = {};
      if (key === 'irisLeft') {
        if (!r.palette.irisRight && r.palette.iris) r.palette.irisRight = r.palette.iris;
        r.palette.irisLeft = val;
        r.palette.iris = r.palette.irisLeft || r.palette.irisRight;
      } else if (key === 'irisRight') {
        if (!r.palette.irisLeft && r.palette.iris) r.palette.irisLeft = r.palette.iris;
        r.palette.irisRight = val;
        r.palette.iris = r.palette.irisLeft || r.palette.irisRight;
      } else if (key === 'pupil') {
        r.palette.pupil = val;
        delete r.palette.pupilLeft;
        delete r.palette.pupilRight;
      } else if (key === 'pupilLeft' || key === 'pupilRight') {
        if (!r.palette.pupilLeft) r.palette.pupilLeft = getPaletteHexForChip(skin.palette, 'pupilLeft');
        if (!r.palette.pupilRight) r.palette.pupilRight = getPaletteHexForChip(skin.palette, 'pupilRight');
        r.palette[key] = val;
      } else if (key === 'body' || key === 'headBody') {
        r.palette[key] = val;
        delete r.palette.bodyShade;
      } else if (key === 'nose') {
        r.palette.nose = val;
        lastVisibleNoseHex = val;
        const hideNoseCb = inspectorEl.querySelector('#ctx-hide-nose');
        if (hideNoseCb && hideNoseCb.checked) hideNoseCb.checked = false;
      } else if (key === 'mouth') {
        r.palette.mouth = val;
        lastVisibleMouthHex = val;
        const hideMouthCb = inspectorEl.querySelector('#ctx-hide-mouth');
        if (hideMouthCb && hideMouthCb.checked) hideMouthCb.checked = false;
      } else if (key === 'belly') {
        const api = API();
        if (api && typeof api.applyPaletteChange === 'function') {
          api.applyPaletteChange('belly', val);
          requestRedraw();
          return;
        }
        r.palette.belly = val;
      } else {
        r.palette[key] = val;
      }
      if (key === 'legs') r.idleLegs = 'legs';
      notifyChange(false);
    };

    const bindPalRoot = (root) => {
      if (!root) return;
      const pInputs = root.querySelectorAll('[data-ctx-pal]');
      for (let i = 0; i < pInputs.length; i++) {
        pInputs[i].addEventListener('input', function () {
          applyPaletteEdit(this.dataset.ctxPal, this.value.toUpperCase());
        });
        pInputs[i].addEventListener('change', function () { notifyChange(true); });
      }
    };
    bindPalRoot(inspectorEl);
    if (layersPaneEl && layersPaneEl !== inspectorEl) bindPalRoot(layersPaneEl);

    const hideNoseCheck = inspectorEl.querySelector('#ctx-hide-nose');
    if (hideNoseCheck) {
      hideNoseCheck.addEventListener('change', function () {
        const r = getRaw();
        if (!r) return;
        setNoseHidden(r, this.checked);
        notifyChange(true);
        renderPartInspector();
      });
    }

    const hideMouthCheck = inspectorEl.querySelector('#ctx-hide-mouth');
    if (hideMouthCheck) {
      hideMouthCheck.addEventListener('change', function () {
        const r = getRaw();
        if (!r) return;
        setMouthHidden(r, this.checked);
        notifyChange(true);
        renderPartInspector();
      });
    }

    // Bind PS-style layer panel interactions (mounted inside layersPaneEl)
    const addLayerBtn = layersHostEl.querySelector('#ctx-layer-add');
    if (addLayerBtn) {
      addLayerBtn.addEventListener('click', function () {
        const r = getRaw();
        if (!r) return;
        const created = createPartLayer(r, partId);
        notifyChange(true);
        renderPartInspector();
        const api = API();
        if (api) api.showToast('已新建并切换到「' + created.name + '」');
      });
    }
    const nosePaintBtn = layersHostEl.querySelector('#ctx-layer-nose-paint');
    if (nosePaintBtn) {
      nosePaintBtn.addEventListener('click', function () {
        const r = getRaw();
        if (!r) return;
        activeLayerByPart.head = '__feat:nose';
        setNoseHidden(r, true);
        syncPartMarksByLayers(r, 'head');
        notifyChange(true);
        renderPartInspector();
        requestRedraw();
        const api = API();
        if (api) api.showToast('已切换到「鼻子层」，现在可在鼻形框内自由画多色鼻子');
      });
    }

    const zoomNoseBtn = layersHostEl.querySelector('#ctx-zoom-nose');
    if (zoomNoseBtn) {
      zoomNoseBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        const noseWorld = toPartCanvas('head', { x: 0, y: 8.2 });
        viewZoom = 2.6;
        const totalScale = fitScale * viewZoom;
        viewPanX = -(noseWorld.x - CW * 0.5) * totalScale;
        viewPanY = -(noseWorld.y - CH * 0.5) * totalScale;
        clampViewPan();
        updateZoomControlsUI();
        requestRedraw();
        const api = API();
        if (api) api.showToast('已放大并居中对准鼻子，画完可点右下角 100% 复位');
      });
    }

    const clearNoseMarksBtn = layersHostEl.querySelector('#ctx-clear-nose-marks');
    if (clearNoseMarksBtn) {
      clearNoseMarksBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        const r = getRaw();
        if (!r || !Array.isArray(r.marks)) return;
        r.marks = r.marks.filter((m) => !(m && (m.space === 'head' || m.space === 'skull') && m._layerId === '__feat:nose'));
        notifyChange(true);
        renderPartInspector();
      });
    }

    const clearMouthMarksBtn = layersHostEl.querySelector('#ctx-clear-mouth-marks');
    if (clearMouthMarksBtn) {
      clearMouthMarksBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        const r = getRaw();
        if (!r || !Array.isArray(r.marks)) return;
        r.marks = r.marks.filter((m) => !(m && (m.space === 'head' || m.space === 'skull') && m._layerId === '__feat:mouth'));
        notifyChange(true);
        renderPartInspector();
      });
    }

    const inlineGradBtn = layersHostEl.querySelector('#ctx-inline-grad-btn');
    if (inlineGradBtn) {
      inlineGradBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        const gradCb = inspectorEl.querySelector('#ctx-grad-enabled');
        if (gradCb) {
          gradCb.checked = !gradCb.checked;
          gradCb.dispatchEvent(new Event('change'));
        }
      });
    }

    const featEyes = layersHostEl.querySelectorAll('[data-layer-feature]');
    for (let i = 0; i < featEyes.length; i++) {
      featEyes[i].addEventListener('click', function (ev) {
        ev.stopPropagation();
        const feat = this.dataset.layerFeature;
        const r = getRaw();
        const sk = getSkin();
        if (!r || !sk) return;
        if (!r.palette) r.palette = {};
        if (feat === 'nose') setNoseHidden(r, !isNoseHidden(sk.palette));
        else if (feat === 'mouth') setMouthHidden(r, !isMouthHidden(sk.palette));
        else if (feat === 'earInner') {
          if (sk.palette.earInner) delete r.palette.earInner;
          else r.palette.earInner = '#F3B4BE';
        } else if (feat === 'tailTip') {
          if (sk.palette.tailTip) delete r.palette.tailTip;
          else r.palette.tailTip = '#FFFFFF';
        }
        notifyChange(true);
        renderPartInspector();
      });
    }

    const layerRows = layersHostEl.querySelectorAll('[data-layer-select]');
    for (let i = 0; i < layerRows.length; i++) {
      layerRows[i].addEventListener('click', function () {
        activeLayerByPart[partId] = this.dataset.layerSelect;
        renderPartInspector();
        requestRedraw();
      });
    }

    const toggleEyes = layersHostEl.querySelectorAll('[data-layer-toggle]');
    for (let i = 0; i < toggleEyes.length; i++) {
      toggleEyes[i].addEventListener('click', function (ev) {
        ev.stopPropagation();
        const lid = this.dataset.layerToggle;
        const r = getRaw();
        if (!r) return;
        const layers = ensurePartLayers(r, partId);
        const target = layers.find((l) => l.id === lid);
        if (!target) return;
        target.visible = target.visible === false ? true : false;
        syncPartMarksByLayers(r, partId);
        notifyChange(true);
        renderPartInspector();
      });
    }

    const moveLayer = (lid, delta) => {
      const r = getRaw();
      if (!r) return;
      const layers = ensurePartLayers(r, partId);
      const idx = layers.findIndex((l) => l.id === lid);
      const nextIdx = idx + delta;
      if (idx === -1 || nextIdx < 0 || nextIdx >= layers.length) return;
      const tmp = layers[idx];
      layers[idx] = layers[nextIdx];
      layers[nextIdx] = tmp;
      syncPartMarksByLayers(r, partId);
      notifyChange(true);
      renderPartInspector();
    };
    const upBtns = layersHostEl.querySelectorAll('[data-layer-up]');
    for (let i = 0; i < upBtns.length; i++) {
      upBtns[i].addEventListener('click', function (ev) { ev.stopPropagation(); moveLayer(this.dataset.layerUp, 1); });
    }
    const downBtns = layersHostEl.querySelectorAll('[data-layer-down]');
    for (let i = 0; i < downBtns.length; i++) {
      downBtns[i].addEventListener('click', function (ev) { ev.stopPropagation(); moveLayer(this.dataset.layerDown, -1); });
    }

    const delBtns = layersHostEl.querySelectorAll('[data-layer-del]');
    for (let i = 0; i < delBtns.length; i++) {
      delBtns[i].addEventListener('click', function (ev) {
        ev.stopPropagation();
        const lid = this.dataset.layerDel;
        const r = getRaw();
        if (!r) return;
        const layers = ensurePartLayers(r, partId);
        const spaces = getPartSpaces(partId);
        if (Array.isArray(r.marks)) {
          r.marks = r.marks.filter((m) => !(m && spaces.indexOf(m.space) !== -1 && m._layerId === lid));
        }
        if (layers.length > 1) {
          const idx = layers.findIndex((l) => l.id === lid);
          if (idx !== -1) layers.splice(idx, 1);
          if (activeLayerByPart[partId] === lid) {
            activeLayerByPart[partId] = layers[Math.min(idx, layers.length - 1)].id;
          }
        }
        syncPartMarksByLayers(r, partId);
        notifyChange(true);
        renderPartInspector();
      });
    }

    // Bind gradient controls
    const gradCheck = inspectorEl.querySelector('#ctx-grad-enabled');
    if (gradCheck) {
      gradCheck.addEventListener('change', function () {
        const r = getRaw();
        if (!r) return;
        if (!r.partGradients) r.partGradients = {};
        const targets = getGradientTargets(partId);
        if (this.checked) {
          for (let k = 0; k < targets.length; k++) {
            r.partGradients[targets[k]] = { from: gradFrom, to: gradTo, stop: gradStop };
          }
          if (partId === 'leftArm' || partId === 'rightArm') r.idleLegs = 'legs';
        } else {
          for (let k = 0; k < targets.length; k++) delete r.partGradients[targets[k]];
        }
        notifyChange(true);
        renderPartInspector();
        scheduleFitCanvases();
      });
    }
    const gFrom = inspectorEl.querySelector('#ctx-grad-from');
    const gTo = inspectorEl.querySelector('#ctx-grad-to');
    const gStop = inspectorEl.querySelector('#ctx-grad-stop');
    const applyGrad = (commit) => {
      const r = getRaw();
      if (!r || !gFrom || !gTo || !gStop) return;
      if (!r.partGradients) r.partGradients = {};
      const targets = getGradientTargets(partId);
      const val = { from: gFrom.value.toUpperCase(), to: gTo.value.toUpperCase(), stop: parseFloat(gStop.value) };
      for (let k = 0; k < targets.length; k++) r.partGradients[targets[k]] = Object.assign({}, val);
      notifyChange(commit);
    };
    if (gFrom) { gFrom.addEventListener('input', () => applyGrad(false)); gFrom.addEventListener('change', () => applyGrad(true)); }
    if (gTo) { gTo.addEventListener('input', () => applyGrad(false)); gTo.addEventListener('change', () => applyGrad(true)); }
    if (gStop) { gStop.addEventListener('input', () => applyGrad(false)); gStop.addEventListener('change', () => applyGrad(true)); }

    // Bind shape sliders
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
      sInputs[i].addEventListener('change', function () { notifyChange(true); });
    }
  }

  function getGradientTargets(partId) {
    if (partId === 'ears') return ['leftEar', 'rightEar'];
    if ((partId === 'leftArm' || partId === 'rightArm') && mirrorEnabled) return ['leftArm', 'rightArm'];
    return [partId];
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

  // -------------------------------------------------------------------------
  // Pointer, Wheel & Pinch Events on #exploded-canvas (Exploded Click + Zoom/Pan + WYSIWYG Painting)
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

      if (mode !== 'part') return;
      canvas.setPointerCapture(e.pointerId);

      // Two-finger pinch zoom & pan on touchscreens
      if (e.pointerType === 'touch') {
        activeTouches[e.pointerId] = sPt;
        const pair = getTouchPair();
        if (pair) {
          drawing = false;
          draftPts = [];
          panning = false;
          pinchPrev = pair;
          requestRedraw();
          return;
        }
      }

      // Panning via Hand button, Space+drag, middle button, or right button
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

      if (activeTool === 'select') {
        const raw = getRaw();
        const wPt = screenToWorldPt(sPt);
        if (!raw) return;
        const effScale = Math.max(0.25, fitScale * viewZoom);
        const curBox = selectedItems.length ? computeSelectionWorldBBox(raw, skin) : null;
        const handle = hitTestSelectionHandle(wPt, curBox, effScale);
        if (handle && curBox) {
          const cx = (curBox.minX + curBox.maxX) * 0.5;
          const cy = (curBox.minY + curBox.maxY) * 0.5;
          selDrag = {
            mode: 'scale',
            handle,
            centerW: { x: cx, y: cy },
            startDist: Math.max(8, Math.hypot(wPt.x - cx, wPt.y - cy)),
            startW: wPt,
            curW: wPt,
            snapshots: snapshotSelectedItems(raw),
            moved: false
          };
          requestRedraw();
          return;
        }
        if (curBox && wPt.x >= curBox.minX && wPt.x <= curBox.maxX && wPt.y >= curBox.minY && wPt.y <= curBox.maxY && !e.shiftKey) {
          selDrag = {
            mode: 'move',
            startW: wPt,
            curW: wPt,
            snapshots: snapshotSelectedItems(raw),
            moved: false
          };
          requestRedraw();
          return;
        }
        const hit = hitTestPatternAt(raw, skin, selectedPartId, wPt);
        if (hit) {
          if (e.shiftKey) {
            const existsIdx = selectedItems.findIndex((it) => it.type === hit.type && it.index === hit.index);
            if (existsIdx !== -1) selectedItems.splice(existsIdx, 1);
            else selectedItems.push(hit);
          } else {
            selectedItems = [hit];
          }
          updateSelectionBarUI();
          selDrag = {
            mode: 'move',
            startW: wPt,
            curW: wPt,
            snapshots: snapshotSelectedItems(raw),
            moved: false
          };
          requestRedraw();
          return;
        }
        if (!e.shiftKey) {
          selectedItems = [];
          updateSelectionBarUI();
        }
        selDrag = { mode: 'marquee', startW: wPt, curW: wPt };
        requestRedraw();
        return;
      }

      if (activeTool === 'eyedropper') {
        const picked = sampleColorAtCanvasPt(sPt);
        setBrushColor(picked);
        setTool(prevDrawTool);
        const api = API();
        if (api) api.showToast('已吸取颜色 ' + picked);
        return;
      }

      if (activeTool === 'bucket') {
        const raw = getRaw();
        const wPtB = screenToWorldPt(sPt);
        const mappedB = fromPartCanvas(selectedPartId, wPtB);
        if (raw && handleFeatureLayerCanvasAction(raw, skin, selectedPartId, sPt, wPtB, mappedB)) {
          return;
        }
        applyBucketToPart(selectedPartId, brushColor, wPtB);
        return;
      }

      const wPt = screenToWorldPt(sPt);
      const mapped = fromPartCanvas(selectedPartId, wPt);
      activeDrawSpace = mapped.space;

      if (activeTool === 'eraser') {
        drawing = true;
        erasedDuringDrag = false;
        eraseAtPoint(activeDrawSpace, mapped);
        requestRedraw();
        return;
      }

      const rawNow = getRaw();
      if (rawNow && handleFeatureLayerCanvasAction(rawNow, skin, selectedPartId, sPt, wPt, mapped)) {
        return;
      }

      if (activeTool === 'smudge') {
        smudgeColor = sampleColorAtCanvasPt(sPt);
      } else {
        smudgeColor = null;
      }

      drawing = true;
      draftPts = [{ x: mapped.x, y: mapped.y, p: e.pressure || 0.5, t: performance.now() }];
      requestRedraw();
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

      if (mode !== 'part') return;

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

      if (activeTool === 'select' && selDrag) {
        const raw = getRaw();
        if (!raw) return;
        if (selDrag.mode === 'marquee') {
          selDrag.curW = wPt;
          requestRedraw();
          return;
        }
        if (selDrag.mode === 'move') {
          selDrag.curW = wPt;
          if (Math.hypot(wPt.x - selDrag.startW.x, wPt.y - selDrag.startW.y) > 0.6) selDrag.moved = true;
          applySelectionMove(raw, selectedPartId, selDrag.snapshots, selDrag.startW, wPt);
          notifyChange(false);
          return;
        }
        if (selDrag.mode === 'scale') {
          const curDist = Math.max(4, Math.hypot(wPt.x - selDrag.centerW.x, wPt.y - selDrag.centerW.y));
          const factor = curDist / selDrag.startDist;
          if (Math.abs(factor - 1) > 0.01) selDrag.moved = true;
          applySelectionScale(raw, selDrag.snapshots, factor);
          notifyChange(false);
          return;
        }
      }

      if (!drawing) {
        if (panToolActive || spacePanHeld) {
          canvas.style.cursor = 'grab';
        } else if (activeTool === 'select') {
          const raw = getRaw();
          const effScale = Math.max(0.25, fitScale * viewZoom);
          const box = (raw && selectedItems.length) ? computeSelectionWorldBBox(raw, skin) : null;
          const h = hitTestSelectionHandle(wPt, box, effScale);
          if (h === 'nw' || h === 'se') canvas.style.cursor = 'nwse-resize';
          else if (h === 'ne' || h === 'sw') canvas.style.cursor = 'nesw-resize';
          else if (box && wPt.x >= box.minX && wPt.x <= box.maxX && wPt.y >= box.minY && wPt.y <= box.maxY) canvas.style.cursor = 'move';
          else canvas.style.cursor = 'default';
        } else {
          canvas.style.cursor = activeTool === 'eyedropper' || activeTool === 'bucket' ? 'crosshair' : 'none';
        }
        requestRedraw();
        return;
      }

      const mapped = fromPartCanvas(selectedPartId, wPt);
      if (activeTool === 'eraser') {
        eraseAtPoint(activeDrawSpace, mapped);
        requestRedraw();
        return;
      }

      const minStep = 0.45 / Math.max(1, viewZoom * 0.7);
      const prev = draftPts[draftPts.length - 1];
      if (!prev || Math.hypot(mapped.x - prev.x, mapped.y - prev.y) >= minStep) {
        draftPts.push({ x: mapped.x, y: mapped.y, p: e.pressure || 0.5, t: performance.now() });
      }
      requestRedraw();
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
        if (mode === 'part') {
          canvas.style.cursor = (panToolActive || spacePanHeld) ? 'grab' : (activeTool === 'select' ? 'default' : (activeTool === 'eyedropper' || activeTool === 'bucket' ? 'crosshair' : 'none'));
        }
        requestRedraw();
        return;
      }
      if (activeTool === 'select' && selDrag) {
        const drag = selDrag;
        selDrag = null;
        const raw = getRaw();
        if (drag.mode === 'marquee' && raw && skin) {
          const x0 = Math.min(drag.startW.x, drag.curW.x);
          const x1 = Math.max(drag.startW.x, drag.curW.x);
          const y0 = Math.min(drag.startW.y, drag.curW.y);
          const y1 = Math.max(drag.startW.y, drag.curW.y);
          if (x1 - x0 > 3 || y1 - y0 > 3) {
            const partSpaces = getPartSpaces(selectedPartId);
            const layers = ensurePartLayers(raw, selectedPartId);
            const curId = activeLayerByPart[selectedPartId];
            const activePaint = isFeatureLayerId(curId) ? null : getActivePaintLayer(raw, selectedPartId);
            const activeLayerId = (curId === '__feat:nose' || curId === '__feat:mouth') ? curId : (activePaint ? activePaint.id : null);
            const hitsAll = [];
            const hitsActive = [];
            const seenIdx = new Set();
            if (Array.isArray(raw.marks)) {
              for (let i = 0; i < raw.marks.length; i++) {
                const m = raw.marks[i];
                if (!m || m._hidden || partSpaces.indexOf(m.space) === -1 || !m.points || !m.points.length) continue;
                let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
                for (let j = 0; j < m.points.length; j++) {
                  const wp = partToWorld(selectedPartId, m.space, { x: m.points[j][0], y: m.points[j][1] }, skin);
                  if (wp.x < bMinX) bMinX = wp.x; if (wp.x > bMaxX) bMaxX = wp.x;
                  if (wp.y < bMinY) bMinY = wp.y; if (wp.y > bMaxY) bMaxY = wp.y;
                }
                if (bMaxX >= x0 && bMinX <= x1 && bMaxY >= y0 && bMinY <= y1) {
                  if (seenIdx.has(i)) continue;
                  const mirIdx = findMirrorItemIndex(raw, 'mark', i, selectedPartId);
                  if (mirIdx >= 0) seenIdx.add(mirIdx);
                  seenIdx.add(i);
                  const entry = { type: 'mark', index: i, mirrorIndex: mirIdx };
                  hitsAll.push(entry);
                  if (activeLayerId && m._layerId === activeLayerId) hitsActive.push(entry);
                }
              }
            }
            const chosen = (layers.length > 1 && hitsActive.length > 0) ? hitsActive : hitsAll;
            selectedItems = chosen;
            updateSelectionBarUI();
          }
        } else if ((drag.mode === 'move' || drag.mode === 'scale') && drag.moved) {
          notifyChange(true);
        }
        requestRedraw();
        return;
      }
      if (!drawing) return;
      drawing = false;
      if (activeTool === 'eraser') {
        if (erasedDuringDrag) notifyChange(true);
        erasedDuringDrag = false;
      } else {
        commitDraftStroke();
      }
      draftPts = [];
      smudgeColor = null;
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
  // Right-Side Live #cat-canvas Interactive Skeleton Handles ("调骨架")
  // -------------------------------------------------------------------------
  function toggleSkeletonMode(force) {
    skeletonMode = typeof force === 'boolean' ? force : !skeletonMode;
    activeSkeletonHandle = null;
    hoverSkeletonHandle = null;
    if (skeletonToggleBtn) {
      skeletonToggleBtn.classList.toggle('active', skeletonMode);
    }
    const api = API();
    if (api && skeletonMode) {
      if (!(mode === 'part' && selectedPartId === 'hindLeg')) {
        api.setPose('idle');
      }
      api.showToast('已开启「调骨架」，直接拖动小猫身上的橙色圆点即可调整间距、根部和长短');
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
    skeletonDragStart = {
      x: canvasPt.x,
      y: canvasPt.y,
      shape: Object.assign({}, skin.shape)
    };
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

    if (activeSkeletonHandle === 'armRootY') {
      raw.shape.armRootY = round2(clamp((orig.armRootY || 0) + dy, -18, 18));
    } else if (activeSkeletonHandle === 'armSpacingR') {
      raw.shape.armSpacing = round2(clamp((orig.armSpacing || 1) + dx / 24, 0.55, 1.60));
    } else if (activeSkeletonHandle === 'armSpacingL') {
      raw.shape.armSpacing = round2(clamp((orig.armSpacing || 1) - dx / 24, 0.55, 1.60));
    } else if (activeSkeletonHandle === 'armLength') {
      raw.shape.armLength = round2(clamp((orig.armLength || 1) + dy / 42, 0.65, 1.45));
    } else if (activeSkeletonHandle === 'earTip') {
      raw.shape.earSize = round2(clamp((orig.earSize || 1) - dy / 36, 0.80, 1.25));
      raw.shape.earSpacing = round2(clamp((orig.earSpacing || 1) + dx / 36, 0.65, 1.35));
    } else if (activeSkeletonHandle === 'bodyWidth') {
      raw.shape.bodyWidth = round2(clamp((orig.bodyWidth || 1) + dx / 44, 0.85, 1.35));
    } else if (activeSkeletonHandle === 'tailTip') {
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
    if (tool !== 'eyedropper' && tool !== 'bucket' && tool !== 'select' && tool !== 'eraser') {
      prevDrawTool = tool;
    }
    if (tool !== 'select') clearSelection();
    if (panToolActive) setPanToolActive(false);
    if (tool === 'bucket') {
      const api = API();
      if (api) api.showToast('油漆桶：点击内耳、花纹色块或底色区域直接上色');
    } else if (tool === 'select') {
      const api = API();
      if (api) api.showToast('选择框：点击或框选图案，拖动改位置、拖四角圆点缩放');
    }
    if (brushDockEl) {
      const btns = brushDockEl.querySelectorAll('[data-brush-tool]');
      for (let i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].dataset.brushTool === tool);
      }
    }
    if (quickToolsEl) {
      const qBtns = quickToolsEl.querySelectorAll('[data-quick-tool]');
      const qKey = tool === 'select' ? 'select' : (tool === 'eraser' ? 'eraser' : 'draw');
      for (let i = 0; i < qBtns.length; i++) {
        qBtns[i].classList.toggle('active', qBtns[i].dataset.quickTool === qKey);
      }
    }
    if (canvas && mode === 'part' && !panToolActive && !spacePanHeld) {
      canvas.style.cursor = tool === 'select' ? 'default' : (tool === 'eyedropper' || tool === 'bucket' ? 'crosshair' : 'none');
    }
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
    const raw = getRaw();
    if (!raw || mode !== 'part') return;
    const part = PART_BY_ID[selectedPartId];
    if (!part) return;
    const spaces = part.spaces.slice();
    if ((selectedPartId === 'leftArm' || selectedPartId === 'rightArm') && mirrorEnabled) {
      spaces.push('leftArm', 'rightArm');
    }
    raw.marks = (raw.marks || []).filter((m) => spaces.indexOf(m.space) === -1);
    raw.regions = (raw.regions || []).filter((r) => spaces.indexOf(r.space) === -1);
    if (raw.partGradients) {
      for (let i = 0; i < spaces.length; i++) delete raw.partGradients[spaces[i]];
    }
    clearSelection();
    notifyChange(true);
    renderPartInspector();
    const api = API();
    if (api) api.showToast('已清空「' + part.label + '」上的花纹');
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

    if (activeLayerPillEl) {
      activeLayerPillEl.addEventListener('click', () => {
        setCornerTab(activeCornerTab === 'layers' ? null : 'layers');
      });
    }
    selInfoEl = document.getElementById('ps-sel-info');
    skeletonToggleBtn = document.getElementById('btn-toggle-skeleton');

    // Bind PS top-right corner tabs & close button
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

    // Bind PS top-left quick mode bar (Select / Brush / Eraser)
    if (quickToolsEl) {
      const qBtns = quickToolsEl.querySelectorAll('[data-quick-tool]');
      for (let i = 0; i < qBtns.length; i++) {
        qBtns[i].addEventListener('click', function () {
          const q = this.dataset.quickTool;
          if (q === 'select') setTool('select');
          else if (q === 'eraser') setTool('eraser');
          else setTool(prevDrawTool || 'calligraphy');
        });
      }
    }

    // Bind Selection floating bar buttons
    const btnSelDup = document.getElementById('btn-sel-dup');
    const btnSelDel = document.getElementById('btn-sel-del');
    const btnSelClear = document.getElementById('btn-sel-clear');
    if (btnSelDup) btnSelDup.addEventListener('click', duplicateSelection);
    if (btnSelDel) btnSelDel.addEventListener('click', deleteSelection);
    if (btnSelClear) btnSelClear.addEventListener('click', clearSelection);
    sizeInput = document.getElementById('exploded-brush-size');
    sizeValEl = document.getElementById('exploded-brush-size-val');
    alphaInput = document.getElementById('exploded-brush-alpha');
    alphaValEl = document.getElementById('exploded-brush-alpha-val');
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

    // Part canvas keyboard shortcuts: Space hold-to-pan, +/- zoom, 0 reset
    const isTypingTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
      if (tag === 'INPUT' && el.type !== 'color' && el.type !== 'range' && el.type !== 'checkbox' && el.type !== 'button') return true;
      return false;
    };
    document.addEventListener('keydown', (e) => {
      if (mode !== 'part' || isTypingTarget(e.target)) return;
      if (e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!spacePanHeld) {
          spacePanHeld = true;
          if (canvas) canvas.style.cursor = 'grab';
          requestRedraw();
        }
        e.preventDefault();
      } else if ((e.key === '+' || e.key === '=') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setPartViewport(viewZoom * 1.25);
      } else if (e.key === '-' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setPartViewport(viewZoom / 1.25);
      } else if (e.key === '0' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        resetPartViewport();
      } else if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setTool('select');
      } else if ((e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setTool(prevDrawTool || 'calligraphy');
      } else if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setTool('eraser');
      } else if (e.key === 'Escape') {
        if (selectedItems.length > 0) { clearSelection(); e.preventDefault(); }
        else if (activeCornerTab) { setCornerTab(null); e.preventDefault(); }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && activeTool === 'select' && selectedItems.length > 0) {
        e.preventDefault();
        deleteSelection();
      } else if (activeTool === 'select' && selectedItems.length > 0 &&
                 (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        if (e.key === 'ArrowLeft') nudgeSelection(-step, 0);
        else if (e.key === 'ArrowRight') nudgeSelection(step, 0);
        else if (e.key === 'ArrowUp') nudgeSelection(0, -step);
        else if (e.key === 'ArrowDown') nudgeSelection(0, step);
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && spacePanHeld) {
        spacePanHeld = false;
        if (canvas && mode === 'part' && !panning) {
          canvas.style.cursor = panToolActive ? 'grab' : (activeTool === 'eyedropper' || activeTool === 'bucket' ? 'crosshair' : 'none');
        }
        requestRedraw();
      }
    });
    window.addEventListener('blur', () => {
      if (spacePanHeld) {
        spacePanHeld = false;
        requestRedraw();
      }
    });

    // Horizontal accessory carousel controls (wheel + left/right chevrons)
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
    if (decoLeftBtn && decoStrip) {
      decoLeftBtn.addEventListener('click', () => { decoStrip.scrollLeft -= 250; });
    }
    if (decoRightBtn && decoStrip) {
      decoRightBtn.addEventListener('click', () => { decoStrip.scrollLeft += 250; });
    }

    // Keep left & right canvases crisp and maximally fitted inside full-height equal-bottom columns
    window.addEventListener('resize', scheduleFitCanvases);
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(scheduleFitCanvases);
      const expWrap = document.getElementById('exploded-canvas-wrap');
      const catFrame = document.getElementById('canvas-frame');
      if (expWrap) ro.observe(expWrap);
      if (catFrame) ro.observe(catFrame);
    }

    // Hero buttons
    const btnStartEdit = document.getElementById('btn-hero-start');
    if (btnStartEdit) btnStartEdit.addEventListener('click', () => enterExplodedMode(true));

    const btnStartBlank = document.getElementById('btn-hero-blank');
    if (btnStartBlank) {
      btnStartBlank.addEventListener('click', () => {
        const api = API();
        if (api && Spec.BLANK_WHITE_SKIN) {
          api.loadExternalSkin(Spec.BLANK_WHITE_SKIN, '纯白素胚');
        }
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

    // Part pills & back button
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

    // Brush tool dock
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

    const syncBrushSize = (val, updateInputText) => {
      const clamped = round2(clamp(val, 0.2, 24));
      brushSize = clamped;
      if (sizeInput) sizeInput.value = String(clamped);
      if (sizeValEl && updateInputText !== false) sizeValEl.value = clamped.toFixed(1);
      requestRedraw();
    };
    if (sizeInput) {
      sizeInput.addEventListener('input', () => syncBrushSize(parseFloat(sizeInput.value), true));
    }
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
    if (alphaInput) {
      alphaInput.addEventListener('input', () => syncBrushAlpha(parseFloat(alphaInput.value), true));
    }
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
    if (colorInput) {
      colorInput.addEventListener('input', () => setBrushColor(colorInput.value));
    }

    // Swatches
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

    // Progressive-disclosure drawers (配饰 / 更多 / ? 帮助)
    bindDrawerControls();
    bindCanvasEvents();
    setTool('calligraphy');
  }

  // -------------------------------------------------------------------------
  // Progressive Disclosure Drawers & Non-Blocking "?" Help Popover
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
        if (!helpPop.hidden && !helpPop.contains(e.target) && e.target !== btnHelp) {
          helpPop.hidden = true;
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (openDrawerName) closeDrawers();
        if (helpPop) helpPop.hidden = true;
      }
    });
  }

  // Boot after DOM & app.js
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
    onSkinSynced: () => {
      requestRedraw();
      if (mode === 'part') renderPartInspector();
    }
  };
})(window);
