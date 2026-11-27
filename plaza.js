/* KuroCat Sidebar Router, Triple Community Plaza (Skins / Accessories / Keyboards) & Agent Submission Guide */
(function () {
  'use strict';

  const Spec = window.KuroSpec;
  const Renderer = window.KuroRenderer;

  const ANCHOR_LABELS = {
    headTop: '头顶',
    face: '脸部',
    neck: '颈部',
    tailTip: '尾尖'
  };

  const ROUTE_TITLES = {
    paint: '组件画板',
    'plaza-skins': '皮肤广场',
    'plaza-accessories': '饰品广场',
    'plaza-keyboards': '键盘广场',
    guide: '投稿指南'
  };

  // --- Agent One-Click Prompts ---
  const AGENT_PROMPTS = {
    all: `请帮我把作品投稿到开源项目 KuroCat-Workshop（https://github.com/chanke17/KuroCat-Workshop）的社区广场。

请按仓库规范自动完成以下全部步骤：
1. Fork 并 Star 并 clone https://github.com/chanke17/KuroCat-Workshop（若本地已有目录则同步最新 main）；
2. 根据我提供的素材自动判断投稿类型并放入对应独立目录（slug 仅用小写字母/数字/连字符，绝不手动修改 index.json）：
   - 皮肤：community/<slug>/ 放 skin.kurocat + meta.json（可选 preview.gif 或 preview.png）
   - 饰品：community-accessories/<slug>/ 放透明底 accessory.png（≤1MB, ≤1024×1024）+ meta.json（含 anchor/offsetX/offsetY/scale/rotation）
   - 键盘：community-keyboards/<slug>/ 放 keyboard.json（formatVersion:1 + colors 8色值 + darkText）+ meta.json
3. 运行 node scripts/validate-community.mjs 确认 0 报错（如运行了 build-plaza-index.mjs，提 PR 前请不要提交被改动的 index.json，CI 合并后会自动重建）；
4. 提交清晰的 commit 并向 chanke17/KuroCat-Workshop 发起 Pull Request，把 PR 链接发给我。

我的作品信息与素材如下：
- 作品名称：（请填写）
- 制作人昵称与主页链接（可选）：（请填写）
- 一句话简介：（请填写）
- 文件或配色需求：（把 .kurocat / PNG 拖进来，或直接描述你想要的键盘配色）`,

    skin: `请帮我把一款猫咪皮肤投稿到 https://github.com/chanke17/KuroCat-Workshop 的「皮肤广场」：
1. Fork 并 Star 并 clone 仓库，新建目录 community/<英文slug>/；
2. 放入 skin.kurocat（v1 规范，≤2MB）、meta.json（含 title / author / authorUrl / description / tags / createdAt），以及可选的 preview.gif 或 preview.png（≤5MB）；
3. 严禁修改 community/index.json；运行 node scripts/validate-community.mjs 验证全部通过；
4. 发起 Pull Request 到 chanke17/KuroCat-Workshop 的 main 分支。

我的皮肤文件与信息：
- 皮肤名称：
- 制作人：
- 简介：
- 标签：`,

    accessory: `请帮我把一款自定义配饰投稿到 https://github.com/chanke17/KuroCat-Workshop 的「饰品广场」：
1. Fork 并 Star 并 clone 仓库，新建目录 community-accessories/<英文slug>/；
2. 放入透明底 accessory.png（≤1MB，≤1024×1024，如需抠去白底请自动帮我抠成透明底并裁剪空白边）；
3. 生成 meta.json，包含 title / author / authorUrl / description / anchor（headTop|face|neck|tailTip）/ offsetX / offsetY / scale / rotation / tags / createdAt；
4. 严禁修改 community-accessories/index.json；运行 node scripts/validate-community.mjs 验证通过后提交 PR。

我的饰品图片与佩戴说明：
- 饰品名称：
- 佩戴部位（头顶/脸部/颈部/尾尖）：
- 制作人与简介：`,

    keyboard: `请帮我制作并投稿一套 65% 机械键盘配色到 https://github.com/chanke17/KuroCat-Workshop 的「键盘广场」：
1. Fork 并 Star 并 clone 仓库，新建目录 community-keyboards/<英文slug>/；
2. 创建 keyboard.json（formatVersion: 1，含 name、author 和 colors：mouseBody / mouseBorder / wheel / base / deck / key / keyBorder / accent 8 个 #RRGGBB 色值及 darkText 布尔值）；
3. 创建 meta.json（含 title / author / authorUrl / description / tags / createdAt）；
4. 严禁修改 community-keyboards/index.json；运行 node scripts/validate-community.mjs 验证通过后提交 PR。

我想要的键盘风格与信息：
- 键盘名称与配色灵感（例如：海盐蓝白 / 黑金极客 / 草莓牛奶）：
- 制作人与简介：`
  };

  let activeRoute = 'workshop'; // 'workshop' | 'plaza-skins' | 'plaza-accessories' | 'plaza-keyboards' | 'guide'
  let searchQuery = '';
  let activeSkinTag = 'all';
  let activeAccAnchor = 'all';
  let activeKbTag = 'all';
  let activePromptKind = 'all';

  const STATS_API_BASE = 'https://kurocat-workshop-stats.yichan521.workers.dev';
  let activeSort = 'default'; // 'default' | 'popular'
  let downloadCounts = {};

  let skinsData = [];
  let accessoriesData = [];
  let keyboardsData = [];
  let dataLoaded = false;

  const skinSpecCache = new Map();

  function formatDownloadCount(n) {
    const num = Number(n) || 0;
    if (num >= 10000) return `${(num / 10000).toFixed(1).replace(/\.0$/, '')}w`;
    if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return String(num);
  }

  function getDownloadCount(type, slug) {
    return Number(downloadCounts[`${type}:${slug}`]) || 0;
  }

  function renderDownloadBadgeHtml(type, slug) {
    const key = `${type}:${slug}`;
    const count = getDownloadCount(type, slug);
    return `<span class="plaza-dl-badge" data-dl-key="${escapeHtml(key)}" title="累计下载 ${count} 次">` +
      `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 2.2v7.6m0 0L4.8 6.6M8 9.8l3.2-3.2M2.8 12.6h10.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
      `<span class="plaza-dl-num">${formatDownloadCount(count)}</span>` +
      `</span>`;
  }

  function syncDownloadBadgeDom(key, count) {
    const safeVal = Number(count) || 0;
    document.querySelectorAll(`.plaza-dl-badge[data-dl-key="${CSS.escape(key)}"]`).forEach((el) => {
      el.title = `累计下载 ${safeVal} 次`;
      const numEl = el.querySelector('.plaza-dl-num');
      if (numEl) numEl.textContent = formatDownloadCount(safeVal);
    });
  }

  async function fetchDownloadCounts() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${STATS_API_BASE}/api/counts`, { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.counts && typeof data.counts === 'object') {
        downloadCounts = data.counts;
      }
    } catch (_) {
      // Gracefully ignore stats errors so plaza stays responsive
    }
  }

  function recordDownload(type, slug) {
    if (!type || !slug) return;
    const key = `${type}:${slug}`;
    const optimistic = getDownloadCount(type, slug) + 1;
    downloadCounts[key] = optimistic;
    syncDownloadBadgeDom(key, optimistic);

    fetch(`${STATS_API_BASE}/api/hit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, slug }),
      keepalive: true
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.count === 'number') {
          downloadCounts[key] = data.count;
          syncDownloadBadgeDom(key, data.count);
        }
      })
      .catch(() => {});
  }

  function sortPlazaItems(list, type) {
    if (activeSort !== 'popular') return list;
    return list.slice().sort((a, b) => {
      const diff = getDownloadCount(type, b.slug) - getDownloadCount(type, a.slug);
      if (diff !== 0) return diff;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
  }

  // Play modal state
  let playModalItem = null;
  let playModalResolved = null;
  let playModalPose = 'idle';
  let playModalState = null;
  let playModalRaf = 0;
  let playModalLastTs = 0;
  let playModalPointer = { yaw: 0, pitch: 0, gazeX: 0, gazeY: 0, active: false };
  let playModalTypingTimer = 0;
  let playModalNextBlink = 2.4;

  // Submit modal state
  let submitType = 'skin'; // 'skin' | 'accessory' | 'keyboard'
  let submitAccPngB64 = '';
  let submitAccTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };

  // DOM refs
  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const navItems = document.querySelectorAll('[data-nav]');

  const workshopView = document.getElementById('workshop-view');
  const plazaView = document.getElementById('plaza-view');
  const guideView = document.getElementById('guide-view');

  const topbarWorkshopLeft = document.getElementById('topbar-workshop-left');
  const topbarPageHeading = document.getElementById('topbar-page-heading');
  const topbarPageTitle = document.getElementById('topbar-page-title');
  const topbarPageMeta = document.getElementById('topbar-page-meta');
  const topbarWorkshopRight = document.getElementById('topbar-workshop-right');
  const topbarPlazaRight = document.getElementById('topbar-plaza-right');
  const topbarGuideRight = document.getElementById('topbar-guide-right');

  const skinsPanel = document.getElementById('plaza-skins-panel');
  const accessoriesPanel = document.getElementById('plaza-accessories-panel');
  const keyboardsPanel = document.getElementById('plaza-keyboards-panel');
  const skinsGrid = document.getElementById('plaza-skins-grid');
  const accessoriesGrid = document.getElementById('plaza-accessories-grid');
  const keyboardsGrid = document.getElementById('plaza-keyboards-grid');
  const skinsEmpty = document.getElementById('plaza-skins-empty');
  const accessoriesEmpty = document.getElementById('plaza-accessories-empty');
  const keyboardsEmpty = document.getElementById('plaza-keyboards-empty');
  const filterRow = document.getElementById('plaza-filter-row');
  const searchInput = document.getElementById('plaza-search-input');

  const playModal = document.getElementById('plaza-play-modal');
  const playCanvas = document.getElementById('play-modal-canvas');
  const playCtx = playCanvas.getContext('2d');
  const submitModal = document.getElementById('submit-modal');

  function toast(msg) {
    if (window.KuroWorkshopAPI && window.KuroWorkshopAPI.showToast) {
      window.KuroWorkshopAPI.showToast(msg);
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function safeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    return /^https?:\/\//i.test(url.trim()) ? url.trim() : '';
  }

  function resolveAssetUrl(p) {
    if (!p) return '';
    if (p.startsWith('./') || p.startsWith('/') || /^https?:\/\//i.test(p)) return p;
    return `./${p}`;
  }

  function fetchSkinSpec(skinPath) {
    const url = resolveAssetUrl(skinPath);
    if (!skinSpecCache.has(url)) {
      const p = fetch(url, { cache: 'no-cache' })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .catch((err) => {
          skinSpecCache.delete(url);
          throw err;
        });
      skinSpecCache.set(url, p);
    }
    return skinSpecCache.get(url);
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // --- Mobile Sidebar Drawer & Desktop Collapsible Sidebar ---
  const studioShell = document.querySelector('.studio-shell');
  const desktopSidebarBtn = document.getElementById('btn-sidebar-toggle');
  const SIDEBAR_PREF_KEY = 'kurocat.sidebarCollapsed';

  function setSidebarOpen(open) {
    sidebar.classList.toggle('open', open);
    sidebarBackdrop.hidden = !open;
  }

  function setDesktopSidebarCollapsed(collapsed, persist) {
    if (!studioShell) return;
    studioShell.classList.toggle('sidebar-collapsed', !!collapsed);
    if (desktopSidebarBtn) {
      desktopSidebarBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      desktopSidebarBtn.title = collapsed ? '展开左侧边栏' : '收起左侧边栏';
    }
    if (persist) {
      try { localStorage.setItem(SIDEBAR_PREF_KEY, collapsed ? '1' : '0'); } catch (_) {}
    }
    // Re-fit painting & 2.5D preview canvases right away and after sidebar slide transition
    window.dispatchEvent(new Event('resize'));
    setTimeout(() => window.dispatchEvent(new Event('resize')), 220);
  }

  try {
    if (localStorage.getItem(SIDEBAR_PREF_KEY) === '1') {
      setDesktopSidebarCollapsed(true, false);
    }
  } catch (_) {}

  if (desktopSidebarBtn) {
    desktopSidebarBtn.addEventListener('click', () => {
      const next = !(studioShell && studioShell.classList.contains('sidebar-collapsed'));
      setDesktopSidebarCollapsed(next, true);
    });
  }

  document.getElementById('btn-sidebar-open').addEventListener('click', () => setSidebarOpen(true));
  document.getElementById('btn-sidebar-close').addEventListener('click', () => setSidebarOpen(false));
  sidebarBackdrop.addEventListener('click', () => setSidebarOpen(false));

  // --- Unified Route Navigation ---
  function routeToHash(route) {
    if (route === 'paint') return '#paint';
    if (route === 'plaza-skins') return '#plaza';
    if (route === 'plaza-accessories') return '#accessories';
    if (route === 'plaza-keyboards') return '#keyboards';
    if (route === 'guide') return '#guide';
    return '';
  }

  function hashToRoute(hash) {
    const h = (hash || '').toLowerCase();
    if (h === '#plaza' || h === '#skins') return 'plaza-skins';
    if (h === '#accessories') return 'plaza-accessories';
    if (h === '#keyboards') return 'plaza-keyboards';
    if (h === '#guide' || h === '#submit') return 'guide';
    return 'workshop';
  }

  function currentPlazaTab() {
    if (activeRoute === 'plaza-accessories') return 'accessories';
    if (activeRoute === 'plaza-keyboards') return 'keyboards';
    return 'skins';
  }

  function updatePageHeadingMeta() {
    if (activeRoute === 'paint') topbarPageMeta.textContent = '支持数位板压感 · 分组件绘制 · 右侧实时预览成品';
    else if (activeRoute === 'plaza-skins') topbarPageMeta.textContent = `${skinsData.length} 款作品`;
    else if (activeRoute === 'plaza-accessories') topbarPageMeta.textContent = `${accessoriesData.length} 款作品`;
    else if (activeRoute === 'plaza-keyboards') topbarPageMeta.textContent = `${keyboardsData.length} 款配色`;
    else if (activeRoute === 'guide') topbarPageMeta.textContent = 'AI Agent 一键投稿 · Fork PR 规范 · 无代码 Issue';
    else topbarPageMeta.textContent = '';
  }

  function navigate(route, skipHash) {
    activeRoute = route;
    const isWorkshop = route === 'workshop';
    const isPaint = route === 'paint';
    const isPlaza = route.startsWith('plaza-');
    const isGuide = route === 'guide';
    const paintView = document.getElementById('paint-view');

    navItems.forEach((el) => {
      if (el.classList.contains('nav-item')) {
        el.classList.toggle('active', el.dataset.nav === route);
      }
    });

    workshopView.hidden = !isWorkshop;
    if (paintView) paintView.hidden = !isPaint;
    plazaView.hidden = !isPlaza;
    guideView.hidden = !isGuide;

    topbarWorkshopLeft.hidden = !isWorkshop;
    topbarWorkshopRight.hidden = !isWorkshop && !isPaint;
    topbarPageHeading.hidden = isWorkshop;
    topbarPlazaRight.hidden = !isPlaza;
    topbarGuideRight.hidden = !isGuide;

    if (!isWorkshop) {
      topbarPageTitle.textContent = ROUTE_TITLES[route] || '';
      updatePageHeadingMeta();
    }

    if (window.KuroPaintStudio) {
      if (isPaint) window.KuroPaintStudio.onEnter();
      else window.KuroPaintStudio.onLeave();
    }

    if (isPlaza) {
      syncPlazaPanels();
      if (!dataLoaded) {
        loadPlazaData();
      } else {
        renderFilterRow();
        renderActivePlazaGrid();
      }
    }

    if (!skipHash) {
      const targetHash = routeToHash(route);
      if (targetHash) {
        if (window.location.hash !== targetHash) history.replaceState(null, '', targetHash);
      } else if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }

    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  navItems.forEach((el) => {
    el.addEventListener('click', (e) => {
      if (el.tagName === 'A') e.preventDefault();
      navigate(el.dataset.nav);
    });
  });

  document.getElementById('btn-topbar-guide').addEventListener('click', () => navigate('guide'));
  document.getElementById('btn-submit-goto-guide').addEventListener('click', () => {
    closeSubmitModal();
    navigate('guide');
  });

  document.querySelectorAll('.plaza-tab-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.plazaTab;
      if (tab === 'skins') navigate('plaza-skins');
      else if (tab === 'accessories') navigate('plaza-accessories');
      else if (tab === 'keyboards') navigate('plaza-keyboards');
    });
  });

  window.addEventListener('hashchange', () => {
    navigate(hashToRoute(window.location.hash), true);
  });

  // --- Plaza Data Loading ---
  async function loadPlazaData() {
    dataLoaded = true;
    try {
      const bust = `?v=${Date.now()}`;
      const [skinsRes, accRes, kbRes] = await Promise.all([
        fetch(`./community/index.json${bust}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { skins: [] })),
        fetch(`./community-accessories/index.json${bust}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { accessories: [] })),
        fetch(`./community-keyboards/index.json${bust}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { keyboards: [] })),
        fetchDownloadCounts()
      ]);
      skinsData = Array.isArray(skinsRes.skins) ? skinsRes.skins : [];
      accessoriesData = Array.isArray(accRes.accessories) ? accRes.accessories : [];
      keyboardsData = Array.isArray(kbRes.keyboards) ? kbRes.keyboards : [];
    } catch (_) {
      skinsData = [];
      accessoriesData = [];
      keyboardsData = [];
    }

    document.getElementById('nav-count-skins').textContent = String(skinsData.length);
    document.getElementById('nav-count-accessories').textContent = String(accessoriesData.length);
    document.getElementById('nav-count-keyboards').textContent = String(keyboardsData.length);
    document.getElementById('plaza-skins-count').textContent = String(skinsData.length);
    document.getElementById('plaza-accessories-count').textContent = String(accessoriesData.length);
    document.getElementById('plaza-keyboards-count').textContent = String(keyboardsData.length);

    if (activeRoute.startsWith('plaza-')) {
      updatePageHeadingMeta();
      syncPlazaPanels();
      renderFilterRow();
      renderActivePlazaGrid();
    }
  }

  function syncPlazaPanels() {
    const tab = currentPlazaTab();
    document.querySelectorAll('.plaza-tab-pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.plazaTab === tab);
    });
    skinsPanel.hidden = tab !== 'skins';
    accessoriesPanel.hidden = tab !== 'accessories';
    keyboardsPanel.hidden = tab !== 'keyboards';
  }

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    renderActivePlazaGrid();
  });

  // --- Filter Pills ---
  function renderTagFilters(list, activeVal, onPick) {
    const tagCounts = new Map();
    for (const item of list) {
      for (const t of item.tags || []) {
        tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
      }
    }
    const tags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([t]) => t);

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'pill' + (activeVal === 'all' ? ' active' : '');
    allBtn.textContent = `全部 (${list.length})`;
    allBtn.addEventListener('click', () => onPick('all'));
    filterRow.appendChild(allBtn);

    for (const tag of tags) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pill' + (activeVal === tag ? ' active' : '');
      b.textContent = `#${tag}`;
      b.addEventListener('click', () => onPick(tag));
      filterRow.appendChild(b);
    }
  }

  function renderFilterRow() {
    filterRow.innerHTML = '';
    const sortBtn = document.createElement('button');
    sortBtn.type = 'button';
    sortBtn.className = 'pill plaza-sort-pill' + (activeSort === 'popular' ? ' active' : '');
    sortBtn.textContent = activeSort === 'popular' ? '🔥 按下载量' : '↕ 按下载量';
    sortBtn.title = activeSort === 'popular' ? '当前按下载量从高到低排序，点击恢复默认排序' : '点击按下载量从高到低排序';
    sortBtn.addEventListener('click', () => {
      activeSort = activeSort === 'popular' ? 'default' : 'popular';
      renderFilterRow();
      renderActivePlazaGrid();
    });
    filterRow.appendChild(sortBtn);

    const tab = currentPlazaTab();
    if (tab === 'skins') {
      renderTagFilters(skinsData, activeSkinTag, (val) => {
        activeSkinTag = val;
        renderFilterRow();
        renderSkinsGrid();
      });
    } else if (tab === 'accessories') {
      const options = [
        ['all', `全部部位 (${accessoriesData.length})`],
        ['headTop', '头顶'],
        ['face', '脸部'],
        ['neck', '颈部'],
        ['tailTip', '尾尖']
      ];
      for (const [val, label] of options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pill' + (activeAccAnchor === val ? ' active' : '');
        b.textContent = label;
        b.addEventListener('click', () => {
          activeAccAnchor = val;
          renderFilterRow();
          renderAccessoriesGrid();
        });
        filterRow.appendChild(b);
      }
    } else {
      renderTagFilters(keyboardsData, activeKbTag, (val) => {
        activeKbTag = val;
        renderFilterRow();
        renderKeyboardsGrid();
      });
    }
  }

  function renderActivePlazaGrid() {
    const tab = currentPlazaTab();
    if (tab === 'skins') renderSkinsGrid();
    else if (tab === 'accessories') renderAccessoriesGrid();
    else renderKeyboardsGrid();
  }

  function matchesQuery(item, q) {
    if (!q) return true;
    const hay = [item.title, item.author, item.description, item.slug, ...(item.tags || [])].join(' ').toLowerCase();
    return hay.includes(q);
  }

  // --- 1. Skins Plaza ---
  function renderSkinsGrid() {
    const filtered = sortPlazaItems(skinsData.filter((item) => {
      if (activeSkinTag !== 'all' && !(item.tags || []).includes(activeSkinTag)) return false;
      return matchesQuery(item, searchQuery);
    }), 'skin');
    skinsGrid.innerHTML = '';
    skinsEmpty.hidden = filtered.length > 0;
    for (const item of filtered) skinsGrid.appendChild(createSkinCard(item));
  }

  function attachLiveCardCanvas(canvas, item) {
    const ctx = canvas.getContext('2d');
    let resolved = null;
    let rafId = 0;
    let hoverActive = false;
    let pointer = { yaw: 0, pitch: 0 };
    const st = Renderer.createDefaultState();
    st.time = 0.6;
    st.tailPhase = 0.9;

    function drawOnce() {
      if (!resolved) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      Renderer.drawScene(ctx, resolved, st, { kbTheme: 'classicMilk', eyeTheme: 'neonChartreuse' });
    }

    function animateHover() {
      if (!hoverActive || !resolved) { rafId = 0; return; }
      st.time += 0.016;
      st.tailPhase += 0.045;
      st.headYaw += (pointer.yaw - st.headYaw) * 0.16;
      st.headPitch += (pointer.pitch - st.headPitch) * 0.16;
      st.headTilt = st.headYaw * 0.06;
      st.eyeGazeX = st.headYaw;
      st.eyeGazeY = st.headPitch;
      drawOnce();
      rafId = requestAnimationFrame(animateHover);
    }

    fetchSkinSpec(item.skinPath).then((raw) => {
      resolved = Spec.resolveSkin(raw);
      Renderer.preloadDecorations(resolved.decorations);
      if (Renderer.preloadSpecialAssets) {
        Renderer.preloadSpecialAssets(resolved.renderStyle, drawOnce);
      }
      drawOnce();
      if (resolved.decorations && resolved.decorations.length) {
        setTimeout(drawOnce, 180);
        setTimeout(drawOnce, 480);
      }
    }).catch(() => {});

    canvas.addEventListener('pointerenter', () => {
      hoverActive = true;
      if (!rafId && resolved) rafId = requestAnimationFrame(animateHover);
    });
    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      pointer.yaw = Spec.clamp((((e.clientX - rect.left) / rect.width) * 2 - 1) * 0.9, -1, 1);
      pointer.pitch = Spec.clamp((((e.clientY - rect.top) / rect.height) * 2 - 1) * 0.7, -1, 1);
    });
    canvas.addEventListener('pointerleave', () => {
      hoverActive = false;
      pointer = { yaw: 0, pitch: 0 };
      st.headYaw = 0; st.headPitch = 0; st.headTilt = 0; st.eyeGazeX = 0; st.eyeGazeY = 0;
      drawOnce();
    });
  }

  function createSkinCard(item) {
    const card = document.createElement('article');
    card.className = 'plaza-card';

    const media = document.createElement('div');
    media.className = 'plaza-card-media';

    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 320;
    canvas.className = 'plaza-live-canvas';
    media.appendChild(canvas);

    const badge = document.createElement('span');
    badge.className = 'media-badge live';
    badge.textContent = '2.5D 互动';
    media.appendChild(badge);
    attachLiveCardCanvas(canvas, item);

    const isEaster = (item.tags || []).includes('彩蛋限定');
    if (isEaster) {
      const easterBadge = document.createElement('span');
      easterBadge.className = 'media-badge easter';
      easterBadge.textContent = '彩蛋限定';
      media.appendChild(easterBadge);
    }

    const decoCnt = item.decorationCount || 0;
    if (decoCnt > 0) {
      const decoBadge = document.createElement('span');
      decoBadge.className = 'media-badge deco-count';
      decoBadge.textContent = `含 ${decoCnt} 件配饰`;
      media.appendChild(decoBadge);
    }

    media.addEventListener('click', () => openPlayModal(item));

    const body = document.createElement('div');
    body.className = 'plaza-card-body';

    const url = safeUrl(item.authorUrl);
    const authorHtml = url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="author-link">${escapeHtml(item.author)}</a>`
      : `<span>${escapeHtml(item.author)}</span>`;
    const tagsHtml = (item.tags || []).map((t) => `<span class="plaza-tag">#${escapeHtml(t)}</span>`).join('');

    body.innerHTML = `
      <div class="plaza-card-head">
        <h3>${escapeHtml(item.title)}</h3>
        <span class="plaza-date">${escapeHtml(item.createdAt || '')}</span>
      </div>
      <div class="plaza-author-row">
        <span class="plaza-author-text">制作人：${authorHtml}</span>
        ${renderDownloadBadgeHtml('skin', item.slug)}
      </div>
      <p class="plaza-desc" title="${escapeHtml(item.description)}">${escapeHtml(item.description)}</p>
      <div class="plaza-tags">${tagsHtml}</div>
      <div class="plaza-card-actions">
        <button type="button" class="btn btn-primary btn-xs" data-act="download">下载 .kurocat</button>
        <button type="button" class="btn btn-secondary btn-xs" data-act="workshop">工坊打开</button>
        <button type="button" class="mini-btn" data-act="play">动作试玩</button>
      </div>
    `;

    body.querySelector('[data-act="download"]').addEventListener('click', () => downloadPlazaSkin(item));
    body.querySelector('[data-act="workshop"]').addEventListener('click', () => openPlazaSkinInWorkshop(item));
    body.querySelector('[data-act="play"]').addEventListener('click', () => openPlayModal(item));

    card.appendChild(media);
    card.appendChild(body);
    return card;
  }

  async function downloadPlazaSkin(item) {
    try {
      const res = await fetch(resolveAssetUrl(item.skinPath), { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const safeName = (item.title || item.slug).replace(/[\\/:*?"<>|]/g, '_');
      triggerBlobDownload(blob, `${safeName}.kurocat`);
      recordDownload('skin', item.slug);
      toast(`已下载「${item.title}.kurocat」，拖进换装间即可使用`);
    } catch (err) {
      toast('下载皮肤失败：' + err.message);
    }
  }

  async function openPlazaSkinInWorkshop(item) {
    try {
      const spec = await fetchSkinSpec(item.skinPath);
      if (window.KuroWorkshopAPI && window.KuroWorkshopAPI.loadExternalSkin(spec, `广场皮肤 · ${item.title}`)) {
        closePlayModal();
        navigate('workshop');
        if (window.KuroExplodedStudio && typeof window.KuroExplodedStudio.enterExplodedMode === 'function') {
          window.KuroExplodedStudio.enterExplodedMode(true);
        }
      }
    } catch (err) {
      toast('载入皮肤失败：' + err.message);
    }
  }

  // --- 2. Accessories Plaza ---
  function renderAccessoriesGrid() {
    const filtered = sortPlazaItems(accessoriesData.filter((item) => {
      if (activeAccAnchor !== 'all' && item.anchor !== activeAccAnchor) return false;
      return matchesQuery(item, searchQuery);
    }), 'accessory');
    accessoriesGrid.innerHTML = '';
    accessoriesEmpty.hidden = filtered.length > 0;
    for (const item of filtered) accessoriesGrid.appendChild(createAccessoryCard(item));
  }

  function createAccessoryCard(item) {
    const card = document.createElement('article');
    card.className = 'plaza-acc-card';

    const url = safeUrl(item.authorUrl);
    const authorHtml = url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="author-link">${escapeHtml(item.author)}</a>`
      : `<span>${escapeHtml(item.author)}</span>`;
    const tagsHtml = (item.tags || []).map((t) => `<span class="plaza-tag">#${escapeHtml(t)}</span>`).join('');
    const anchorName = ANCHOR_LABELS[item.anchor] || item.anchor;

    card.innerHTML = `
      <div class="plaza-acc-stage">
        <img src="${escapeHtml(resolveAssetUrl(item.previewPath || item.pngPath))}" alt="${escapeHtml(item.title)}" loading="lazy" />
        <span class="media-badge">${escapeHtml(anchorName)}</span>
      </div>
      <div class="plaza-card-body">
        <div class="plaza-card-head">
          <h3>${escapeHtml(item.title)}</h3>
        </div>
        <div class="plaza-author-row">
          <span class="plaza-author-text">制作人：${authorHtml}</span>
          ${renderDownloadBadgeHtml('accessory', item.slug)}
        </div>
        <p class="plaza-desc" title="${escapeHtml(item.description)}">${escapeHtml(item.description)}</p>
        <div class="plaza-tags">${tagsHtml}</div>
        <div class="plaza-card-actions">
          <button type="button" class="btn btn-primary btn-xs" data-act="equip">佩戴到当前小猫</button>
          <button type="button" class="mini-btn" data-act="download">下载 PNG</button>
        </div>
      </div>
    `;

    card.querySelector('[data-act="equip"]').addEventListener('click', () => equipPlazaAccessory(item));
    card.querySelector('[data-act="download"]').addEventListener('click', () => downloadPlazaAccessory(item));
    return card;
  }

  async function fetchPngAsBase64(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').replace(/^data:[^;]+;base64,/, ''));
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.readAsDataURL(blob);
    });
  }

  async function equipPlazaAccessory(item) {
    try {
      const b64 = await fetchPngAsBase64(resolveAssetUrl(item.pngPath));
      const decoObj = {
        _label: item.title,
        anchor: item.anchor || 'headTop',
        offsetX: typeof item.offsetX === 'number' ? item.offsetX : 0,
        offsetY: typeof item.offsetY === 'number' ? item.offsetY : 0,
        scale: typeof item.scale === 'number' ? item.scale : 1,
        rotation: typeof item.rotation === 'number' ? item.rotation : 0,
        png: b64
      };
      if (window.KuroWorkshopAPI && window.KuroWorkshopAPI.addExternalDecoration(decoObj)) {
        navigate('workshop');
      }
    } catch (err) {
      toast('佩戴饰品失败：' + err.message);
    }
  }

  async function downloadPlazaAccessory(item) {
    try {
      const res = await fetch(resolveAssetUrl(item.pngPath));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const safeName = (item.title || item.slug).replace(/[\\/:*?"<>|]/g, '_');
      triggerBlobDownload(blob, `${safeName}.png`);
      recordDownload('accessory', item.slug);
      toast(`已下载饰品图片「${safeName}.png」`);
    } catch (err) {
      toast('下载饰品失败：' + err.message);
    }
  }

  // --- 3. Keyboards Plaza ---
  function renderKeyboardsGrid() {
    const filtered = sortPlazaItems(keyboardsData.filter((item) => {
      if (activeKbTag !== 'all' && !(item.tags || []).includes(activeKbTag)) return false;
      return matchesQuery(item, searchQuery);
    }), 'keyboard');
    keyboardsGrid.innerHTML = '';
    keyboardsEmpty.hidden = filtered.length > 0;
    for (const item of filtered) keyboardsGrid.appendChild(createKeyboardCard(item));
  }

  function createKeyboardCard(item) {
    const card = document.createElement('article');
    card.className = 'plaza-kb-card';

    const stage = document.createElement('div');
    stage.className = 'plaza-kb-stage';

    if (item.previewPath) {
      const img = document.createElement('img');
      img.src = resolveAssetUrl(item.previewPath);
      img.alt = item.title;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      img.style.objectFit = 'contain';
      stage.appendChild(img);
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 220;
      canvas.className = 'plaza-kb-canvas';
      stage.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      Renderer.drawKeyboardCardPreview(ctx, item.colors);

      stage.addEventListener('pointerenter', () => {
        const cap = Renderer.KEYCAPS[Math.floor(Math.random() * Renderer.KEYCAPS.length)];
        Renderer.drawKeyboardCardPreview(ctx, item.colors, cap.id);
      });
      stage.addEventListener('pointerleave', () => {
        Renderer.drawKeyboardCardPreview(ctx, item.colors);
      });
    }

    const c = item.colors || {};
    const swatchStrip = document.createElement('div');
    swatchStrip.className = 'kb-swatch-strip';
    for (const hex of [c.deck, c.key, c.accent, c.mouseBody].filter(Boolean)) {
      const dot = document.createElement('span');
      dot.className = 'kb-swatch-dot';
      dot.style.background = hex;
      dot.title = hex;
      swatchStrip.appendChild(dot);
    }
    stage.appendChild(swatchStrip);

    const body = document.createElement('div');
    body.className = 'plaza-card-body';

    const url = safeUrl(item.authorUrl);
    const authorHtml = url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="author-link">${escapeHtml(item.author)}</a>`
      : `<span>${escapeHtml(item.author)}</span>`;
    const tagsHtml = (item.tags || []).map((t) => `<span class="plaza-tag">#${escapeHtml(t)}</span>`).join('');

    body.innerHTML = `
      <div class="plaza-card-head">
        <h3>${escapeHtml(item.title)}</h3>
        <span class="plaza-date">${escapeHtml(item.createdAt || '')}</span>
      </div>
      <div class="plaza-author-row">
        <span class="plaza-author-text">制作人：${authorHtml}</span>
        ${renderDownloadBadgeHtml('keyboard', item.slug)}
      </div>
      <p class="plaza-desc" title="${escapeHtml(item.description)}">${escapeHtml(item.description)}</p>
      <div class="plaza-tags">${tagsHtml}</div>
      <div class="plaza-card-actions">
        <button type="button" class="btn btn-primary btn-xs" data-act="download">下载 .kurokb</button>
        <button type="button" class="mini-btn" data-act="apply">预览到工坊小猫</button>
      </div>
    `;

    body.querySelector('[data-act="apply"]').addEventListener('click', () => {
      if (window.KuroWorkshopAPI && window.KuroWorkshopAPI.applyKeyboardTheme(`plaza_${item.slug}`, item.title, item.colors)) {
        navigate('workshop');
      }
    });
    body.querySelector('[data-act="download"]').addEventListener('click', async () => {
      try {
        const res = await fetch(resolveAssetUrl(item.keyboardPath));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const safeName = (item.title || item.slug).replace(/[\\/:*?"<>|]/g, '_');
        triggerBlobDownload(blob, `${safeName}.kurokb`);
        recordDownload('keyboard', item.slug);
        toast(`已下载「${safeName}.kurokb」，直接拖到小猫身上即可换键盘皮肤！`);
      } catch (err) {
        toast('下载失败：' + err.message);
      }
    });

    card.appendChild(stage);
    card.appendChild(body);
    return card;
  }

  // --- Submission Guide: Agent Prompt Switcher & One-Click Copy ---
  const promptTextEl = document.getElementById('agent-prompt-text');
  const copyPromptBtn = document.getElementById('btn-copy-agent-prompt');
  const copyPromptLabel = document.getElementById('copy-prompt-label');

  function renderAgentPrompt() {
    promptTextEl.textContent = AGENT_PROMPTS[activePromptKind] || AGENT_PROMPTS.all;
  }

  document.querySelectorAll('#agent-prompt-tabs .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      activePromptKind = btn.dataset.promptKind || 'all';
      document.querySelectorAll('#agent-prompt-tabs .pill').forEach((b) => b.classList.toggle('active', b === btn));
      renderAgentPrompt();
    });
  });

  async function copyText(str) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(str);
        return true;
      } catch (_) {}
    }
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove();
    return ok;
  }

  copyPromptBtn.addEventListener('click', async () => {
    const ok = await copyText(AGENT_PROMPTS[activePromptKind] || AGENT_PROMPTS.all);
    if (ok) {
      copyPromptLabel.textContent = '已复制，直接发给 Agent 吧';
      toast('提示词已复制到剪贴板');
      setTimeout(() => { copyPromptLabel.textContent = '复制发给 Agent'; }, 2200);
    } else {
      toast('复制失败，请手动选中复制');
    }
  });

  // --- Interactive Live Skin Play Modal ---
  const playPressedCaps = new Map();
  const playLive = {
    lastActivity: performance.now(),
    lastKeyTime: 0,
    lastMouseClickTime: 0,
    huntEnergy: 0,
    petHead: 0,
    petBody: 0,
    lastClientX: 0,
    lastClientY: 0,
    lastClientTime: 0,
    draggingCat: null,
    dragOffsetX: 0,
    dragOffsetY: 0
  };
  const playStageWrap = document.getElementById('play-stage-wrap');

  function setPlayDragClasses(active) {
    if (playStageWrap) playStageWrap.classList.toggle('is-dragging-cat', active);
    playCanvas.classList.toggle('cat-dragging', active);
  }

  function setPlayPose(pose) {
    playModalPose = pose || 'idle';
    playLive.lastActivity = performance.now();
    if (playModalPose === 'idle' && playModalState) {
      playModalState._dizzyTimer = 0;
      playModalState._fastMouseDuration = 0;
    }
    const bar = document.getElementById('play-pose-bar');
    if (bar) {
      bar.querySelectorAll('.pose-pill[data-play-pose]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.playPose === playModalPose);
      });
    }
  }

  const playPoseBarEl = document.getElementById('play-pose-bar');
  if (playPoseBarEl) {
    playPoseBarEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.pose-pill[data-play-pose]');
      if (!btn) return;
      setPlayPose(btn.dataset.playPose);
    });
  }

  async function openPlayModal(item) {
    playModalItem = item;
    setPlayPose('idle');
    playPressedCaps.clear();
    playLive.lastActivity = performance.now();
    playLive.lastKeyTime = 0;
    playLive.lastMouseClickTime = 0;
    playLive.huntEnergy = 0;
    playLive.petHead = 0;
    playLive.petBody = 0;
    playLive.draggingCat = null;
    playLive.dragOffsetX = 0;
    playLive.dragOffsetY = 0;
    playCanvas.style.transform = '';
    setPlayDragClasses(false);

    document.getElementById('play-modal-title').textContent = item.title;
    const url = safeUrl(item.authorUrl);
    document.getElementById('play-modal-author').innerHTML = (url
      ? `制作人：<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="author-link">${escapeHtml(item.author)}</a> · ${escapeHtml(item.createdAt || '')}`
      : `制作人：${escapeHtml(item.author)} · ${escapeHtml(item.createdAt || '')}`) + ` · ${renderDownloadBadgeHtml('skin', item.slug)}`;
    document.getElementById('play-modal-desc').textContent = item.description || '';
    document.getElementById('play-modal-tags').innerHTML = (item.tags || [])
      .map((t) => `<span class="plaza-tag">#${escapeHtml(t)}</span>`).join('');

    playModal.hidden = false;

    try {
      const raw = await fetchSkinSpec(item.skinPath);
      playModalResolved = Spec.resolveSkin(raw);
      Renderer.preloadDecorations(playModalResolved.decorations);
      playModalState = Renderer.createDefaultState();
      playModalLastTs = performance.now();
      playModalTypingTimer = 0;
      playModalNextBlink = 2.4;
      cancelAnimationFrame(playModalRaf);
      playModalRaf = requestAnimationFrame(tickPlayModal);
      playCanvas.focus({ preventScroll: true });
    } catch (err) {
      toast('载入试玩皮肤失败：' + err.message);
      closePlayModal();
    }
  }

  function closePlayModal() {
    playModal.hidden = true;
    playPressedCaps.clear();
    playLive.draggingCat = null;
    playLive.dragOffsetX = 0;
    playLive.dragOffsetY = 0;
    playCanvas.style.transform = '';
    setPlayDragClasses(false);
    cancelAnimationFrame(playModalRaf);
    playModalRaf = 0;
    playModalItem = null;
    playModalResolved = null;
  }

  function tickPlayModal(ts) {
    if (!playModalResolved || playModal.hidden) return;
    const dt = Math.min(0.05, (ts - playModalLastTs) / 1000);
    playModalLastTs = ts;
    const nowMs = performance.now();
    const st = playModalState;
    st.time += dt;

    if (playLive.draggingCat && !playLive.draggingCat.engaged && nowMs - playLive.draggingCat.downTime > 150) {
      playLive.draggingCat.engaged = true;
      setPlayDragClasses(true);
    }
    const isPointerDragging = !!(playLive.draggingCat && playLive.draggingCat.engaged);
    const isDraggingNow = isPointerDragging || playModalPose === 'drag';

    if (isPointerDragging) {
      playCanvas.style.transform = `translate3d(${playLive.dragOffsetX.toFixed(1)}px, ${playLive.dragOffsetY.toFixed(1)}px, 0)`;
    } else if (Math.abs(playLive.dragOffsetX) > 0.4 || Math.abs(playLive.dragOffsetY) > 0.4) {
      const sk = Math.min(1, dt * 13);
      playLive.dragOffsetX += (0 - playLive.dragOffsetX) * sk;
      playLive.dragOffsetY += (0 - playLive.dragOffsetY) * sk;
      playCanvas.style.transform = `translate3d(${playLive.dragOffsetX.toFixed(1)}px, ${playLive.dragOffsetY.toFixed(1)}px, 0)`;
    } else if (playCanvas.style.transform) {
      playLive.dragOffsetX = 0;
      playLive.dragOffsetY = 0;
      playCanvas.style.transform = '';
      setPlayDragClasses(false);
    }

    playLive.petHead = Math.max(0, playLive.petHead - dt * 0.55);
    playLive.petBody = Math.max(0, playLive.petBody - dt * 0.55);
    playLive.huntEnergy = Math.max(0, playLive.huntEnergy - dt * 0.85);

    const heldCaps = Array.from(playPressedCaps.values());
    for (const cap of heldCaps) st.keyGlow[cap.id] = 1.0;
    for (const k of Object.keys(st.keyGlow)) {
      if (!heldCaps.some((c) => c.id === k)) {
        st.keyGlow[k] = Math.max(0, st.keyGlow[k] - dt * 3.8);
        if (st.keyGlow[k] <= 0.01) delete st.keyGlow[k];
      }
    }

    st.tailPhase += dt * (playLive.huntEnergy > 0.25 ? 5.2 : 2.2);
    const idleSec = (nowMs - playLive.lastActivity) / 1000;
    const isSleeping = !isDraggingNow && heldCaps.length === 0 && idleSec > 18;

    if (!isSleeping && playLive.petHead < 0.35) {
      if (st.time >= playModalNextBlink) {
        const el = st.time - playModalNextBlink;
        if (el < 0.08) st.blinkProgress = el / 0.08;
        else if (el < 0.17) st.blinkProgress = 1 - (el - 0.08) / 0.09;
        else { st.blinkProgress = 0; playModalNextBlink = st.time + 2.5 + Math.random() * 2.5; }
      }
    } else {
      st.blinkProgress += (0 - st.blinkProgress) * Math.min(1, dt * 10);
    }

    let tYaw = playModalPointer.active ? playModalPointer.yaw : Math.sin(st.time * 0.8) * 0.14;
    let tPitch = playModalPointer.active ? playModalPointer.pitch : 0;
    let tHunt = 0, tPetH = 0, tPetB = 0, tSleep = 0, tEarFold = 0, tHind = 0, tSquash = 1, tHeadY = 0;
    const isDouniPlay = playModalResolved && (playModalResolved.renderStyle === 'douni' || playModalResolved.typingStyle === 'douni');
    let effectivePose = 'idle';
    st.tailTypingTarget = 0;

    if (isDraggingNow) {
      effectivePose = 'drag';
      tYaw = 0; tPitch = 0;
      st.leftPawActive = false;
      st.rightPawActive = false;
    } else if (playModalPose !== 'idle') {
      effectivePose = playModalPose;
      if (playModalPose === 'petHead') {
        tPetH = 1; tEarFold = 0.78; tSquash = 0.95; tHeadY = 3;
        st.leftPawActive = false; st.rightPawActive = false;
      } else if (playModalPose === 'sleep') {
        tSleep = 1; tPitch = 0.35; tHeadY = 6; tEarFold = 0.32;
        st.leftPawActive = false; st.rightPawActive = false;
      } else if (playModalPose === 'dizzy') {
        tYaw = 0; tPitch = 0; tEarFold = 0.36;
        st.leftPawActive = false; st.rightPawActive = false;
      } else if (playModalPose === 'hindFoot') {
        tHind = 1;
        st.hindFoot = Renderer.screenQuadPoint(0.28, 0.45);
        if (!isDouniPlay) {
          st.leftPaw = Renderer.screenQuadPoint(0.68, 0.52);
          st.rightPaw = Renderer.screenQuadPoint(0.46, 0.35);
          st.leftPawActive = true;
          st.rightPawActive = true;
          st.tailTypingTarget = 1;
          st.tailTipGoal = Renderer.screenQuadPoint(0.14, 0.62);
          st.keyGlow['2_3'] = 0.9;
          st.keyGlow['1_6'] = 0.9;
          st.keyGlow['2_9'] = 0.9;
          st.keyGlow['1_11'] = 0.9;
        }
      } else if (playModalPose === 'typing') {
        playModalTypingTimer += dt;
        if (playModalTypingTimer > (isDouniPlay ? 0.17 : 0.22)) {
          playModalTypingTimer = 0;
          Renderer.triggerKeyTap(st, playModalResolved);
        }
        tPitch = 0.28;
      } else if (playModalPose === 'anger') {
        playModalTypingTimer += dt;
        if (playModalTypingTimer > 0.12) {
          playModalTypingTimer = 0;
          Renderer.triggerKeyTap(st, playModalResolved);
        }
        tPitch = 0.26;
        tSquash = 0.95;
        tEarFold = 0.26;
      } else if (playModalPose === 'tablet') {
        tYaw = -0.22;
        tPitch = 0.22;
        st.rightPawActive = false;
      }
    } else {
      const recentKey = heldCaps.length > 0 || (nowMs - playLive.lastKeyTime < 220);
      const recentMouse = nowMs - playLive.lastMouseClickTime < 340;
      if (recentKey) {
        effectivePose = 'typing';
        tPitch = Math.max(tPitch, 0.22);
        tSquash = 0.97;
      }
      if (!recentKey && !recentMouse) {
        st.leftPawActive = false;
        st.rightPawActive = false;
      } else if (recentMouse && !recentKey) {
        st.rightPawActive = false;
      }
      if (heldCaps.length >= 3 && !isDouniPlay) {
        const c3 = heldCaps[2];
        st.hindFoot = Renderer.screenQuadPoint(1 - (c3.xUnits + c3.widthUnits * 0.5), 1 - (c3.row + 0.5) / 5);
        tHind = 1;
      }
      if (heldCaps.length >= 4 && !isDouniPlay) {
        const c4 = heldCaps[3];
        st.tailTipGoal = Renderer.screenQuadPoint(1 - (c4.xUnits + c4.widthUnits * 0.5), 1 - (c4.row + 0.5) / 5);
        st.tailTypingTarget = 1;
      }
      if (playLive.petHead > 0.08) {
        tPetH = playLive.petHead;
        tEarFold = Math.max(tEarFold, playLive.petHead * 0.78);
        tSquash = Math.min(tSquash, 1 - playLive.petHead * 0.05);
        tHeadY = Math.max(tHeadY, playLive.petHead * 3);
      }
      if (playLive.petBody > 0.08) {
        tPetB = playLive.petBody;
        tEarFold = Math.max(tEarFold, playLive.petBody * 0.45);
        tSquash = Math.min(tSquash, 1 - playLive.petBody * 0.04);
      }
      if (playLive.huntEnergy > 0.12 && playLive.petHead < 0.25) {
        tHunt = playLive.huntEnergy;
        tSquash = Math.min(tSquash, 1 - playLive.huntEnergy * 0.10);
        tHeadY = Math.max(tHeadY, playLive.huntEnergy * 7);
        tEarFold = Math.max(tEarFold, playLive.huntEnergy * 0.45);
      }
      if (isSleeping) {
        tSleep = Math.min(1, (idleSec - 18) / 3.0);
        tPitch = 0.35 * tSleep;
        tHeadY = 6 * tSleep;
        tEarFold = 0.32 * tSleep;
      }
    }

    const k = Math.min(1, dt * 9);
    const lerp = (a, b) => a + (b - a) * k;
    st.headYaw = lerp(st.headYaw, tYaw);
    st.headPitch = lerp(st.headPitch, tPitch);
    st.headTilt = lerp(st.headTilt, tYaw * 0.06);
    st.bodyTilt = lerp(st.bodyTilt, tYaw * 0.04);
    st.eyeGazeX = lerp(st.eyeGazeX, playModalPointer.active ? playModalPointer.gazeX : tYaw);
    st.eyeGazeY = lerp(st.eyeGazeY, playModalPointer.active ? playModalPointer.gazeY : tPitch);
    st.huntIntensity = lerp(st.huntIntensity, tHunt);
    st.petHead = lerp(st.petHead, tPetH);
    st.petBody = lerp(st.petBody, tPetB);
    st.sleepiness = lerp(st.sleepiness, tSleep);
    st.earFold = lerp(st.earFold, tEarFold);
    st.earTwitch = lerp(st.earTwitch, 0);
    st.bodySquash = lerp(st.bodySquash, tSquash);
    st.headOffsetY = lerp(st.headOffsetY, tHeadY);
    st.hindFootActive = lerp(st.hindFootActive, tHind);
    Renderer.stepPhysicsExtras(st, playModalResolved, effectivePose, dt);
    if (!st.leftPawActive) {
      st.leftPaw.x = lerp(st.leftPaw.x, Renderer.LEFT_PAW_REST.x);
      st.leftPaw.y = lerp(st.leftPaw.y, Renderer.LEFT_PAW_REST.y);
    }
    if (!st.rightPawActive) {
      st.rightPaw.x = lerp(st.rightPaw.x, Renderer.RIGHT_PAW_REST.x);
      st.rightPaw.y = lerp(st.rightPaw.y, Renderer.RIGHT_PAW_REST.y);
    }

    Renderer.drawScene(playCtx, playModalResolved, st, {
      kbTheme: 'classicMilk',
      eyeTheme: playModalResolved.colorpoint ? 'siameseBlue' : 'neonChartreuse'
    });
    playModalRaf = requestAnimationFrame(tickPlayModal);
  }

  playCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
  playCanvas.addEventListener('pointermove', (e) => {
    if (!playModalResolved || !playModalState) return;
    const now = performance.now();
    const rect = playCanvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 360;
    const y = ((e.clientY - rect.top) / rect.height) * 320;
    if (playLive.draggingCat) {
      const dist = Math.hypot(e.clientX - playLive.draggingCat.startClientX, e.clientY - playLive.draggingCat.startClientY);
      if (!playLive.draggingCat.engaged && dist > 5) {
        playLive.draggingCat.engaged = true;
        setPlayDragClasses(true);
      }
      if (playLive.draggingCat.engaged) {
        const dx = e.clientX - playLive.draggingCat.lastClientX;
        const dy = e.clientY - playLive.draggingCat.lastClientY;
        const dtMs = Math.max(8, now - playLive.draggingCat.lastTime);
        const vx = (dx / dtMs) * 1000;
        const vy = (dy / dtMs) * 1000;
        playLive.dragOffsetX = e.clientX - playLive.draggingCat.startClientX;
        playLive.dragOffsetY = e.clientY - playLive.draggingCat.startClientY;
        playModalState.dragSwingTarget = Spec.clamp(-vx * 0.00052, -0.92, 0.92);
        playModalState.dragSwingYTarget = Spec.clamp(-vy * 0.00046, -0.78, 0.78);
      }
      playLive.draggingCat.lastClientX = e.clientX;
      playLive.draggingCat.lastClientY = e.clientY;
      playLive.draggingCat.lastTime = now;
      playLive.lastActivity = now;
      return;
    }
    if (playLive.lastClientTime > 0) {
      const dtSec = Math.max(0.008, (now - playLive.lastClientTime) / 1000);
      const speed = Math.hypot(e.clientX - playLive.lastClientX, e.clientY - playLive.lastClientY) / dtSec;
      if (speed > 1750 && playLive.petHead < 0.25) {
        playLive.huntEnergy = Math.min(1.0, playLive.huntEnergy + Math.min(0.35, (speed - 1750) / 3600));
      }
    }
    const moveDist = playLive.lastClientTime ? Math.hypot(e.clientX - playLive.lastClientX, e.clientY - playLive.lastClientY) : 0;
    playLive.lastClientX = e.clientX;
    playLive.lastClientY = e.clientY;
    playLive.lastClientTime = now;
    playLive.lastActivity = now;

    playModalPointer.active = true;
    playModalPointer.yaw = Spec.clamp((x - 184) / 145, -1, 1);
    playModalPointer.pitch = Spec.clamp((y - 130) / 135, -1, 1);
    playModalPointer.gazeX = Spec.clamp((x - 184) / 110, -1, 1);
    playModalPointer.gazeY = Spec.clamp((y - 130) / 110, -1, 1);

    const zone = Renderer.hitTestCat({ x, y }, playModalResolved, playModalState);
    playCanvas.classList.toggle('cat-grabbable', zone === 'head' || zone === 'body');
    if (moveDist > 0.8 && moveDist < 65) {
      if (zone === 'head') playLive.petHead = Math.min(1, playLive.petHead + moveDist * 0.015);
      else if (zone === 'body') playLive.petBody = Math.min(0.9, playLive.petBody + moveDist * 0.012);
      else if (Renderer.updateTailHover) Renderer.updateTailHover(playModalState, playModalResolved, { x, y });
    }
  });
  playCanvas.addEventListener('pointerleave', () => {
    playModalPointer.active = false;
    playCanvas.classList.remove('cat-grabbable');
  });
  playCanvas.addEventListener('pointerdown', (e) => {
    if (!playModalResolved || !playModalState) return;
    const now = performance.now();
    playLive.lastActivity = now;
    const rect = playCanvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 360;
    const y = ((e.clientY - rect.top) / rect.height) * 320;
    const zone = Renderer.hitTestCat({ x, y }, playModalResolved, playModalState);
    if (e.button === 2) {
      Renderer.triggerMouseClick(playModalState, playModalResolved, true);
      playLive.lastMouseClickTime = now;
      return;
    }
    if (zone === 'mouse') {
      Renderer.triggerMouseClick(playModalState, playModalResolved, false);
      playLive.lastMouseClickTime = now;
      return;
    }
    if (zone === 'keyboard') {
      const cap = Renderer.findNearestKeycap({ x, y }, playModalResolved);
      Renderer.triggerKeyTap(playModalState, playModalResolved, cap);
      playLive.lastKeyTime = now;
      return;
    }
    if (zone === 'head' || zone === 'body') {
      playLive.draggingCat = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        lastTime: now,
        downTime: now,
        engaged: false,
        startZone: zone
      };
      playCanvas.setPointerCapture(e.pointerId);
    }
    playCanvas.focus({ preventScroll: true });
  });
  playCanvas.addEventListener('pointerup', () => {
    const dc = playLive.draggingCat;
    if (!dc) return;
    playLive.draggingCat = null;
    if (!dc.engaged && playModalState) {
      if (dc.startZone === 'head') {
        playModalState.earTwitch = 1.6;
        playModalState.bodySquash = 0.94;
        playLive.petHead = Math.min(1, playLive.petHead + 0.55);
      } else {
        playModalState.bodySquash = 0.95;
        playLive.petBody = Math.min(0.85, playLive.petBody + 0.5);
      }
    }
  });
  playCanvas.addEventListener('pointercancel', () => { playLive.draggingCat = null; });

  document.addEventListener('keydown', (e) => {
    if (playModal.hidden || !playModalResolved || !playModalState) return;
    if (e.key === 'Escape') { closePlayModal(); return; }
    if ((e.ctrlKey || e.metaKey || e.altKey) && !['ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight', 'AltLeft', 'AltRight'].includes(e.code)) return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    const now = performance.now();
    playLive.lastActivity = now;
    playLive.lastKeyTime = now;
    if (!e.repeat) {
      const cap = Renderer.mapKeyboardEventToCap(e);
      playPressedCaps.set(e.code, cap);
      Renderer.triggerKeyTap(playModalState, playModalResolved, cap);
    }
  });
  document.addEventListener('keyup', (e) => { playPressedCaps.delete(e.code); });

  document.getElementById('btn-close-play-modal').addEventListener('click', closePlayModal);
  playModal.addEventListener('click', (e) => { if (e.target === playModal) closePlayModal(); });
  document.getElementById('btn-play-download').addEventListener('click', () => {
    if (playModalItem) downloadPlazaSkin(playModalItem);
  });
  document.getElementById('btn-play-open-workshop').addEventListener('click', () => {
    if (playModalItem) openPlazaSkinInWorkshop(playModalItem);
  });

  // --- Community Submission Packager Modal (Skins / Accessories / Keyboards) ---
  function suggestSlug(text, fallback) {
    const ascii = String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36);
    return ascii.length >= 2 ? ascii : fallback;
  }

  function sanitizeSlug(raw) {
    return String(raw || '')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  function readSubmitKeyboardColors() {
    return {
      mouseBody: document.getElementById('kb-col-mouseBody').value.toUpperCase(),
      mouseBorder: document.getElementById('kb-col-mouseBorder').value.toUpperCase(),
      wheel: document.getElementById('kb-col-wheel').value.toUpperCase(),
      base: document.getElementById('kb-col-base').value.toUpperCase(),
      deck: document.getElementById('kb-col-deck').value.toUpperCase(),
      key: document.getElementById('kb-col-key').value.toUpperCase(),
      keyBorder: document.getElementById('kb-col-keyBorder').value.toUpperCase(),
      accent: document.getElementById('kb-col-accent').value.toUpperCase(),
      darkText: document.getElementById('kb-col-darkText').checked
    };
  }

  function renderSubmitKeyboardPreview() {
    const canvas = document.getElementById('submit-kb-preview-canvas');
    if (!canvas) return;
    Renderer.drawKeyboardCardPreview(canvas.getContext('2d'), readSubmitKeyboardColors());
  }

  function populateWornAccessoriesSelect() {
    const sel = document.getElementById('submit-acc-worn-select');
    sel.innerHTML = '<option value="">-- 从本地选择 PNG 文件 --</option>';
    const raw = window.KuroWorkshopAPI ? window.KuroWorkshopAPI.getRawSkin() : null;
    const decos = (raw && raw.decorations) || [];
    decos.forEach((d, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = `当前已佩戴 #${idx + 1}：${d._label || ANCHOR_LABELS[d.anchor] || '自定义配饰'}`;
      sel.appendChild(opt);
    });
    if (decos.length > 0 && !submitAccPngB64) {
      sel.value = '0';
      selectWornAccessory(0);
    }
  }

  function selectWornAccessory(idx) {
    const raw = window.KuroWorkshopAPI ? window.KuroWorkshopAPI.getRawSkin() : null;
    const d = raw && raw.decorations && raw.decorations[idx];
    if (!d) return;
    submitAccPngB64 = d.png || '';
    submitAccTransform = {
      offsetX: d.offsetX || 0,
      offsetY: d.offsetY || 0,
      scale: d.scale || 1,
      rotation: d.rotation || 0
    };
    document.getElementById('submit-acc-anchor').value = d.anchor || 'headTop';
    updateSubmitAccPreview();
    updateSubmitPreview();
  }

  function updateSubmitAccPreview() {
    const row = document.getElementById('submit-acc-preview-row');
    const img = document.getElementById('submit-acc-preview-img');
    const meta = document.getElementById('submit-acc-preview-meta');
    if (submitAccPngB64) {
      row.hidden = false;
      img.src = `data:image/png;base64,${submitAccPngB64}`;
      meta.textContent = `已就绪 · 偏移 (${submitAccTransform.offsetX}, ${submitAccTransform.offsetY}) · 缩放 ${submitAccTransform.scale}`;
    } else {
      row.hidden = true;
    }
  }

  function buildSubmitMetaObject() {
    const fallbackTitle = submitType === 'skin' ? '我的桌面小猫' : submitType === 'accessory' ? '我的自定义饰品' : '我的自定义键盘';
    const title = document.getElementById('submit-title').value.trim() || fallbackTitle;
    const author = document.getElementById('submit-author').value.trim() || '社区创作者';
    const authorUrl = safeUrl(document.getElementById('submit-author-url').value.trim());
    const description = document.getElementById('submit-desc').value.trim() || '欢迎试玩我的 KuroCat 社区作品！';
    const tagsRaw = document.getElementById('submit-tags').value.trim();
    const defaultTag = submitType === 'skin' ? '原创皮肤' : submitType === 'accessory' ? '原创饰品' : '原创键盘';
    const tags = tagsRaw
      ? tagsRaw.split(/[\s,，、#]+/).map((s) => s.trim()).filter(Boolean).slice(0, 6)
      : [defaultTag];
    const createdAt = new Date().toISOString().slice(0, 10);

    const meta = { title, author };
    if (authorUrl) meta.authorUrl = authorUrl;
    meta.description = description;

    if (submitType === 'accessory') {
      meta.anchor = document.getElementById('submit-acc-anchor').value || 'headTop';
      meta.offsetX = submitAccTransform.offsetX;
      meta.offsetY = submitAccTransform.offsetY;
      meta.scale = submitAccTransform.scale;
      meta.rotation = submitAccTransform.rotation;
    }
    meta.tags = tags;
    meta.createdAt = createdAt;
    return meta;
  }

  function updateSubmitPreview() {
    const fallbackSlug = submitType === 'skin' ? 'my-kurocat' : submitType === 'accessory' ? 'my-accessory' : 'my-keyboard';
    const slugVal = sanitizeSlug(document.getElementById('submit-slug').value) || fallbackSlug;
    const dirPrefix = submitType === 'skin' ? 'community' : submitType === 'accessory' ? 'community-accessories' : 'community-keyboards';
    document.getElementById('submit-target-path').textContent = `${dirPrefix}/${slugVal}/`;

    const assetBtn = document.getElementById('btn-dl-submit-asset');
    if (submitType === 'skin') assetBtn.textContent = '下载 skin.kurocat';
    else if (submitType === 'accessory') assetBtn.textContent = '下载 accessory.png';
    else assetBtn.textContent = '下载 keyboard.json';

    document.getElementById('btn-dl-submit-preview').hidden = submitType !== 'skin';
    document.getElementById('submit-accessory-extra').hidden = submitType !== 'accessory';
    document.getElementById('submit-keyboard-extra').hidden = submitType !== 'keyboard';

    const issueTpl = submitType === 'skin' ? 'submit-skin.yml' : submitType === 'accessory' ? 'submit-accessory.yml' : 'submit-keyboard.yml';
    document.getElementById('btn-submit-issue-link').href = `https://github.com/chanke17/KuroCat-Workshop/issues/new?template=${issueTpl}`;
    document.getElementById('submit-meta-preview').textContent = JSON.stringify(buildSubmitMetaObject(), null, 2);

    if (submitType === 'keyboard') renderSubmitKeyboardPreview();
  }

  function openSubmitModal(preferredType) {
    if (preferredType) submitType = preferredType;
    else if (activeRoute === 'plaza-accessories') submitType = 'accessory';
    else if (activeRoute === 'plaza-keyboards') submitType = 'keyboard';
    else submitType = 'skin';

    document.querySelectorAll('#submit-type-seg .seg-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.submitType === submitType);
    });

    const raw = window.KuroWorkshopAPI ? window.KuroWorkshopAPI.getRawSkin() : null;
    if (submitType === 'skin' && raw) {
      document.getElementById('submit-title').value = raw.name || '我的桌面小猫';
      document.getElementById('submit-author').value = raw.author || '';
      document.getElementById('submit-slug').value = suggestSlug(raw.name, 'my-kurocat');
    } else if (submitType === 'accessory') {
      document.getElementById('submit-slug').value = suggestSlug(document.getElementById('submit-title').value, 'my-accessory');
      if (raw && raw.author && !document.getElementById('submit-author').value.trim()) {
        document.getElementById('submit-author').value = raw.author;
      }
      populateWornAccessoriesSelect();
    } else if (submitType === 'keyboard') {
      document.getElementById('submit-slug').value = suggestSlug(document.getElementById('submit-title').value, 'my-keyboard');
      if (raw && raw.author && !document.getElementById('submit-author').value.trim()) {
        document.getElementById('submit-author').value = raw.author;
      }
    }

    updateSubmitPreview();
    submitModal.hidden = false;
  }

  function closeSubmitModal() {
    submitModal.hidden = true;
  }

  document.getElementById('btn-open-submit').addEventListener('click', () => openSubmitModal());
  document.getElementById('btn-plaza-submit').addEventListener('click', () => openSubmitModal());
  document.getElementById('btn-guide-open-submit').addEventListener('click', () => openSubmitModal('skin'));
  document.getElementById('btn-fallback-packager').addEventListener('click', () => openSubmitModal('skin'));
  document.getElementById('btn-close-submit-modal').addEventListener('click', closeSubmitModal);
  submitModal.addEventListener('click', (e) => { if (e.target === submitModal) closeSubmitModal(); });

  document.querySelectorAll('#submit-type-seg .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      submitType = btn.dataset.submitType;
      document.querySelectorAll('#submit-type-seg .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
      if (submitType === 'accessory') {
        populateWornAccessoriesSelect();
        document.getElementById('submit-slug').value = suggestSlug(document.getElementById('submit-title').value, 'my-accessory');
      } else if (submitType === 'keyboard') {
        document.getElementById('submit-slug').value = suggestSlug(document.getElementById('submit-title').value, 'my-keyboard');
      } else {
        const raw = window.KuroWorkshopAPI ? window.KuroWorkshopAPI.getRawSkin() : null;
        if (raw) {
          document.getElementById('submit-title').value = raw.name || '我的桌面小猫';
          document.getElementById('submit-slug').value = suggestSlug(raw.name, 'my-kurocat');
        }
      }
      updateSubmitPreview();
    });
  });

  ['submit-slug', 'submit-title', 'submit-author', 'submit-author-url', 'submit-desc', 'submit-tags', 'submit-acc-anchor'].forEach((id) => {
    document.getElementById(id).addEventListener('input', updateSubmitPreview);
  });

  ['kb-col-base', 'kb-col-deck', 'kb-col-key', 'kb-col-keyBorder', 'kb-col-accent', 'kb-col-mouseBody', 'kb-col-mouseBorder', 'kb-col-wheel', 'kb-col-darkText'].forEach((id) => {
    document.getElementById(id).addEventListener('input', renderSubmitKeyboardPreview);
  });

  document.getElementById('submit-acc-worn-select').addEventListener('change', (e) => {
    if (e.target.value !== '') selectWornAccessory(parseInt(e.target.value, 10));
  });

  document.getElementById('submit-acc-file').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      submitAccPngB64 = String(reader.result || '').replace(/^data:[^;]+;base64,/, '');
      submitAccTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
      document.getElementById('submit-acc-worn-select').value = '';
      updateSubmitAccPreview();
      updateSubmitPreview();
      toast('已载入饰品 PNG');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  document.getElementById('btn-dl-submit-asset').addEventListener('click', () => {
    if (submitType === 'skin') {
      if (!window.KuroWorkshopAPI) return;
      const exportObj = window.KuroWorkshopAPI.getExportObject();
      exportObj.name = document.getElementById('submit-title').value.trim() || exportObj.name;
      exportObj.author = document.getElementById('submit-author').value.trim() || exportObj.author;
      const check = Spec.validateRawSkin(exportObj);
      if (!check.ok) {
        toast('当前皮肤未通过规范校验：' + check.error);
        return;
      }
      triggerBlobDownload(new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json;charset=utf-8' }), 'skin.kurocat');
      toast('已下载 skin.kurocat');
    } else if (submitType === 'accessory') {
      if (!submitAccPngB64) {
        toast('请先选择当前小猫已佩戴的配饰，或上传一张透明底 PNG');
        return;
      }
      const bin = atob(submitAccPngB64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      triggerBlobDownload(new Blob([bytes], { type: 'image/png' }), 'accessory.png');
      toast('已下载 accessory.png');
    } else {
      const kbObj = {
        formatVersion: 1,
        name: document.getElementById('submit-title').value.trim() || '我的自定义键盘',
        author: document.getElementById('submit-author').value.trim() || '社区创作者',
        colors: readSubmitKeyboardColors()
      };
      triggerBlobDownload(new Blob([JSON.stringify(kbObj, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }), 'keyboard.json');
      toast('已下载 keyboard.json');
    }
  });

  document.getElementById('btn-dl-submit-meta').addEventListener('click', () => {
    const meta = buildSubmitMetaObject();
    triggerBlobDownload(new Blob([JSON.stringify(meta, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }), 'meta.json');
    toast('已下载 meta.json');
  });

  document.getElementById('btn-dl-submit-preview').addEventListener('click', () => {
    if (!window.KuroWorkshopAPI) return;
    const resolved = window.KuroWorkshopAPI.getResolvedSkin();
    const b64 = Renderer.renderPreviewBase64(resolved, 'classicMilk', 'neonChartreuse');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    triggerBlobDownload(new Blob([bytes], { type: 'image/png' }), 'preview.png');
    toast('已下载 preview.png');
  });

  // --- Reward QR Modal ---
  const rewardModal = document.getElementById('reward-modal');
  const openRewardBtn = document.getElementById('btn-open-reward');
  const closeRewardBtn = document.getElementById('btn-close-reward-modal');
  function openRewardModal() {
    if (!rewardModal) return;
    rewardModal.hidden = false;
    setSidebarOpen(false);
  }
  function closeRewardModal() {
    if (!rewardModal) return;
    rewardModal.hidden = true;
  }
  if (openRewardBtn) openRewardBtn.addEventListener('click', openRewardModal);
  if (closeRewardBtn) closeRewardBtn.addEventListener('click', closeRewardModal);
  if (rewardModal) {
    rewardModal.addEventListener('click', (e) => {
      if (e.target === rewardModal) closeRewardModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (rewardModal && !rewardModal.hidden) closeRewardModal();
      else if (!playModal.hidden) closePlayModal();
      else if (!submitModal.hidden) closeSubmitModal();
      else setSidebarOpen(false);
    }
  });

  // Boot: render default Agent prompt, preload Plaza counts, honor URL hash
  renderAgentPrompt();
  loadPlazaData();
  navigate(hashToRoute(window.location.hash), true);
})();
