/* =========================================================================
 * KuroCat Workshop — Lightweight Bilingual i18n (简体中文 / English)
 * Auto-detects ?lang=en|zh, localStorage, or browser navigator.language.
 * ========================================================================= */
(function () {
  const STORAGE_KEY = 'kurocat_workshop_lang';

  function detectInitialLang() {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = (params.get('lang') || '').toLowerCase();
      if (q === 'en' || q === 'zh') return q;
    } catch (_) {}
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'zh') return saved;
    } catch (_) {}
    const nav = (navigator.language || navigator.userLanguage || 'zh').toLowerCase();
    return nav.startsWith('zh') ? 'zh' : 'en';
  }

  let currentLang = detectInitialLang();

  const EN_DICT = {
    // Page & Meta
    'KuroCat 皮肤工坊 — 2.5D 捏猫编辑器与社区皮肤广场': 'KuroCat Skin Workshop — 2.5D Cat Skin Editor & Community Plaza',
    'KuroCat 皮肤工坊 — 免费 2.5D 桌宠捏猫编辑器与社区皮肤/饰品/键盘广场': 'KuroCat Skin Workshop — Free 2.5D Desktop Pet Skin Editor & Community Plaza',
    'KuroCat 皮肤工坊 (KuroCat Skin Workshop)': 'KuroCat Skin Workshop',
    'KuroCat 皮肤工坊': 'KuroCat Workshop',
    'KuroCat 捏猫工坊': 'KuroCat Workshop',
    'KuroCat 皮肤广场': 'KuroCat Skin Plaza',
    'KuroCat 官方网站': 'KuroCat Official Site',
    'KuroCat 官网': 'KuroCat Home',
    'GitHub 开源仓库': 'GitHub Repository',

    // Navigation & Sidebar
    '主导航': 'Main Navigation',
    '打开导航': 'Open Navigation',
    '收起导航': 'Collapse Navigation',
    '创作工具': 'Creation Tools',
    '皮肤工坊': 'Skin Workshop',
    '社区广场': 'Community Plaza',
    '皮肤广场': 'Skin Plaza',
    '饰品广场': 'Accessory Plaza',
    '键盘广场': 'Keyboard Plaza',
    '参与共建': 'Contribute',
    '投稿指南': 'Submit Guide',
    '请作者喝杯咖啡': 'Buy Author a Coffee',
    '支持 KuroCat 持续开发': 'Support KuroCat Development',
    '赞赏作者，点击查看赞赏码': 'Support the author',
    '打包投稿文件': 'Package Submission',
    '微信赞赏': 'WeChat Tip',
    '♥ 微信赞赏': '♥ WeChat Tip',
    '微信扫一扫 · 助力 KuroCat 持续更新': 'Scan with WeChat · Support KuroCat updates',
    'KuroCat 微信赞赏码': 'KuroCat WeChat Tip QR',

    // Topbar
    '皮肤名': 'Skin Name',
    '我的桌面小猫': 'My Desktop Cat',
    '例如：家里的橘猫': 'e.g. My Orange Tabby',
    '作者': 'Author',
    '可选': 'Optional',
    '✓ v1 规范': '✓ v1 Valid',
    '符合 .kurocat v1 规范': 'Matches .kurocat v1 spec',
    '撤销与重做': 'Undo & Redo',
    '撤销': 'Undo',
    '撤销 (Ctrl/⌘+Z)': 'Undo (Ctrl/⌘+Z)',
    '重做': 'Redo',
    '重做 (Ctrl/⌘+Shift+Z)': 'Redo (Ctrl/⌘+Shift+Z)',
    '更多': 'More',
    '传猫照生成 / 模板库 / 高级设置': 'Photo-to-Cat / Templates / Advanced',
    '快速上手帮助': 'Quick Start Help',
    '3 步画出你的桌面小猫': '3 Steps to Paint Your Desktop Cat',
    '选部位透明层直绘': '1. Paint Transparent Part Layers',
    '在全屏画板选头部、耳朵、眼球、四肢、坐姿后爪或尾巴，多图层叠加（裁剪蒙版 / 混合模式 / 选区 / 油漆桶）直接画上去。': 'Pick head, ears, eyes, limbs, sitting hind paws, or tail on the full-bleed canvas and paint directly with clipping masks, blend modes, selection, and flood fill.',
    '悬浮桌宠自由预览': '2. Floating Desktop Pet Preview',
    '随时拖动小猫到网页任意位置、拖拽右下角缩放大小，或悬停点「调骨架」「转头检查」。': 'Drag the transparent pet anywhere, resize from its bottom-right handle, or hover to tune the rig and check head turns.',
    '导出通用皮肤': '3. Export Universal Skin',
    '点右上角「导出 .kurocat」拖进 KuroCat 桌宠即刻生效，也可保存分层工程继续修改。': 'Click Export .kurocat and drop it into KuroCat Desktop, or save a layered project JSON to continue later.',
    '查看 v1.6.0 更新日志': 'View v1.6.0 Changelog',
    '查看 v1.6.0 更新日志 →': 'View v1.6.0 Changelog →',
    'v1.6.0 更新日志': "v1.6.0 What's New",
    'KuroCat v1.6.0 更新日志': "What's New in KuroCat v1.6.0",
    '全可见区「一叠透明纸」像素图层引擎': 'Full-Area Transparent Layer Engine',
    '12 个部位统一升级为透明图层，打开模板或皮肤自动光栅化；新增裁剪蒙版、Alpha 锁定、正片叠底/滤色/叠加混合模式、多画笔、油漆桶、矩形/套索选区变换与导入图片一键去白底。': 'All 12 parts use transparent pixel sheets with auto-rasterization, clipping masks, alpha lock, Multiply/Screen/Overlay blend modes, brushes, flood fill, rect/lasso selection transform, and white-background removal.',
    '真 3D 球面头部 + 四肢/尾巴弯曲贴图': 'True 3D Spherical Head + Curved Limb/Tail Warps',
    '头部转头与俯仰采用 3D 球面逆映射并带缓存，手臂、后腿、尾巴及拎脖子采用弯曲条带网格贴图；支持独立眼球贴图与鼻/嘴直绘，爪尖与坐姿后爪不被默认色块遮挡，工坊、官网与 macOS / Windows / Linux 桌宠四端同步。': 'Cached 3D ellipsoid head dome warping, curved strip meshes for limbs/tail/scruff-drag, direct iris & nose/mouth painting, and unoccluded paw tips across Workshop, homepage, macOS, Windows, and Linux.',
    '全屏大画板 + 悬浮透明小猫': 'Full-Bleed Canvas + Floating Transparent Pet',
    '创作画板全屏展开，取消预设动作栏；预览小猫化为无边框透明桌宠，可任意拖到网页角落、拖拽缩放尺寸或收起为迷你气泡。': 'Full-bleed studio workspace without preset pose bars; the preview pet floats borderless and transparent, freely draggable, resizable, and collapsible.',
    '.kurocat v2 导出与分层工程持久化': '.kurocat v2 Export & Layered Persistence',
    '兼容 1.4.0–1.5.x 皮肤，自动写入最低兼容版本 minAppVersion: "1.6.0"，支持浏览器 IndexedDB 自动保存与 .kurocat-layers.json 工程导入导出。': 'Backward-compatible with 1.4.0–1.5.x skins, writes minAppVersion: "1.6.0", auto-saves layers to IndexedDB, and imports/exports .kurocat-layers.json projects.',
    '需要 KuroCat 1.6.0+ 桌宠体验全部图层皮肤效果': 'Requires KuroCat 1.6.0+ Desktop for full pixel-layer skins',
    '知道了，开始创作': 'Got It, Start Creating',
    '导入': 'Import',
    '导入已有 .kurocat 文件继续编辑': 'Import an existing .kurocat file to edit',
    '导出 .kurocat': 'Export .kurocat',
    '搜索名称、作者、简介或标签…': 'Search name, author, description, or tags…',
    '打包投稿': 'Submit',
    '打开打包助手': 'Open Packager',
    '去 GitHub 提 Issue': 'Open GitHub Issue',
    '关闭': 'Close',
    '完成': 'Done',
    '删除': 'Delete',
    '清空': 'Clear',
    '清除': 'Clear',
    '退出': 'Exit',
    '默认': 'Default',
    '镜像': 'Mirror',
    '闭合': 'Close Path',
    '画好了': 'Finish',
    '微调': 'Adjust',
    '微调中': 'Adjusting',
    '摘下': 'Remove',
    '已戴': 'Equipped',

    // Workshop Exploded & Paint Studio
    '小猫拆件与组件画笔编辑区': 'Exploded Cat Components & Paint Canvas',
    '小猫实时互动预览区': 'Live 2.5D Interactive Preview',
    '皮肤试玩实时互动预览区': 'Live Interactive Skin Preview',
    '支持数位板压感 · 分组件绘制 · 右侧实时预览成品': 'Pressure-sensitive tablet support · Per-part painting · Live 2.5D preview',
    '开始编辑': 'Start Editing',
    '完成退出': 'Finish & Exit',
    '完成调整': 'Done Adjusting',
    '调骨架': 'Edit Rig',
    '调骨架位置': 'Adjust Rig Positions',
    '恢复默认体型': 'Reset Default Shape',
    '已恢复默认体型': 'Reset to default body shape',
    '已开启「调骨架」，直接拖动小猫身上的橙色圆点即可调整间距、根部和长短': 'Rig editor enabled — drag the orange handles on the cat to adjust spacing, roots, and length',
    '在小猫身上直接拖动圆点调整双手间距、手臂根部与长短': 'Drag handles directly on the cat to adjust paw spacing, arm roots, and length',
    '← 拆件': '← Parts',
    '拆件点画': 'Exploded Paint',
    '组件画板': 'Part Canvas',
    '放大画布': 'Zoom In',
    '放大画布（滚轮向上 / +）': 'Zoom In (Scroll Up / +)',
    '缩小画布': 'Zoom Out',
    '缩小画布（滚轮向下 / -）': 'Zoom Out (Scroll Down / -)',
    '点击复位 100%（快捷键 0）': 'Reset Zoom 100% (Key 0)',
    '抓手平移': 'Pan Tool',
    '抓手平移（也可按住空格或右键拖动）': 'Pan Canvas (or hold Space / Right-drag)',
    '撤销上一笔': 'Undo Stroke',
    '清空当前部位画作': 'Clear Current Part',
    '画笔工具': 'Brush Tools',
    '画笔颜色': 'Brush Color',
    '粗细': 'Size',
    '硬笔': 'Marker',
    '硬边马克笔': 'Hard-edge Marker',
    '毛笔': 'Brush Pen',
    '毛笔：随运笔速度与压感变粗细出锋': 'Brush Pen: varies width by speed & stylus pressure',
    '柔边': 'Soft',
    '柔边画笔：柔和羽化边缘': 'Soft Brush: feathered edges',
    '喷枪': 'Airbrush',
    '喷枪：雾状柔边点喷，适合腮红与渐变': 'Airbrush: misty spray for blush & gradients',
    '涂抹': 'Smudge',
    '涂抹：柔和过渡相邻毛色': 'Smudge: softly blend adjacent fur colors',
    '油漆桶': 'Fill Bucket',
    '油漆桶：修改当前组件底色': 'Fill Bucket: change base color of current part',
    '油漆桶：点击画布填充当前部位底色': 'Fill Bucket: click canvas to fill current part base color',
    '吸管': 'Eyedropper',
    '吸管：从画布吸取颜色': 'Eyedropper: pick color from canvas',
    '橡皮': 'Eraser',
    '橡皮擦：擦除经过的笔触或色块': 'Eraser: erase strokes or color patches',
    '色块': 'Lasso Fill',
    '色块笔：自由圈画闭合填色': 'Lasso Fill: draw a closed loop to fill color',
    '钢笔': 'Pen Tool',
    '钢笔：点一下放锚点': 'Pen Tool: click to place anchor points',
    '对称': 'Symmetry',
    '左右对称': 'Mirror Symmetry',
    '左右对称绘制与配色': 'Mirror symmetry drawing & coloring',
    '· 对称中': '· Mirroring',
    '· 以脸 / 身体中线为轴自动画出另一半': '· Automatically mirrors strokes across center axis',
    '切换桌宠贴纸白边预览（默认隐藏）': 'Toggle white sticker outline preview (hidden by default)',
    '隐藏默认轮廓（纯显原画）': 'Hide default outline (art only)',
    '白边': 'Outline',
    '保存预览图': 'Save Preview',
    '保存当前预览 PNG': 'Save Current Preview PNG',
    '已保存当前高清预览图 PNG': 'Saved HD preview PNG',

    // Cat Parts & Canvas Labels
    '脸部': 'Head',
    '脸部 head': 'Head',
    '头壳 skull': 'Skull',
    '头壳 skull · 不随转头': 'Skull · does not turn',
    '头 / 脸': 'Head / Face',
    '脸和头顶都画在这里，花纹会跟着转头': 'Face and head top both go here; patterns turn with the head',
    '改为随转头': 'Turn with head',
    '头壳花纹转头时不动，眼睛会滑出花纹；改成跟着转头（正脸外观不变）': 'Skull patterns stay still while the head turns, so the eyes slide out of them. Make them turn with the head (front view unchanged)',
    '全部改为随转头': 'Make all turn with head',
    '转头检查': 'Turn Check',
    '并排看向左转、正脸、向右转，检查花纹是否跟着头走': 'Left turn, front and right turn side by side: check that patterns follow the head',
    '向左转': 'Turned left',
    '正脸': 'Front',
    '向右转': 'Turned right',
    '向左转时的样子': 'Turned left',
    '正脸的样子': 'Front view',
    '向右转时的样子': 'Turned right',
    '保持不变': 'Keep as is',
    '已改为随转头，可以晃晃鼠标看看': 'Now turns with the head. Move the mouse to check',
    '身体': 'Body',
    '身体 body': 'Body',
    '身体组件': 'Body Part',
    '耳朵': 'Ears',
    '左耳': 'Left Ear',
    '右耳': 'Right Ear',
    '内耳': 'Inner Ear',
    '左手臂': 'Left Arm',
    '右手臂': 'Right Arm',
    '左胳膊': 'Left Arm',
    '右胳膊': 'Right Arm',
    '后腿': 'Hind Leg',
    '尾巴': 'Tail',
    '尾巴 tail': 'Tail',
    '尾根': 'Tail Base',
    '尾尖': 'Tail Tip',
    '← 肩部（根部）': '← Shoulder (Root)',
    '← 小爪子': '← Paw',
    '← 腿根（臀部）': '← Hip (Root)',
    '← 后爪子（三键踩键）': '← Hind Paw (3-Key Press)',
    '▲ 肩部渐变区': '▲ Shoulder Gradient',
    '▼ 白手套 / 爪子区': '▼ Mitten / Paw Area',
    '← 头部/躯干分界': '← Head / Body Split',
    '动态尾巴区(可留空)': 'Dynamic Tail Area (optional)',
    '键盘与打字爪区（猫身画在此线上方）': 'Keyboard & Typing Paws (draw cat above this line)',
    'KuroCat 手绘参考底图 (720×640) · 新建图层绘制，导出前隐藏本参考层': 'KuroCat Reference Template (720×640) · Draw on a new layer & hide before export',

    // Live Preview Action States
    '自由互动': 'Free Play',
    '真实实时互动模式：打字、撸猫、拎起、狂甩鼠标晕倒': 'Interactive mode: type, pet, pick up, or shake mouse to dizzy',
    '敲键盘打字 · 狂甩鼠标晕倒 · 轻抚撸猫 · 按住拎起拖拽': 'Type on keyboard · Shake mouse to dizzy · Pet head · Drag to pick up',
    '敲键盘打字 · 轻抚撸猫 · 按住拎起': 'Type on keyboard · Pet head · Drag to pick up',
    '打字': 'Typing',
    '自动连击敲键盘': 'Auto-typing on keyboard',
    '踩键': '3-Key Paw',
    '3 键后脚踹 + 4 键尾巴敲键盘彩蛋': '3-key hind paw + 4-key tail press easter egg',
    '撸猫': 'Petting',
    '轻抚猫头眯眼享受': 'Petting head with cozy closed eyes',
    '拎起': 'Pick Up',
    '拎起后颈 2D 惯性晃动（自由模式按住小猫直接拖）': 'Picked up by scruff with 2D physics (drag cat in Free Play)',
    '晕倒': 'Dizzy',
    '螺旋晕眼 + 倒地转金星（自由模式狂甩鼠标也可触发）': 'Spiral dizzy eyes + stars (shake mouse fast in Free Play)',
    '生气': 'Angry',
    '高速狂敲触发皱眉暴怒 💢': 'Fast typing triggers angry furrowed brows 💢',
    '团球睡': 'Curled Sleep',
    '团成猫球睡觉 + 尾巴前卷': 'Curled up sleeping + tail wrapped forward',
    '数位板': 'Tablet',
    '2.5D 数位板与压感触控笔': '2.5D Drawing Tablet & Stylus',
    '皮肤试玩': 'Test Skin',
    '桌宠动作状态预览': 'Pet Action State Preview',
    '试玩动作预览': 'Action Preview',
    '实时 2.5D 模拟': 'Live 2.5D Simulation',
    '预览背景': 'Preview BG',

    // Bottom Dock: Accessories, Palette, Shape, More Drawer
    '配饰': 'Accessories',
    '配饰装扮': 'Accessories',
    '配饰与贴纸装扮': 'Accessories & Stickers',
    '配饰横向选择条': 'Accessory Strip',
    '向左浏览配饰': 'Scroll Accessories Left',
    '向右浏览配饰': 'Scroll Accessories Right',
    '向左滑动': 'Scroll Left',
    '向右滑动': 'Scroll Right',
    '全部摘下': 'Remove All',
    '已摘下全部配饰': 'Removed all accessories',
    '已佩戴配饰': 'Equipped accessory',
    '正在微调配饰': 'Adjusting accessory',
    '调整配饰：拖动移动位置 · 拖右下角缩放 · 拖顶部圆点旋转': 'Adjust: Drag to move · Bottom-right to scale · Top dot to rotate',
    '重置位置': 'Reset Position',
    '已重置配饰位置': 'Reset accessory position',
    '往顶层移': 'Bring Forward',
    '往底层移': 'Send Backward',
    '水平居中': 'Center Horizontally',
    '+ 上传': '+ Upload',
    '上传自己的透明 PNG / 贴纸': 'Upload transparent PNG / sticker',
    '头顶': 'Head Top',
    '头顶 (headTop)': 'Head Top (headTop)',
    '头顶（帽子 / 发卡）': 'Head Top (Hats / Hairpins)',
    '脸部 (face)': 'Face (face)',
    '脸部（眼镜 / 贴纸）': 'Face (Glasses / Stickers)',
    '颈部': 'Neck',
    '颈部 (neck)': 'Neck (neck)',
    '颈部（项圈 / 围巾）': 'Neck (Collars / Scarves)',
    '尾尖 (tailTip)': 'Tail Tip (tailTip)',
    '尾尖（蝴蝶结 / 挂件）': 'Tail Tip (Bows / Charms)',
    '头饰': 'Headwear',
    '自定义配饰': 'Custom Accessory',
    '左右偏移': 'X Offset',
    '大小缩放': 'Scale',
    '旋转角度': 'Rotation',
    '佩戴部位': 'Anchor',

    // Built-in Accessories
    '招财小鱼发卡': 'Lucky Fish Hairpin',
    '幸运小发芽': 'Lucky Sprout',
    '草莓蝴蝶结': 'Strawberry Bow',
    '樱花小发卡': 'Sakura Hairpin',
    '小金皇冠': 'Golden Crown',
    '小天使光环': 'Angel Halo',
    '画家贝雷帽': 'Artist Beret',
    '小绅士礼帽': 'Top Hat',
    '电竞耳机': 'Gaming Headset',
    '酷酷墨镜': 'Cool Sunglasses',
    '金丝圆眼镜': 'Round Gold Glasses',
    '害羞粉腮红': 'Shy Pink Blush',
    '呆萌创可贴': 'Cute Bandage',
    '红项圈金铃铛': 'Red Collar & Bell',
    '绅士红领结': 'Red Bowtie',
    '打工人小领带': 'Office Necktie',
    '暖冬小红围巾': 'Warm Red Scarf',
    '尾尖蝴蝶结': 'Tail Tip Bow',
    '尾尖小星星': 'Tail Tip Star',

    // More Drawer & Photo-to-Cat
    '更多创作工具': 'More Creation Tools',
    '更多工具': 'More Tools',
    '照片生成小猫': 'Photo to Cat',
    '照片小猫': 'Photo Cat',
    '真实猫照片': 'Real Cat Photo',
    '拖入真实猫咪照片，或点击上传': 'Drop a real cat photo here, or click to upload',
    '选择真实猫照片': 'Choose Cat Photo',
    '推荐正面清晰拍到花色与毛色 · 纯本地识别，不上传服务器': 'Clear front-facing photo works best · 100% local, never uploaded',
    '橙色圈对准猫脸 · 拖动平移 · 滚轮缩放': 'Align orange circle with cat face · Drag to pan · Scroll to zoom',
    '重新点猫鼻子': 'Re-pick Cat Nose',
    '跳过，用整张图': 'Skip, Use Full Image',
    '提取毛色数量': 'Color Count',
    '2 色': '2 Colors',
    '3 色（推荐）': '3 Colors (Recommended)',
    '4 色': '4 Colors',
    '5 色': '5 Colors',
    '色块曲线平滑度': 'Curve Smoothness',
    '虎斑条纹叠加': 'Tabby Stripes Overlay',
    '自动检测': 'Auto Detect',
    '强制叠加': 'Force Stripes',
    '关闭条纹': 'No Stripes',
    '重点色柔焦面罩': 'Colorpoint Soft Mask',
    '柔焦重点色提取': 'Soft Colorpoint Extraction',
    '吸取主毛色': 'Pick Main Fur',
    '吸取瞳色': 'Pick Eye Color',
    '提取瞳色': 'Extract Eye Color',
    '等待上传图片': 'Waiting for image',
    '等待定位猫脸': 'Waiting to locate cat face',
    '换一张图': 'Change Image',
    '色块向量化': 'Vectorize Art',
    '色块向量化提取': 'Vectorize Artwork',
    '手绘 / 板绘猫图': 'Hand-drawn / Digital Art',
    '拖入你的手绘 / 板绘小猫图，或点击上传': 'Drop your hand-drawn cat art here, or click to upload',
    '选择手绘 / 板绘图': 'Choose Artwork',
    '手绘原图直用': 'Use Original Art',
    '保留原画五官': 'Keep Original Face',
    '挖空启用动态眨眼': 'Cut Out Eyes for Blinking',
    '自动去白底 / 纯色背景': 'Auto Remove Solid Background',
    '自动去纯色底（适合白底图片）': 'Auto Remove White/Solid BG',

    // Templates & Presets
    '模板库': 'Templates',
    '热门猫咪预设': 'Popular Presets',
    '内置官方皮肤': 'Built-in Skins',
    '换模板': 'Switch Template',
    '点击载入并二次修改': 'Click to load and customize',
    '经典小黑猫': 'Classic Black Cat',
    '挖煤暹罗猫': 'Siamese Cat',
    '美短（银虎斑加白）': 'American Shorthair',
    '橘白猫': 'Orange & White Cat',
    '纯白素胚': 'Pure White Base',
    '纯白素胚小猫': 'Pure White Cat Base',
    '白猫素胚': 'White Cat Base',
    '英短蓝猫': 'British Shorthair Blue',
    '海双布偶猫': 'Seal Bicolor Ragdoll',
    '软萌三花猫': 'Soft Calico Cat',
    '草莓奶油三花猫': 'Strawberry Cream Calico',
    '燕尾服奶牛猫': 'Tuxedo Cat',
    '黑白礼服': 'Black & White Tuxedo',

    // Palette & Shape Controls
    '毛色与五官调色板': 'Fur & Feature Palette',
    '骨架与体型轮廓': 'Rig & Body Proportions',
    '头部底色': 'Head Base',
    '躯干底色': 'Body Base',
    '四肢颜色': 'Limbs Color',
    '手臂毛色': 'Arm Fur',
    '后腿毛色': 'Hind Leg Fur',
    '尾巴毛色': 'Tail Fur',
    '尾巴底色': 'Tail Base',
    '尾尖颜色': 'Tail Tip',
    '肚皮颜色': 'Belly Color',
    '爪子/白手套': 'Paws / Mittens',
    '打字爪色': 'Typing Paw Color',
    '后爪颜色': 'Hind Paw Color',
    '肉垫颜色': 'Paw Pads',
    '外耳毛色': 'Outer Ear',
    '内耳肉色': 'Inner Ear',
    '内耳颜色': 'Inner Ear',
    '眼睛虹膜': 'Iris Color',
    '默认瞳色': 'Default Eye Color',
    '双眼默认虹膜色': 'Default Iris Color',
    '左眼虹膜色（异瞳）': 'Left Eye (Heterochromia)',
    '右眼虹膜色（异瞳）': 'Right Eye (Heterochromia)',
    '小鼻头': 'Nose',
    '小鼻头与嘴巴': 'Nose & Mouth',
    '嘴巴': 'Mouth',
    '隐藏嘴巴': 'Hide Mouth',
    '胡须颜色': 'Whiskers',
    '手臂折痕线': 'Arm Crease',
    '身体渐变底色': 'Body Gradient',
    '基础骨架 (shape.build)': 'Body Build (shape.build)',
    '圆润标准 (standard)': 'Standard (Rounded)',
    '修长纤细 (sleek)': 'Sleek (Slender)',
    '头部花纹曲面 (headSurface)': 'Head Surface (headSurface)',
    '3D 球面跟随 (dome)': '3D Spherical (dome)',
    '平面贴图 (plane)': 'Flat Plane (plane)',
    '头部大小': 'Head Size',
    '腮帮饱满度': 'Cheek Fullness',
    '腮帮圆润': 'Cheek Roundness',
    '身体胖瘦': 'Body Width',
    '身宽圆润度': 'Body Roundness',
    '脖子粗细': 'Neck Width',
    '脖子宽度': 'Neck Width',
    '耳朵大小': 'Ear Size',
    '双耳间距': 'Ear Spacing',
    '耳根宽度': 'Ear Base Width',
    '耳尖锐度': 'Ear Tip Sharpness',
    '耳尖尖度': 'Ear Pointiness',
    '手臂长短': 'Arm Length',
    '双手间距': 'Paw Spacing',
    '手臂根部高低': 'Arm Root Height',
    '双爪错落': 'Paw Stagger',
    '后爪错落度': 'Hind Paw Stagger',
    '后腿粗细': 'Hind Leg Width',
    '后腿根部位置': 'Hind Leg Root',
    '尾巴长度': 'Tail Length',
    '尾巴粗细': 'Tail Thickness',
    '尾根高低': 'Tail Base Height',
    '伸出长度': 'Reach Length',
    '根部左右': 'Root X',
    '根部高低': 'Root Y',

    // Pen & Curves & Stripes
    '钢笔与源码': 'Pen & JSON',
    '曲线分区列表 (regions)': 'Curve Regions (regions)',
    '条纹与图形 (marks)': 'Stripes & Marks (marks)',
    '快捷添加花纹分区': 'Quick Add Pattern Regions',
    '+ 白肚皮 / 围脖': '+ White Belly / Bib',
    '+ 八字白脸': '+ Inverted-V Face',
    '+ 白嘴套': '+ White Muzzle',
    '+ 左脸花斑': '+ Left Face Patch',
    '+ 右脸花斑': '+ Right Face Patch',
    '+ 深色耳尖': '+ Dark Ear Tips',
    '+ 额头 M 纹': '+ Forehead M-Stripes',
    '+ 尾巴环纹': '+ Tail Rings',
    '+ 胳膊条纹': '+ Arm Stripes',
    '查看 / 复制 .kurocat JSON 源码': 'View / Copy .kurocat JSON',
    '复制 JSON': 'Copy JSON',
    '已复制 .kurocat JSON 到剪贴板': 'Copied .kurocat JSON to clipboard',
    '钢笔闭合色块': 'Pen Closed Region',
    '钢笔条纹': 'Pen Stripe',
    '自由画笔色块': 'Freehand Region',
    '自由画笔线条': 'Freehand Stroke',
    '分割线点一侧上色': 'Split Line Fill',
    '点回白色起点闭合 · 或按「闭合」': 'Click white start point to close · or press "Close Path"',
    '继续放点 · 至少 2 个点': 'Keep placing points · at least 2 points',
    '至少放 3 个点才能闭合': 'Place at least 3 points to close',
    '条纹至少要 2 个点': 'A stripe needs at least 2 points',
    '分割线至少要 2 个点': 'A split line needs at least 2 points',
    '点在线的某一侧来上色': 'Click one side of the line to fill',
    '画在哪个部位': 'Target Part',
    '分区颜色': 'Region Color',
    '条纹粗细': 'Stroke Width',
    '完成锚点编辑': 'Done Editing Anchors',
    '完成锚点编辑（点击空白处也可完成）': 'Done Editing Anchors (or click empty area)',
    '调锚点': 'Edit Anchors',
    '清空条纹': 'Clear Stripes',
    '已清空所有条纹图形': 'Cleared all stripe marks',
    '已撤销': 'Undone',
    '已重做': 'Redone',
    '已吸取颜色': 'Picked color',

    // Plaza
    '广场分类': 'Plaza Categories',
    '全部': 'All',
    '键盘配色': 'Keyboard Themes',
    '社区创作者': 'Community Creators',
    '在工坊二次编辑': 'Edit in Workshop',
    '下载 .kurocat': 'Download .kurocat',
    '下载 .kurokb': 'Download .kurokb',
    '下载饰品 PNG': 'Download PNG',
    '试玩': 'Try It',
    '佩戴到当前小猫': 'Equip on Cat',
    '应用到预览键盘': 'Apply to Preview Keyboard',
    '配饰分类': 'Accessory Categories',
    '配色风格': 'Color Styles',
    '图片类型': 'Image Types',
    '全部体型': 'All Builds',
    '默认佩戴到': 'Default Anchor',
    '全部按键': 'All Keys',
    '常规键帽': 'Regular Keys',
    '强调主键': 'Accent Keys',
    '键盘底座': 'Keyboard Base',
    '键盘面板': 'Keyboard Plate',
    '键帽描边': 'Keycap Outline',
    '鼠标机身': 'Mouse Body',
    '鼠标轮廓': 'Mouse Outline',
    '滚轮颜色': 'Scroll Wheel',
    '经典奶白暖黄': 'Classic Warm Cream',
    '暗夜极客黑': 'Midnight Geek Black',
    '复古奶油灰': 'Retro Cream Gray',
    '欢迎试玩我的 KuroCat 社区作品！': 'Try out my KuroCat community creation!',

    // Submission Modal & Guide
    '投稿文件打包助手': 'Submission Packager',
    '1. 投稿皮肤': '1. Submit Skin',
    '2. 投稿饰品': '2. Submit Accessory',
    '3. 投稿键盘': '3. Submit Keyboard',
    '作品名称': 'Title',
    '例如：草莓奶昔猫': 'e.g. Strawberry Milkshake Cat',
    '目录标识 slug（小写字母 / 数字 / 连字符）': 'Directory slug (lowercase / digits / hyphens)',
    '例如：strawberry-cat': 'e.g. strawberry-cat',
    '制作人昵称': 'Creator Name',
    '你的昵称或 GitHub ID': 'Your nickname or GitHub ID',
    '你的昵称': 'Your nickname',
    '制作人主页链接（可选）': 'Creator URL (Optional)',
    '作品简介（展示在广场卡片上，最多 140 字）': 'Description (shown on Plaza card, max 140 chars)',
    '标签（空格或逗号分隔，最多 6 个）': 'Tags (space or comma separated, max 6)',
    '例如：橘猫 治愈 原创配色': 'e.g. tabby cozy original',
    '目标提交目录：': 'Target Directory:',
    '预览生成的 meta.json': 'Preview generated meta.json',
    '查看 AI Agent 自动投稿提示词': 'View AI Agent Auto-Submit Prompt',
    '不会 Git？直接提 Issue 投稿': 'No Git? Submit via Issue',
    '投稿当前皮肤': 'Submit Current Skin',
    '投稿自定义饰品': 'Submit Custom Accessory',
    '投稿键盘配色': 'Submit Keyboard Theme',
    '投稿皮肤': 'Submit Skin',
    '投稿饰品': 'Submit Accessory',
    '投稿键盘': 'Submit Keyboard',
    '提 Issue 投稿皮肤': 'Submit Skin via Issue',
    '提 Issue 投稿饰品': 'Submit Accessory via Issue',
    '提 Issue 投稿键盘': 'Submit Keyboard via Issue',
    '给 Agent 与开发者的投稿规范': 'Submission Spec for Agents & Developers',
    '有 AI Agent？复制下面这段话发给它就能自动投稿': 'Have an AI Agent? Copy this prompt to auto-submit',
    '复制发给 Agent': 'Copy for Agent',
    '提示词已复制到剪贴板': 'Prompt copied to clipboard',
    '复制失败，请手动选中复制': 'Copy failed, please copy manually',
    '没有 AI Agent，也不会用 Git 提 PR？': 'No AI Agent or Git experience?',
    '没关系！你可以直接点击下面的 GitHub Issue 表单，把文件拖进网页文本框并填写作者与简介，维护者审核后会帮你打包上架到广场。': 'No problem! Click a GitHub Issue form below, drag your file into the description box, and maintainers will package & publish it for you.',
    '用网页打包助手生成文件': 'Use Web Packager',
    '选择投稿类型提示词': 'Choose Submission Type',
    '每件作品独立目录': 'Isolated Folder per Entry',
    'AI Agent 一键投稿 · Fork PR 规范 · 无代码 Issue': 'AI Agent 1-Click Submit · Fork PR Spec · No-Code Issue',
    '提交 PR 前的本地校验命令（Node.js 18+，零依赖）': 'Local validation command before PR (Node.js 18+, zero deps)',
    '浅色键帽使用深色字符（暗色键盘请取消勾选）': 'Use dark legends on light keycaps (uncheck for dark keyboards)',
    '默认佩戴部位 (anchor)': 'Default Anchor (anchor)',
    '选择饰品 PNG（当前已佩戴或本地上传）': 'Choose Accessory PNG (equipped or upload)',
    '-- 从本地选择 PNG 文件 --': '-- Choose local PNG file --',
    '已下载 meta.json': 'Downloaded meta.json',
    '已下载 skin.kurocat': 'Downloaded skin.kurocat',
    '已下载 preview.png': 'Downloaded preview.png',
    '已下载 accessory.png': 'Downloaded accessory.png',
    '已下载 keyboard.json': 'Downloaded keyboard.json',
    '已载入饰品 PNG': 'Loaded accessory PNG',
    '读取图片失败': 'Failed to read image',
    '请上传 PNG / WebP / JPG / SVG 图片': 'Please upload a PNG / WebP / JPG / SVG image',
    '请选择 JPG / PNG / WebP 格式的猫咪照片': 'Please select a JPG / PNG / WebP cat photo',
    '无法解析这张图片': 'Unable to parse this image',
    '画圈范围太小，拖动大一点试试': 'Selection too small, try dragging larger',
    '最多同时佩戴 8 件配饰，请先摘下一件': 'Max 8 accessories at once, please remove one first',
    '最多同时佩戴 8 件配饰，请先在配饰装扮中摘下一件': 'Max 8 accessories at once, please remove one in Accessories first',
    '最多 64 个分区，先删掉一些再画': 'Max 64 regions, delete some before drawing more',
    '最多 256 条条纹，先删掉一些再画': 'Max 256 stripes, delete some before drawing more',
    '花纹笔触已达 256 条上限，可用橡皮擦清理后再画': 'Reached 256 stroke limit; use Eraser to clean up first',

    // Validation messages
    '皮肤名称 name 不能为空': 'Skin name cannot be empty',
    '皮肤名称不能超过 40 字': 'Skin name cannot exceed 40 characters',
    'author 必须是字符串': 'author must be a string',
    'formatVersion 必须为 1': 'formatVersion must be 1',
    '缺少 palette 调色板': 'Missing palette object',
    'palette.body 必须是 #RRGGBB 或 #RRGGBBAA': 'palette.body must be #RRGGBB or #RRGGBBAA',
    'shape.build 必须是 standard 或 sleek': 'shape.build must be standard or sleek',
    'headSurface 必须是 dome 或 plane': 'headSurface must be dome or plane',
    'idleLegs 必须是 legs 或 chest': 'idleLegs must be legs or chest',
    'regions 必须是数组': 'regions must be an array',
    'regions 最多 64 个分区': 'regions can have at most 64 items',
    'marks 必须是数组': 'marks must be an array',
    'marks 最多 256 条': 'marks can have at most 256 items',
    'decorations 必须是数组': 'decorations must be an array',
    'decorations 最多 8 个贴纸': 'decorations can have at most 8 items',
    '皮肤文件最外层必须是 JSON 对象': 'Skin file root must be a JSON object',
    '当前皮肤未通过规范校验：': 'Skin failed validation:',
    '导入失败：': 'Import failed: ',
    '导出失败：': 'Export failed: ',
    '载入失败：': 'Load failed: ',
    '载入皮肤失败：': 'Failed to load skin: ',
    '载入试玩皮肤失败：': 'Failed to load preview skin: ',
    '佩戴饰品失败：': 'Failed to equip accessory: ',
  };

  const PATTERN_RULES = [
    [/^✓ 桌宠 ([\d.]+)\+ 可用 · ([\d.]+) KB$/, '✓ Desktop $1+ · $2 KB'],
    [/^⚠ 桌宠暂不支持「(.+)」造型 · ([\d.]+) KB$/, '⚠ Desktop pet can\'t draw the "$1" look yet · $2 KB'],
    [/^(\d+) \/ (\d+) · 需 KuroCat ([\d.]+)\+$/, '$1 / $2 · needs KuroCat $3+'],
    [/^最多 (\d+) 条条纹，先删掉一些再画$/, 'At most $1 marks. Delete some before drawing more'],
    [/^最多 (\d+) 条条纹$/, 'At most $1 marks'],
    [/^花纹笔触已达 (\d+) 条上限，可用橡皮擦清理后再画$/, 'Reached the $1-mark limit. Erase some strokes to keep drawing'],
    [/^有 (\d+) 个头部花纹画在「头壳」上，转头时不会跟着转$/, '$1 head pattern(s) sit on the Skull layer and won\'t turn with the head'],
    [/^已把 (\d+) 个花纹改为随转头（正脸外观不变，可撤销）$/, 'Converted $1 pattern(s) to turn with the head (front view unchanged, undoable)'],
    [/^(\d+)\s*款作品$/, '$1 items'],
    [/^(\d+)\s*款配色$/, '$1 themes'],
    [/^全部\s*\((\d+)\)$/, 'All ($1)'],
    [/^全部部位\s*\((\d+)\)$/, 'All Anchors ($1)'],
    [/^已导入「(.+)」$/, 'Imported "$1"'],
    [/^已导出\s*(.+?)\.kurocat.*$/, 'Exported $1.kurocat — drag onto KuroCat!'],
    [/^已下载「(.+?)\.kurocat」.*$/, 'Downloaded "$1.kurocat"'],
    [/^已下载「(.+?)\.kurokb」.*$/, 'Downloaded "$1.kurokb"'],
    [/^已下载饰品图片「(.+?)」$/, 'Downloaded accessory "$1"'],
    [/^已将「(.+?)」底色填充为\s*(.+)$/, 'Filled "$1" base color with $2'],
    [/^已应用键盘配色「(.+?)」$/, 'Applied keyboard theme "$1"'],
    [/^已佩戴「(.+?)」.*$/, 'Equipped "$1" (drag on cat to adjust)'],
    [/^已为当前小猫佩戴「(.+?)」.*$/, 'Equipped "$1" on cat'],
    [/^已上传并佩戴「(.+?)」.*$/, 'Uploaded & equipped "$1"'],
    [/^已摘下「(.+?)」$/, 'Removed "$1"'],
    [/^已载入皮肤「(.+?)」$/, 'Loaded skin "$1"'],
    [/^已载入模板「(.+?)」$/, 'Loaded template "$1"'],
    [/^已在工坊打开「(.+?)」$/, 'Opened "$1" in Workshop'],
    [/^广场\s*·\s*(.+)$/, 'Plaza · $1'],
    [/^广场皮肤\s*·\s*(.+)$/, 'Plaza Skin · $1'],
    [/^模板\s*·\s*(.+)$/, 'Template · $1'],
    [/^制作人：(.+?)\s*·\s*(.*)$/, 'By $1 · $2'],
    [/^制作人：(.+)$/, 'By $1'],
    [/^分区 #(\d+)$/, 'Region #$1'],
    [/^配饰 #(\d+)$/, 'Accessory #$1'],
    [/^微调：(.+)$/, 'Adjusting: $1'],
    [/^含 (\d+) 件配饰$/, 'Includes $1 accessories'],
    [/^底色 (\d+)%$/, 'Base $1%'],
    [/^色块(\d+) (\d+)%$/, 'Swatch $1 · $2%'],
    [/^(\d+) 条$/, '$1 strokes'],
    [/^(\d+) 色$/, '$1 colors'],
    [/^(.+?) · 镜像$/, '$1 · Mirror'],
    [/^(\d+(?:\.\d+)?) KB（导出时将附带 preview 缩略图）$/, '$1 KB (preview thumbnail included on export)'],
    [/^palette\.(\w+) 颜色格式无效 \((.+)\)$/, 'Invalid color format for palette.$1 ($2)'],
    [/^regions\[(\d+)\]\.anchors 需要 2-128 个锚点$/, 'regions[$1].anchors requires 2–128 points'],
    [/^regions\[(\d+)\]\.fill 颜色无效$/, 'Invalid fill color in regions[$1]'],
    [/^regions\[(\d+)\]\.space 无效$/, 'Invalid space in regions[$1]'],
    [/^marks\[(\d+)\]\.(\w+) 无效$/, 'Invalid $2 in marks[$1]'],
    [/^decorations\[(\d+)\]\.anchor 必须是 headTop \/ face \/ neck \/ tailTip 之一$/, 'decorations[$1].anchor must be headTop / face / neck / tailTip'],
    [/^decorations\[(\d+)\]\.png 超过 1 MB$/, 'decorations[$1].png exceeds 1 MB'],
    [/^decorations\[(\d+)\]\.png 尺寸超过 1024×1024$/, 'decorations[$1].png exceeds 1024×1024'],
  ];

  function translateText(str) {
    if (currentLang === 'zh' || typeof str !== 'string' || !str) return str;
    const trimmed = str.trim();
    if (!trimmed) return str;

    if (Object.prototype.hasOwnProperty.call(EN_DICT, trimmed)) {
      const lead = str.match(/^\s*/)[0];
      const trail = str.match(/\s*$/)[0];
      return lead + EN_DICT[trimmed] + trail;
    }

    for (let i = 0; i < PATTERN_RULES.length; i++) {
      const [re, rep] = PATTERN_RULES[i];
      if (re.test(trimmed)) {
        const lead = str.match(/^\s*/)[0];
        const trail = str.match(/\s*$/)[0];
        return lead + trimmed.replace(re, rep) + trail;
      }
    }
    return str;
  }

  const TRANS_ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

  function processTextNode(node) {
    if (!node || !node.nodeValue) return;
    if (node.parentElement && (node.parentElement.tagName === 'SCRIPT' || node.parentElement.tagName === 'STYLE' || node.parentElement.tagName === 'PRE' || node.parentElement.tagName === 'CODE')) {
      return;
    }
    if (currentLang === 'en') {
      if (node._kuroZh === undefined) {
        if (/[\u4e00-\u9fff]/.test(node.nodeValue)) {
          node._kuroZh = node.nodeValue;
        } else {
          return;
        }
      }
      const next = translateText(node._kuroZh);
      if (next !== node.nodeValue) node.nodeValue = next;
    } else if (node._kuroZh !== undefined) {
      if (node.nodeValue !== node._kuroZh) node.nodeValue = node._kuroZh;
    }
  }

  function processElementAttrs(el) {
    if (!el || el.nodeType !== 1) return;
    for (let i = 0; i < TRANS_ATTRS.length; i++) {
      const attr = TRANS_ATTRS[i];
      const val = el.getAttribute(attr);
      if (!val) continue;
      const storeKey = 'kuroZh_' + attr;
      if (currentLang === 'en') {
        if (el[storeKey] === undefined) {
          if (/[\u4e00-\u9fff]/.test(val)) {
            el[storeKey] = val;
          } else {
            continue;
          }
        }
        const next = translateText(el[storeKey]);
        if (next !== val) el.setAttribute(attr, next);
      } else if (el[storeKey] !== undefined) {
        if (val !== el[storeKey]) el.setAttribute(attr, el[storeKey]);
      }
    }
    // Also handle default value of skin-name / skin-author inputs if untouched
    if (el.id === 'skin-name' && el.value === '我的桌面小猫' && currentLang === 'en') {
      el._kuroZhVal = '我的桌面小猫';
      el.value = 'My Desktop Cat';
    } else if (el.id === 'skin-name' && el._kuroZhVal && el.value === 'My Desktop Cat' && currentLang === 'zh') {
      el.value = el._kuroZhVal;
    }
    if (el.id === 'skin-author' && el.value === 'KuroCat 皮肤工坊' && currentLang === 'en') {
      el._kuroZhVal = 'KuroCat 皮肤工坊';
      el.value = 'KuroCat Workshop';
    } else if (el.id === 'skin-author' && el._kuroZhVal && el.value === 'KuroCat Workshop' && currentLang === 'zh') {
      el.value = el._kuroZhVal;
    }
  }

  let observer = null;
  let isApplying = false;

  function applyDOM(root) {
    if (isApplying) return;
    isApplying = true;
    try {
      const target = root || document.body;
      if (!target) return;

      if (target === document.body) {
        if (!document._kuroZhTitle) document._kuroZhTitle = document.title;
        document.title = currentLang === 'en' ? translateText(document._kuroZhTitle) : document._kuroZhTitle;
        document.documentElement.lang = currentLang === 'en' ? 'en' : 'zh-CN';
      }

      const walker = document.createTreeWalker(target, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
      let node = walker.currentNode;
      while (node) {
        if (node.nodeType === 1) {
          processElementAttrs(node);
        } else if (node.nodeType === 3) {
          processTextNode(node);
        }
        node = walker.nextNode();
      }

      const toggleBtn = document.getElementById('btn-lang-toggle');
      if (toggleBtn) {
        toggleBtn.textContent = currentLang === 'en' ? '中文' : 'EN';
        toggleBtn.setAttribute('aria-label', currentLang === 'en' ? '切换为简体中文' : 'Switch to English');
        toggleBtn.setAttribute('title', currentLang === 'en' ? '切换为简体中文' : 'Switch to English');
      }
    } finally {
      isApplying = false;
    }
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver((mutations) => {
      if (isApplying || currentLang === 'zh') return;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type === 'characterData') {
          isApplying = true;
          try { processTextNode(m.target); } finally { isApplying = false; }
        } else if (m.type === 'attributes') {
          isApplying = true;
          try { processElementAttrs(m.target); } finally { isApplying = false; }
        } else if (m.type === 'childList') {
          for (let j = 0; j < m.addedNodes.length; j++) {
            const added = m.addedNodes[j];
            if (added.nodeType === 1) applyDOM(added);
            else if (added.nodeType === 3) {
              isApplying = true;
              try { processTextNode(added); } finally { isApplying = false; }
            }
          }
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANS_ATTRS,
    });
  }

  function setLang(lang) {
    const next = lang === 'en' ? 'en' : 'zh';
    if (next === currentLang) return;
    currentLang = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
    applyDOM(document.body);
    window.dispatchEvent(new CustomEvent('kurocat:langchange', { detail: { lang: next } }));
  }

  function init() {
    applyDOM(document.body);
    startObserver();
    const toggleBtn = document.getElementById('btn-lang-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        setLang(currentLang === 'en' ? 'zh' : 'en');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.KuroI18n = {
    get lang() { return currentLang; },
    setLang,
    t: translateText,
    applyDOM,
  };
  window.t = translateText;
})();
