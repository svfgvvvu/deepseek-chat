// ==UserScript==
// @name         DeepSeek D2+wireloom图渲染
// @namespace    https://github.com/svfgvvvu/deepseek-chat
// @version      3.3.0
// @description  为 AI Chat 中的 d2 / wireloom 代码块提供手动/自动渲染切换、分组对比、复制图片、放大查看
// @author       zhuang.wang
// @match        https://chat.deepseek.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      cdn.jsdelivr.net
// @connect      esm.sh
// @run-at       document-idle
// @license      MIT
// @homepageURL  https://github.com/svfgvvvu/deepseek-chat
// @supportURL   https://github.com/svfgvvvu/deepseek-chat/issues
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // 配置
    // ============================================================
    const AUTO_RENDER = false;    // 默认模式（首次安装/清除存储时生效）；可在 FAB 里随时切换
    const INJECT_DELAY = 300;
    const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
    const MAX_CACHE = 10;         // 最多缓存 10 张已渲染的图
    const TAG = '[DS-Graph]';
    function error(...a) { console.error(TAG, ...a); }

    // 当前生效的渲染模式（持久化到 GM 存储）
    let currentAutoRender = (() => {
        try {
            const v = GM_getValue('ds_graph_auto_render', null);
            return v === null ? AUTO_RENDER : !!v;
        } catch (e) { return AUTO_RENDER; }
    })();

    // ============================================================
    // 工具函数
    // ============================================================
    function simpleHash(str) {
        let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ c, 2654435761);
            h2 = Math.imul(h2 ^ c, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
    }

    function getSvgNaturalSize(svgEl) {
        const wAttr = parseFloat(svgEl.getAttribute('width'));
        const hAttr = parseFloat(svgEl.getAttribute('height'));
        if (wAttr && hAttr) return { w: wAttr, h: hAttr };
        const vb = svgEl.getAttribute('viewBox');
        if (vb) {
            const p = vb.split(/[\s,]+/).map(Number);
            if (p[2] && p[3]) return { w: p[2], h: p[3] };
        }
        return { w: 800, h: 600 };
    }

    function prepareSvg(svgString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        const svg = doc.documentElement;
        if (!svg.getAttribute('viewBox')) {
            const w = parseFloat(svg.getAttribute('width')) || 800;
            const h = parseFloat(svg.getAttribute('height')) || 600;
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        }
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.style.cssText = 'width:100%; height:auto; display:block; max-width:100%;';
        return svg.outerHTML;
    }

    async function copySvgAsPng(svgEl, scale) {
        scale = scale || 2;
        const clone = svgEl.cloneNode(true);
        const { w, h } = getSvgNaturalSize(clone);
        clone.setAttribute('width', w);
        clone.setAttribute('height', h);
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const svgStr = new XMLSerializer().serializeToString(clone);
        const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        try {
            const img = new Image();
            await new Promise((res, rej) => {
                img.onload = res;
                img.onerror = () => rej(new Error('SVG 转图片失败'));
                img.src = url;
            });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(w * scale);
            canvas.height = Math.ceil(h * scale);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const pngBlob = await new Promise((res, rej) => {
                canvas.toBlob(b => b ? res(b) : rej(new Error('PNG 生成失败')), 'image/png');
            });
            await navigator.clipboard.write([ new ClipboardItem({ 'image/png': pngBlob }) ]);
            return true;
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    function isInViewport(el, margin) {
        margin = margin || 300;
        const rect = el.getBoundingClientRect();
        return rect.bottom > -margin && rect.top < window.innerHeight + margin;
    }

    // ============================================================
    // Adapter 层：平台适配
    // ============================================================
    const ADAPTERS = [
        {
            name: 'deepseek',
            matches: () => location.hostname === 'chat.deepseek.com',
            findCodeBlocks(root) {
                return root.querySelectorAll('.md-code-block');
            },
            getLanguage(block) {
                const banner = block.querySelector('.md-code-block-banner');
                if (!banner) return '';
                const clone = banner.cloneNode(true);
                clone.querySelectorAll('[role="button"]').forEach(b => b.remove());
                return clone.textContent.trim().toLowerCase();
            },
            getSource(block) {
                const pre = block.querySelector('pre');
                if (!pre) return '';
                const spans = pre.querySelectorAll(':scope > span');
                let lines = spans.length > 0
                    ? Array.from(spans).map(s => s.textContent)
                    : pre.textContent.split(/\r?\n/);
                const cleaned = [];
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    if (trimmed.startsWith('```')) continue;
                    cleaned.push(line);
                }
                return cleaned.join('\n')
                    .replace(/[\u200b\u200c\u200d]/g, '')
                    .replace(/\r/g, '')
                    .trim();
            },
            getToolbar(block) {
                const banner = block.querySelector('.md-code-block-banner');
                if (!banner) return null;
                const buttons = Array.from(banner.querySelectorAll('[role="button"]'));
                if (buttons.length === 0) return banner;
                let el = buttons[0].parentElement;
                while (el && el !== banner) {
                    if (buttons.every(b => el.contains(b))) return el;
                    el = el.parentElement;
                }
                return banner;
            },
            getInsertTarget(block) {
                return block;
            },
        },
    ];

    function pickAdapter() {
        return ADAPTERS.find(a => a.matches()) || null;
    }

    // ============================================================
    // Renderer 层
    // ============================================================
    const RENDERERS = {
        d2: {
            displayName: 'D2',
            color: '#e87e04',
            urls: [
                'https://cdn.jsdelivr.net/npm/@d2lang/d2@0.1.34/+esm',
                'https://esm.sh/@d2lang/d2@0.1.34',
            ],
            cacheKey: 'd2_esm_src_v0.1.34',
            cacheTsKey: 'd2_esm_ts_v0.1.34',
            getInstance(mod) {
                const D2 = mod.D2 || mod.default || mod;
                if (typeof D2 !== 'function') throw new Error('D2 导出不是构造函数');
                return new D2();
            },
            async render(engine, source) {
                const r = await engine.compile(source);
                return await engine.render(r.diagram, r.renderOptions);
            },
        },
        wireloom: {
            displayName: 'Wireloom',
            color: '#4a6cf7',
            urls: [
                'https://cdn.jsdelivr.net/npm/wireloom@0.7.0/+esm',
                'https://esm.sh/wireloom@0.7.0',
            ],
            cacheKey: 'wireloom_esm_src_v0.7.0',
            cacheTsKey: 'wireloom_esm_ts_v0.7.0',
            getInstance(mod) {
                const wl = mod.default || mod;
                if (!wl || typeof wl.render !== 'function') throw new Error('Wireloom 导出无效');
                if (!wl._initialized) {
                    try { wl.initialize && wl.initialize({ theme: 'default' }); } catch (e) {}
                    wl._initialized = true;
                }
                return wl;
            },
            async render(engine, source) {
                const id = 'ds-wl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
                const result = await engine.render(id, source);
                return result && result.svg;
            },
        },
    };

    // ============================================================
    // 引擎加载
    // ============================================================
    const engineCache = {};
    const modulePromises = {};

    function fetchText(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url,
                onload: r => {
                    if (r.status >= 200 && r.status < 300) resolve(r.responseText);
                    else reject(new Error('HTTP ' + r.status));
                },
                onerror: () => reject(new Error('network error')),
                ontimeout: () => reject(new Error('timeout')),
            });
        });
    }

    async function importFromSource(code) {
        const blob = new Blob([code], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        try { return await import(url); }
        finally { URL.revokeObjectURL(url); }
    }

    function readCache(cacheKey, cacheTsKey) {
        try {
            const code = GM_getValue(cacheKey, '');
            const ts = GM_getValue(cacheTsKey, 0);
            if (typeof code === 'string' && code.length > 0) {
                return { code, ts, fresh: Date.now() - ts < CACHE_MAX_AGE };
            }
        } catch (e) { error('读取缓存失败:', e.message); }
        return null;
    }

    function writeCache(cacheKey, cacheTsKey, code) {
        try {
            GM_setValue(cacheKey, code);
            GM_setValue(cacheTsKey, Date.now());
        } catch (e) { error('缓存写入失败:', e.message); }
    }

    async function fetchFromCDN(renderer) {
        let lastErr = null;
        for (const url of renderer.urls) {
            try {
                const code = await fetchText(url);
                writeCache(renderer.cacheKey, renderer.cacheTsKey, code);
                return await importFromSource(code);
            } catch (e) { lastErr = e; }
        }
        throw lastErr || new Error('所有 CDN 都失败: ' + renderer.displayName);
    }

    function refreshCacheInBackground(renderer) {
        (async () => {
            for (const url of renderer.urls) {
                try {
                    const code = await fetchText(url);
                    writeCache(renderer.cacheKey, renderer.cacheTsKey, code);
                    return;
                } catch (e) {}
            }
        })();
    }

    async function loadModule(renderer) {
        if (modulePromises[renderer.displayName]) return modulePromises[renderer.displayName];
        modulePromises[renderer.displayName] = (async () => {
            const cached = readCache(renderer.cacheKey, renderer.cacheTsKey);
            if (cached) {
                try {
                    const mod = await importFromSource(cached.code);
                    if (!cached.fresh) refreshCacheInBackground(renderer);
                    return mod;
                } catch (e) { error('缓存导入失败，回退网络:', e.message); }
            }
            return await fetchFromCDN(renderer);
        })();
        return modulePromises[renderer.displayName];
    }

    async function getEngine(name) {
        if (engineCache[name]) return engineCache[name];
        const renderer = RENDERERS[name];
        const mod = await loadModule(renderer);
        engineCache[name] = renderer.getInstance(mod);
        return engineCache[name];
    }

    function scheduleIdlePreload() {
        const start = () => {
            for (const name of Object.keys(RENDERERS)) {
                getEngine(name).catch(() => {});
            }
        };
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(start, { timeout: 5000 });
        } else {
            setTimeout(start, 3000);
        }
    }

    // ============================================================
    // 缓存淘汰：最多保留 MAX_CACHE 张已渲染图
    // ============================================================
    const renderHistory = [];

    function enforceCacheLimit() {
        for (let i = renderHistory.length - 1; i >= 0; i--) {
            if (!renderHistory[i].block.isConnected) {
                renderHistory.splice(i, 1);
            }
        }

        while (renderHistory.length > MAX_CACHE) {
            let removeIdx = -1;
            for (let i = 0; i < renderHistory.length; i++) {
                if (!isInViewport(renderHistory[i].block, 0)) {
                    removeIdx = i;
                    break;
                }
            }
            if (removeIdx === -1) break;

            const item = renderHistory[removeIdx];
            renderHistory.splice(removeIdx, 1);

            const block = item.block;
            block.querySelectorAll(':scope > .ds-graph-wrap').forEach(el => el.remove());
            block.querySelectorAll('.ds-graph-toggle-btn').forEach(el => el.remove());
            // 保留 dsHash：wrap 被移除但内容未变，scan 会重新注入
        }
    }

    function touchRenderHistory(block) {
        const idx = renderHistory.findIndex(x => x.block === block);
        if (idx >= 0) renderHistory.splice(idx, 1);
        renderHistory.push({ block, ts: Date.now() });
    }

    // ============================================================
    // UI: Lightbox
    // ============================================================
    function openLightbox(graphList, currentIndex, accentColor) {
        if (graphList instanceof Element) {
            graphList = [{ svgEl: graphList, displayName: '' }];
            currentIndex = 0;
        }
        if (!Array.isArray(graphList) || graphList.length === 0) return;

        let idx = currentIndex || 0;
        if (idx < 0 || idx >= graphList.length) idx = 0;

        const accent = accentColor || '#4a6cf7';

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(15,18,30,0.9);backdrop-filter:blur(3px);display:flex;flex-direction:column;';

        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 16px;background:rgba(255,255,255,0.97);border-bottom:1px solid #e1e4e8;flex-shrink:0;font-size:13px;color:#333;';

        const mkBtn = (text, title) => {
            const b = document.createElement('button');
            b.textContent = text;
            if (title) b.title = title;
            b.style.cssText = 'padding:6px 12px;font-size:13px;cursor:pointer;background:#fff;color:#333;border:1px solid #d0d5dd;border-radius:6px;font-weight:500;user-select:none;transition:background .12s;';
            b.addEventListener('mouseenter', () => { b.style.background = '#f5f7fa'; });
            b.addEventListener('mouseleave', () => { b.style.background = '#fff'; });
            return b;
        };

        const btnPrev = mkBtn('‹ 上一张', '上一张 (←)');
        const btnNext = mkBtn('下一张 ›', '下一张 (→)');
        const indexLabel = document.createElement('span');
        indexLabel.style.cssText = 'min-width:60px;text-align:center;color:#555;font-weight:600;font-variant-numeric:tabular-nums;';

        const btnZoomOut = mkBtn('−', '缩小 (-)');
        const scaleLabel = document.createElement('span');
        scaleLabel.style.cssText = 'min-width:56px;text-align:center;font-variant-numeric:tabular-nums;color:#555;font-weight:500;';
        const btnZoomIn = mkBtn('+', '放大 (+)');
        const btnFit = mkBtn('适应', '适应屏幕 (F)');
        const btn1x = mkBtn('100%', '原始大小');
        const btnReset = mkBtn('重置', '重置视图 (0)');
        const btnCopy = mkBtn('⎘ 复制图片', '复制为 PNG（2x）');
        const btnToggleMap = mkBtn('鸟瞰图', '显示/隐藏鸟瞰图');
        btnToggleMap.style.marginLeft = 'auto';
        const closeBtn = mkBtn('✕ 关闭', '关闭 (ESC)');

        const sep1 = document.createElement('span');
        sep1.style.cssText = 'width:1px;height:20px;background:#e1e4e8;margin:0 4px;';
        const sep2 = document.createElement('span');
        sep2.style.cssText = 'width:1px;height:20px;background:#e1e4e8;margin:0 4px;';

        toolbar.append(btnPrev, indexLabel, btnNext, sep1);
        toolbar.append(btnZoomOut, scaleLabel, btnZoomIn, btnFit, btn1x, btnReset, sep2);
        toolbar.append(btnCopy, btnToggleMap, closeBtn);
        overlay.appendChild(toolbar);

        if (graphList.length < 2) {
            btnPrev.style.display = 'none';
            btnNext.style.display = 'none';
            indexLabel.style.display = 'none';
            sep1.style.display = 'none';
        }

        const stage = document.createElement('div');
        stage.style.cssText = 'flex:1;position:relative;overflow:hidden;cursor:grab;user-select:none;';
        overlay.appendChild(stage);

        const svgWrap = document.createElement('div');
        svgWrap.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,0.25);';
        stage.appendChild(svgWrap);

        const mmW = 180, mmH = 130;
        const minimap = document.createElement('div');
        minimap.style.cssText = `position:absolute;right:16px;bottom:16px;width:${mmW}px;height:${mmH}px;background:rgba(255,255,255,0.98);border:1px solid #d0d5dd;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.18);overflow:hidden;z-index:10;cursor:pointer;`;
        const mmSvgWrap = document.createElement('div');
        mmSvgWrap.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;';
        minimap.appendChild(mmSvgWrap);
        const mmViewport = document.createElement('div');
        mmViewport.style.cssText = `position:absolute;border:1.5px solid ${accent};background:${accent}22;pointer-events:none;border-radius:2px;box-sizing:border-box;`;
        minimap.appendChild(mmViewport);
        overlay.appendChild(minimap);

        let scale = 1, offsetX = 0, offsetY = 0;
        let w = 800, h = 600;
        const MIN_S = 0.08, MAX_S = 20;
        let mmScale = 1, mmOffX = 0, mmOffY = 0;
        let currentSvgEl = null;

        function loadCurrent() {
            const item = graphList[idx];
            if (!item) return;
            const svgEl = item.svgEl;
            currentSvgEl = svgEl;
            const size = getSvgNaturalSize(svgEl);
            w = size.w; h = size.h;

            svgWrap.innerHTML = '';
            const clone = svgEl.cloneNode(true);
            clone.removeAttribute('width');
            clone.removeAttribute('height');
            clone.style.cssText = `width:${w}px;height:${h}px;display:block;`;
            svgWrap.appendChild(clone);

            mmSvgWrap.innerHTML = '';
            const mmClone = svgEl.cloneNode(true);
            mmClone.removeAttribute('width');
            mmClone.removeAttribute('height');
            mmClone.style.cssText = `width:${w}px;height:${h}px;display:block;`;
            mmSvgWrap.appendChild(mmClone);

            if (graphList.length >= 2) {
                const name = item.displayName ? ` · ${item.displayName}` : '';
                indexLabel.textContent = `${idx + 1} / ${graphList.length}${name}`;
            }
            fitMinimap();
            resetView();
        }

        function goPrev() {
            if (graphList.length < 2) return;
            idx = (idx - 1 + graphList.length) % graphList.length;
            loadCurrent();
        }
        function goNext() {
            if (graphList.length < 2) return;
            idx = (idx + 1) % graphList.length;
            loadCurrent();
        }

        function fitMinimap() {
            const pad = 6;
            const sx = (mmW - pad * 2) / w;
            const sy = (mmH - pad * 2) / h;
            mmScale = Math.min(sx, sy);
            mmOffX = (mmW - w * mmScale) / 2;
            mmOffY = (mmH - h * mmScale) / 2;
            mmSvgWrap.style.transform = `translate(${mmOffX}px,${mmOffY}px) scale(${mmScale})`;
        }

        function updateMinimapViewport() {
            const sw = stage.clientWidth, sh = stage.clientHeight;
            const x0 = (-offsetX) / scale, y0 = (-offsetY) / scale;
            const x1 = (sw - offsetX) / scale, y1 = (sh - offsetY) / scale;
            const mx0 = mmOffX + x0 * mmScale, my0 = mmOffY + y0 * mmScale;
            const mx1 = mmOffX + x1 * mmScale, my1 = mmOffY + y1 * mmScale;
            const cx0 = Math.max(0, mx0), cy0 = Math.max(0, my0);
            const cx1 = Math.min(mmW, mx1), cy1 = Math.min(mmH, my1);
            if (cx1 <= cx0 || cy1 <= cy0) { mmViewport.style.display = 'none'; }
            else {
                mmViewport.style.display = 'block';
                mmViewport.style.left = cx0 + 'px';
                mmViewport.style.top = cy0 + 'px';
                mmViewport.style.width = (cx1 - cx0) + 'px';
                mmViewport.style.height = (cy1 - cy0) + 'px';
            }
        }

        function applyTransform() {
            svgWrap.style.transform = `translate(${offsetX}px,${offsetY}px) scale(${scale})`;
            scaleLabel.textContent = Math.round(scale * 100) + '%';
            updateMinimapViewport();
        }

        function setScale(newScale, cx, cy) {
            newScale = Math.min(MAX_S, Math.max(MIN_S, newScale));
            offsetX = cx - (newScale / scale) * (cx - offsetX);
            offsetY = cy - (newScale / scale) * (cy - offsetY);
            scale = newScale;
            applyTransform();
        }

        function fitToScreen() {
            const sw = stage.clientWidth - 40, sh = stage.clientHeight - 40;
            scale = Math.min(sw / w, sh / h, MAX_S);
            offsetX = (stage.clientWidth - w * scale) / 2;
            offsetY = (stage.clientHeight - h * scale) / 2;
            applyTransform();
        }

        function resetView() {
            const availW = stage.clientWidth - 40, availH = stage.clientHeight - 40;
            let s = 2;
            if (w * s > availW || h * s > availH) {
                s = Math.max(1, Math.min(Math.floor(availW / w) || 1, Math.floor(availH / h) || 1));
            }
            scale = s;
            offsetX = (stage.clientWidth - w * scale) / 2;
            offsetY = (stage.clientHeight - h * scale) / 2;
            applyTransform();
        }

        let dragMode = null, dragStartX = 0, dragStartY = 0, dragStartOffX = 0, dragStartOffY = 0;
        function onMouseMove(e) {
            if (dragMode === 'pan') {
                offsetX = dragStartOffX + (e.clientX - dragStartX);
                offsetY = dragStartOffY + (e.clientY - dragStartY);
                applyTransform();
            } else if (dragMode === 'minimap') {
                jumpToMinimapPoint(e.clientX, e.clientY);
            }
        }
        function onMouseUp() { if (dragMode) { dragMode = null; stage.style.cursor = 'grab'; } }
        stage.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            dragMode = 'pan';
            dragStartX = e.clientX; dragStartY = e.clientY;
            dragStartOffX = offsetX; dragStartOffY = offsetY;
            stage.style.cursor = 'grabbing';
            e.preventDefault();
        });

        function jumpToMinimapPoint(clientX, clientY) {
            const rect = minimap.getBoundingClientRect();
            const mx = clientX - rect.left, my = clientY - rect.top;
            const svgX = (mx - mmOffX) / mmScale, svgY = (my - mmOffY) / mmScale;
            offsetX = stage.clientWidth / 2 - svgX * scale;
            offsetY = stage.clientHeight / 2 - svgY * scale;
            applyTransform();
        }
        minimap.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            dragMode = 'minimap';
            jumpToMinimapPoint(e.clientX, e.clientY);
            e.preventDefault(); e.stopPropagation();
        });

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        stage.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = stage.getBoundingClientRect();
            const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
            const factor = Math.exp(-e.deltaY * 0.0018);
            setScale(scale * factor, cx, cy);
        }, { passive: false });

        function onKey(e) {
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            const cx = stage.clientWidth / 2, cy = stage.clientHeight / 2;
            switch (e.key) {
                case 'Escape': e.preventDefault(); close(); break;
                case 'ArrowLeft':
                    if (graphList.length >= 2) { e.preventDefault(); goPrev(); }
                    else { e.preventDefault(); offsetX += 40; applyTransform(); }
                    break;
                case 'ArrowRight':
                    if (graphList.length >= 2) { e.preventDefault(); goNext(); }
                    else { e.preventDefault(); offsetX -= 40; applyTransform(); }
                    break;
                case 'ArrowUp': e.preventDefault(); offsetY += 40; applyTransform(); break;
                case 'ArrowDown': e.preventDefault(); offsetY -= 40; applyTransform(); break;
                case '+': case '=': e.preventDefault(); setScale(scale * 1.25, cx, cy); break;
                case '-': case '_': e.preventDefault(); setScale(scale / 1.25, cx, cy); break;
                case '0': e.preventDefault(); resetView(); break;
                case 'f': case 'F': e.preventDefault(); fitToScreen(); break;
            }
        }
        document.addEventListener('keydown', onKey);

        btnPrev.addEventListener('click', goPrev);
        btnNext.addEventListener('click', goNext);
        btnZoomIn.addEventListener('click', () => setScale(scale * 1.25, stage.clientWidth / 2, stage.clientHeight / 2));
        btnZoomOut.addEventListener('click', () => setScale(scale / 1.25, stage.clientWidth / 2, stage.clientHeight / 2));
        btnFit.addEventListener('click', fitToScreen);
        btn1x.addEventListener('click', () => setScale(1, stage.clientWidth / 2, stage.clientHeight / 2));
        btnReset.addEventListener('click', resetView);

        btnCopy.addEventListener('click', async () => {
            if (!currentSvgEl) return;
            const original = btnCopy.textContent;
            btnCopy.textContent = '⏳ 复制中…';
            btnCopy.style.pointerEvents = 'none';
            try {
                await copySvgAsPng(currentSvgEl, 2);
                btnCopy.textContent = '✓ 已复制';
                btnCopy.style.color = '#1a9e5a';
                setTimeout(() => { btnCopy.textContent = original; btnCopy.style.color = '#333'; }, 1400);
            } catch (e) {
                error('复制失败:', e);
                btnCopy.textContent = '✗ 失败';
                btnCopy.style.color = '#c00';
                setTimeout(() => { btnCopy.textContent = original; btnCopy.style.color = '#333'; }, 1400);
            } finally {
                btnCopy.style.pointerEvents = 'auto';
            }
        });

        let mapVisible = true;
        btnToggleMap.addEventListener('click', () => {
            mapVisible = !mapVisible;
            minimap.style.display = mapVisible ? 'block' : 'none';
            btnToggleMap.style.background = mapVisible ? '#fff' : '#fff7ed';
            btnToggleMap.style.color = mapVisible ? '#333' : accent;
            btnToggleMap.style.borderColor = mapVisible ? '#d0d5dd' : accent;
        });

        function close() {
            overlay.remove();
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
        closeBtn.addEventListener('click', close);

        document.body.appendChild(overlay);
        loadCurrent();
    }

    // ============================================================
    // Core: 收集已渲染图
    // ============================================================
    function collectRenderedGraphs() {
        if (!adapter) return [];
        const blocks = adapter.findCodeBlocks(document.body);
        const list = [];
        const seenBlocks = new WeakSet();
        for (const block of blocks) {
            if (seenBlocks.has(block)) continue;
            seenBlocks.add(block);
            const wrap = block.querySelector(':scope > .ds-graph-wrap');
            if (!wrap) continue;
            const svg = wrap.querySelector('.ds-graph-svg-area > svg');
            if (!svg) continue;
            const type = wrap.dataset.graphName || 'unknown';
            const displayName = wrap.dataset.graphDisplay || type;
            list.push({ block, wrap, svg, name: displayName, type });
        }
        return list;
    }

    function groupByType(graphs) {
        const groups = {};
        for (const g of graphs) {
            if (!groups[g.type]) groups[g.type] = [];
            groups[g.type].push(g);
        }
        return groups;
    }

    // ============================================================
    // UI: 分组对比视图
    // ============================================================
    function openCompareView(graphs) {
        if (!graphs || graphs.length < 1) return;

        const groups = groupByType(graphs);
        const typeKeys = Object.keys(groups);
        const totalCount = graphs.length;

        if (totalCount === 1) {
            openLightbox(
                graphs.map(g => ({ svgEl: g.svg, displayName: g.name })),
                0,
                RENDERERS[graphs[0].type]?.color || '#4a6cf7'
            );
            return;
        }

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(15,18,30,0.94);display:flex;flex-direction:column;';

        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 18px;background:rgba(255,255,255,0.97);border-bottom:1px solid #e1e4e8;flex-shrink:0;font-size:13px;color:#333;flex-wrap:wrap;';

        const tabsWrap = document.createElement('div');
        tabsWrap.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
        toolbar.appendChild(tabsWrap);

        const mkTab = (text, active) => {
            const t = document.createElement('button');
            t.textContent = text;
            t.style.cssText = `padding:6px 14px;font-size:13px;cursor:pointer;border-radius:6px;font-weight:500;user-select:none;transition:all .12s;border:1px solid ${active ? '#4a6cf7' : '#d0d5dd'};background:${active ? '#eef2ff' : '#fff'};color:${active ? '#4a6cf7' : '#333'};`;
            return t;
        };

        const tabs = [];
        const allTab = mkTab(`全部 (${totalCount})`, true);
        tabs.push({ key: '__all__', el: allTab });
        tabsWrap.appendChild(allTab);
        for (const type of typeKeys) {
            const r = RENDERERS[type];
            const label = r ? r.displayName : type;
            const count = groups[type].length;
            const tab = mkTab(`${label} (${count})`, false);
            tabs.push({ key: type, el: tab });
            tabsWrap.appendChild(tab);
        }

        const mkBtn = (text, title) => {
            const b = document.createElement('button');
            b.textContent = text;
            if (title) b.title = title;
            b.style.cssText = 'padding:6px 12px;font-size:13px;cursor:pointer;background:#fff;color:#333;border:1px solid #d0d5dd;border-radius:6px;font-weight:500;user-select:none;transition:background .12s;';
            b.addEventListener('mouseenter', () => { b.style.background = '#f5f7fa'; });
            b.addEventListener('mouseleave', () => { b.style.background = '#fff'; });
            return b;
        };

        const btnCols = mkBtn('列数：2', '切换列数');
        let cols = 2;
        const sep = document.createElement('span');
        sep.style.cssText = 'width:1px;height:20px;background:#e1e4e8;margin:0 4px;';
        const closeBtn = mkBtn('✕ 关闭', '关闭 (ESC)');
        closeBtn.style.marginLeft = 'auto';
        toolbar.append(sep, btnCols, closeBtn);
        overlay.appendChild(toolbar);

        const content = document.createElement('div');
        content.style.cssText = 'flex:1;overflow:auto;padding:16px;';
        overlay.appendChild(content);

        let activeTab = '__all__';

        function getTabGraphs(tabKey) {
            if (tabKey === '__all__') return graphs;
            return groups[tabKey] || [];
        }

        function makeGraphCard(g) {
            const accent = RENDERERS[g.type]?.color || '#4a6cf7';
            const card = document.createElement('div');
            card.style.cssText = 'background:#fff;border-radius:8px;padding:12px;display:flex;flex-direction:column;min-height:200px;box-shadow:0 2px 10px rgba(0,0,0,0.2);';

            const header = document.createElement('div');
            header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #f0f0f0;';
            const label = document.createElement('span');
            label.textContent = g.name;
            label.style.cssText = `font-size:12px;color:${accent};font-weight:600;`;
            const btnZoom = document.createElement('button');
            btnZoom.textContent = '放大';
            btnZoom.style.cssText = `padding:3px 10px;font-size:11px;cursor:pointer;background:#fff;color:${accent};border:1px solid #d0d5dd;border-radius:4px;`;

            function openHere() {
                const ctxList = getTabGraphs(activeTab);
                const currentIdx = ctxList.indexOf(g);
                openLightbox(
                    ctxList.map(x => ({ svgEl: x.svg, displayName: x.name })),
                    currentIdx >= 0 ? currentIdx : 0,
                    accent
                );
            }

            btnZoom.addEventListener('click', openHere);
            header.append(label, btnZoom);
            card.appendChild(header);

            const svgHolder = document.createElement('div');
            svgHolder.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;overflow:auto;cursor:zoom-in;';
            const svgClone = g.svg.cloneNode(true);
            svgClone.style.cssText = 'max-width:100%;height:auto;';
            svgHolder.appendChild(svgClone);
            svgHolder.addEventListener('click', openHere);
            card.appendChild(svgHolder);

            return card;
        }

        function renderContent() {
            content.innerHTML = '';
            if (activeTab === '__all__') {
                for (const type of typeKeys) {
                    const typeGraphs = groups[type];
                    const r = RENDERERS[type];
                    const displayName = r ? r.displayName : type;
                    const accent = r ? r.color : '#666';

                    const groupTitle = document.createElement('div');
                    groupTitle.style.cssText = `display:flex;align-items:center;gap:8px;margin:16px 4px 10px;font-size:14px;font-weight:600;color:#333;`;
                    const dot = document.createElement('span');
                    dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${accent};`;
                    const titleText = document.createElement('span');
                    const isCompare = typeGraphs.length >= 2;
                    titleText.textContent = `${displayName} · ${typeGraphs.length} 张${isCompare ? '（对比）' : ''}`;
                    groupTitle.append(dot, titleText);
                    if (type === typeKeys[0]) groupTitle.style.marginTop = '0';
                    content.appendChild(groupTitle);

                    const grid = document.createElement('div');
                    grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px;align-content:start;`;
                    for (const g of typeGraphs) grid.appendChild(makeGraphCard(g));
                    content.appendChild(grid);
                }
            } else {
                const list = getTabGraphs(activeTab);
                const grid = document.createElement('div');
                grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px;align-content:start;`;
                for (const g of list) grid.appendChild(makeGraphCard(g));
                content.appendChild(grid);
            }
        }

        for (const t of tabs) {
            t.el.addEventListener('click', () => {
                activeTab = t.key;
                for (const x of tabs) {
                    const isActive = x.key === activeTab;
                    x.el.style.background = isActive ? '#eef2ff' : '#fff';
                    x.el.style.color = isActive ? '#4a6cf7' : '#333';
                    x.el.style.borderColor = isActive ? '#4a6cf7' : '#d0d5dd';
                }
                renderContent();
            });
        }

        btnCols.addEventListener('click', () => {
            cols = cols === 2 ? 3 : (cols === 3 ? 1 : 2);
            btnCols.textContent = '列数：' + cols;
            renderContent();
        });

        function close() {
            overlay.remove();
            document.removeEventListener('keydown', onKey);
        }
        function onKey(e) {
            if (e.key === 'Escape') { e.preventDefault(); close(); }
        }
        document.addEventListener('keydown', onKey);
        closeBtn.addEventListener('click', close);

        document.body.appendChild(overlay);
        renderContent();
    }

    // ============================================================
    // UI: FAB 悬浮控制栈（模式切换 / 全部渲染 / 对比）
    // ============================================================
    let fabStackEl = null;
    let fabModeEl = null;
    let fabRenderAllEl = null;
    let fabCompareEl = null;
    let fabUpdateScheduled = false;

    function ensureFabStack() {
        if (fabStackEl && fabStackEl.isConnected) return fabStackEl;
        fabStackEl = document.createElement('div');
        fabStackEl.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483646;display:flex;flex-direction:column;gap:8px;align-items:flex-end;pointer-events:none;';
        document.body.appendChild(fabStackEl);
        return fabStackEl;
    }

    function cleanupFabStack() {
        if (!fabStackEl) return;
        if (fabStackEl.children.length === 0) {
            fabStackEl.remove();
            fabStackEl = null;
        }
    }

    function ensureModeFab() {
        if (fabModeEl && fabModeEl.isConnected) return fabModeEl;
        fabModeEl = document.createElement('div');
        fabModeEl.setAttribute('role', 'button');
        fabModeEl.setAttribute('tabindex', '0');
        fabModeEl.style.cssText = 'pointer-events:auto;cursor:pointer;padding:9px 14px;border-radius:20px;font-size:12px;font-weight:600;user-select:none;transition:transform .15s,background .15s,color .15s,border-color .15s;border:1px solid #4a6cf7;background:#fff;color:#4a6cf7;box-shadow:0 4px 14px rgba(74,108,247,0.22);white-space:nowrap;';
        fabModeEl.addEventListener('mouseenter', () => { fabModeEl.style.transform = 'translateY(-1px)'; });
        fabModeEl.addEventListener('mouseleave', () => { fabModeEl.style.transform = 'translateY(0)'; });
        fabModeEl.addEventListener('click', () => setAutoRender(!currentAutoRender));
        fabModeEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAutoRender(!currentAutoRender); }
        });
        fabModeEl.title = '点击切换自动 / 手动渲染模式';
        return fabModeEl;
    }

    function ensureRenderAllFab() {
        if (fabRenderAllEl && fabRenderAllEl.isConnected) return fabRenderAllEl;
        fabRenderAllEl = document.createElement('div');
        fabRenderAllEl.setAttribute('role', 'button');
        fabRenderAllEl.setAttribute('tabindex', '0');
        fabRenderAllEl.style.cssText = 'pointer-events:auto;cursor:pointer;padding:9px 14px;border-radius:20px;font-size:12px;font-weight:600;user-select:none;transition:transform .15s,background .15s;border:1px solid #4a6cf7;background:#fff;color:#4a6cf7;box-shadow:0 4px 14px rgba(74,108,247,0.18);white-space:nowrap;';
        fabRenderAllEl.addEventListener('mouseenter', () => { fabRenderAllEl.style.background = '#f0f4ff'; fabRenderAllEl.style.transform = 'translateY(-1px)'; });
        fabRenderAllEl.addEventListener('mouseleave', () => { fabRenderAllEl.style.background = '#fff'; fabRenderAllEl.style.transform = 'translateY(0)'; });
        fabRenderAllEl.addEventListener('click', () => {
            const list = Array.from(document.querySelectorAll('.ds-graph-manual-placeholder'));
            for (const ph of list) {
                if (ph.isConnected) ph.click();
            }
        });
        fabRenderAllEl.title = '渲染当前页面上所有待渲染的图';
        return fabRenderAllEl;
    }

    function ensureCompareFab() {
        if (fabCompareEl && fabCompareEl.isConnected) return fabCompareEl;
        fabCompareEl = document.createElement('div');
        fabCompareEl.setAttribute('role', 'button');
        fabCompareEl.setAttribute('tabindex', '0');
        fabCompareEl.style.cssText = 'pointer-events:auto;cursor:pointer;background:linear-gradient(135deg,#4a6cf7,#e87e04);color:#fff;padding:12px 18px;border-radius:24px;font-size:13px;font-weight:600;box-shadow:0 6px 20px rgba(74,108,247,0.35);user-select:none;transition:transform .15s,box-shadow .15s;display:flex;align-items:center;gap:8px;white-space:nowrap;';
        fabCompareEl.addEventListener('mouseenter', () => {
            fabCompareEl.style.transform = 'translateY(-2px)';
            fabCompareEl.style.boxShadow = '0 8px 26px rgba(74,108,247,0.45)';
        });
        fabCompareEl.addEventListener('mouseleave', () => {
            fabCompareEl.style.transform = 'translateY(0)';
            fabCompareEl.style.boxShadow = '0 6px 20px rgba(74,108,247,0.35)';
        });
        fabCompareEl.addEventListener('click', () => {
            const list = collectRenderedGraphs();
            if (list.length >= 2) openCompareView(list);
        });
        fabCompareEl.title = '打开对比视图';
        return fabCompareEl;
    }

    function setAutoRender(value) {
        if (currentAutoRender === value) return;
        currentAutoRender = !!value;
        try { GM_setValue('ds_graph_auto_render', currentAutoRender); } catch (e) {}

        if (currentAutoRender) {
            // 手动 → 自动：立即触发所有占位符渲染
            const placeholders = document.querySelectorAll('.ds-graph-manual-placeholder');
            for (const ph of placeholders) {
                if (ph.isConnected) ph.click();
            }
        }
        // 自动 → 手动：已渲染的图保留，新的块由 injectPreviewCard 走占位符逻辑
        updateFAB();
    }

    function updateFAB() {
        if (fabUpdateScheduled) return;
        fabUpdateScheduled = true;
        requestAnimationFrame(() => {
            fabUpdateScheduled = false;
            doUpdateFAB();
        });
    }

    function doUpdateFAB() {
        if (!document.body) return;
        ensureFabStack();

        const graphs = collectRenderedGraphs();
        const placeholders = document.querySelectorAll('.ds-graph-manual-placeholder');

        // 页面上是否存在 d2 / wireloom 代码块
        let hasGraphBlocks = false;
        if (adapter) {
            const blocks = adapter.findCodeBlocks(document.body);
            for (const b of blocks) {
                const lang = adapter.getLanguage(b);
                if (RENDERERS[lang]) { hasGraphBlocks = true; break; }
            }
        }
        const hasAnything = hasGraphBlocks || graphs.length > 0 || placeholders.length > 0;

        // ---- 模式切换按钮 ----
        if (hasAnything) {
            ensureModeFab();
            const modeText = currentAutoRender ? '⚡ 自动渲染' : '✋ 手动渲染';
            if (fabModeEl.textContent !== modeText) fabModeEl.textContent = modeText;
            if (currentAutoRender) {
                fabModeEl.style.background = '#10b981';
                fabModeEl.style.color = '#fff';
                fabModeEl.style.borderColor = '#10b981';
            } else {
                fabModeEl.style.background = '#fff';
                fabModeEl.style.color = '#4a6cf7';
                fabModeEl.style.borderColor = '#4a6cf7';
            }
        } else if (fabModeEl) {
            fabModeEl.remove();
            fabModeEl = null;
        }

        // ---- 全部渲染按钮 ----
        if (!currentAutoRender && placeholders.length >= 2) {
            ensureRenderAllFab();
            const t = `▶ 全部渲染 (${placeholders.length})`;
            if (fabRenderAllEl.textContent !== t) fabRenderAllEl.textContent = t;
        } else if (fabRenderAllEl) {
            fabRenderAllEl.remove();
            fabRenderAllEl = null;
        }

        // ---- 对比按钮 ----
        if (graphs.length >= 2) {
            ensureCompareFab();
            const groups = groupByType(graphs);
            const typeKeys = Object.keys(groups);
            let text;
            if (typeKeys.length === 1) {
                const type = typeKeys[0];
                const name = RENDERERS[type]?.displayName || type;
                text = `⊞ 对比 ${graphs.length} 张 ${name} 图`;
            } else {
                const summary = typeKeys
                    .map(t => {
                        const name = RENDERERS[t]?.displayName || t;
                        return `${name}×${groups[t].length}`;
                    })
                    .join(' · ');
                text = `⊞ 查看 ${graphs.length} 张图（${summary}）`;
            }
            if (fabCompareEl.textContent !== text) fabCompareEl.textContent = text;
        } else if (fabCompareEl) {
            fabCompareEl.remove();
            fabCompareEl = null;
        }

        // ---- 排布：模式(最上) → 全部渲染 → 对比(最下) ----
        if (fabModeEl) fabModeEl.style.order = '1';
        if (fabRenderAllEl) fabRenderAllEl.style.order = '2';
        if (fabCompareEl) fabCompareEl.style.order = '3';

        const stack = ensureFabStack();
        [fabModeEl, fabRenderAllEl, fabCompareEl].forEach(el => {
            if (el && el.parentNode !== stack) stack.appendChild(el);
        });

        cleanupFabStack();
    }

    // ============================================================
    // Core: 预览卡片注入（含手动模式）
    // ============================================================
    function injectPreviewCard(block, name, source, adapter) {
        const renderer = RENDERERS[name];
        const accent = renderer.color;
        const hash = name + '|' + simpleHash(source);

        const wrapExists = !!block.querySelector(':scope > .ds-graph-wrap');
        if (block.dataset.dsHash === hash && wrapExists) return;

        block.querySelectorAll(':scope > .ds-graph-wrap').forEach(el => el.remove());
        block.querySelectorAll('.ds-graph-toggle-btn').forEach(el => el.remove());
        block.dataset.dsHash = hash;

        const toolbar = adapter.getToolbar(block);
        if (!toolbar) {
            error('未找到工具栏，无法注入预览按钮');
            return;
        }

        const insertTarget = adapter.getInsertTarget(block);

        const toggleBtn = document.createElement('div');
        toggleBtn.className = 'ds-graph-toggle-btn ds-button ds-button--borderlessNeutral ds-button--borderless ds-button--capsule ds-button--xs ds-button--icon-relative-m ds-button--min-width';
        toggleBtn.setAttribute('role', 'button');
        toggleBtn.setAttribute('tabindex', '0');
        toggleBtn.style.cssText = 'cursor:pointer; margin-left:2px;';
        toggleBtn.innerHTML = `
            <div class="ds-button__background"></div>
            <span class="ds-button__content">
                <span class="code-info-button-text" style="color:${accent};">隐藏图</span>
            </span>
        `;

        const previewWrap = document.createElement('div');
        previewWrap.className = 'ds-graph-wrap';
        previewWrap.dataset.graphName = name;
        previewWrap.dataset.graphDisplay = renderer.displayName;
        previewWrap.style.cssText = 'display:block; margin-top:8px;';

        const previewInner = document.createElement('div');
        previewInner.style.cssText = 'position:relative; padding:12px; background:#fafbfc; border:1px solid #e1e4e8; border-radius:8px; overflow-x:auto;';

        const svgArea = document.createElement('div');
        svgArea.className = 'ds-graph-svg-area';
        svgArea.style.cssText = 'max-width:100%; min-height:80px; display:flex; align-items:center; justify-content:center; cursor:zoom-in;';

        const actionBar = document.createElement('div');
        actionBar.className = 'ds-graph-action-bar';
        actionBar.style.cssText = 'position:absolute; top:8px; right:8px; display:none; gap:6px; z-index:2;';

        const mkAction = (text) => {
            const b = document.createElement('div');
            b.setAttribute('role', 'button');
            b.setAttribute('tabindex', '0');
            b.textContent = text;
            b.style.cssText = `cursor:pointer; font-size:11px; padding:3px 9px; background:#fff; border:1px solid #d0d5dd; border-radius:4px; color:${accent}; opacity:0.75; user-select:none; transition:opacity .15s;`;
            b.addEventListener('mouseenter', () => { b.style.opacity = '1'; });
            b.addEventListener('mouseleave', () => { b.style.opacity = '0.75'; });
            return b;
        };

        const copyBtn = mkAction('⎘ 复制');
        const zoomBtn = mkAction('⤢ 放大');
        actionBar.append(copyBtn, zoomBtn);

        const errorArea = document.createElement('div');
        errorArea.className = 'ds-graph-error-area';
        errorArea.style.cssText = 'display:none; color:#c00; font-size:12px; padding:8px; background:#fff0f0; border-radius:4px; margin-top:8px;';

        previewInner.append(svgArea, actionBar, errorArea);
        previewWrap.appendChild(previewInner);

        let rendered = false;
        let rendering = false;
        let visible = true;

        // ---------- 手动模式占位符 ----------
        function showManualPlaceholder(errMsg) {
            svgArea.innerHTML = '';
            const ph = document.createElement('div');
            ph.className = 'ds-graph-manual-placeholder';
            ph.setAttribute('role', 'button');
            ph.setAttribute('tabindex', '0');
            ph.style.cssText = `display:inline-flex;flex-direction:column;align-items:center;gap:6px;
                padding:14px 28px;background:#fff;border:1px dashed ${errMsg ? '#e53e3e' : accent};
                border-radius:6px;cursor:pointer;user-select:none;transition:all .15s;outline:none;`;

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;';

            const icon = document.createElement('span');
            icon.textContent = errMsg ? '⚠' : '▶';
            icon.style.cssText = `color:${errMsg ? '#e53e3e' : accent};font-size:13px;`;

            const text = document.createElement('span');
            text.textContent = errMsg ? '渲染失败，点击重试' : `点击渲染 ${renderer.displayName} 图`;
            text.style.cssText = `color:${errMsg ? '#e53e3e' : accent};font-size:13px;font-weight:500;`;

            row.append(icon, text);
            ph.appendChild(row);

            if (errMsg) {
                const msg = document.createElement('div');
                msg.textContent = errMsg;
                msg.style.cssText = 'color:#888;font-size:11px;max-width:480px;text-align:center;line-height:1.4;';
                ph.appendChild(msg);
            }

            ph.addEventListener('mouseenter', () => { ph.style.background = '#f5f7fa'; ph.style.borderStyle = 'solid'; });
            ph.addEventListener('mouseleave', () => { ph.style.background = '#fff'; ph.style.borderStyle = 'dashed'; });

            function trigger() {
                if (rendering || rendered) return;
                rendering = true;
                ph.style.pointerEvents = 'none';
                icon.textContent = '⏳';
                text.textContent = '正在渲染…';
                doRender();
            }

            ph.addEventListener('click', (e) => { e.stopPropagation(); trigger(); });
            ph.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); trigger(); }
            });

            svgArea.appendChild(ph);
            updateFAB();
        }

        function openGraphLightbox() {
            const svgEl = svgArea.querySelector('svg');
            if (!svgEl) return;
            const graphs = collectRenderedGraphs();
            const currentIdx = graphs.findIndex(g => g.svg === svgEl);
            openLightbox(
                graphs.map(g => ({ svgEl: g.svg, displayName: g.name })),
                currentIdx >= 0 ? currentIdx : 0,
                accent
            );
        }

        copyBtn.addEventListener('click', async (ev) => {
            ev.stopPropagation(); ev.preventDefault();
            const svgEl = svgArea.querySelector('svg');
            if (!svgEl) return;
            const original = copyBtn.textContent;
            copyBtn.textContent = '⏳ 复制中…';
            copyBtn.style.pointerEvents = 'none';
            try {
                await copySvgAsPng(svgEl, 2);
                copyBtn.textContent = '✓ 已复制';
                copyBtn.style.color = '#1a9e5a';
                setTimeout(() => { copyBtn.textContent = original; copyBtn.style.color = accent; }, 1400);
            } catch (e) {
                error('复制失败:', e);
                copyBtn.textContent = '✗ 失败';
                copyBtn.style.color = '#c00';
                setTimeout(() => { copyBtn.textContent = original; copyBtn.style.color = accent; }, 1400);
            } finally {
                copyBtn.style.pointerEvents = 'auto';
            }
        });

        zoomBtn.addEventListener('click', (ev) => {
            ev.stopPropagation(); ev.preventDefault();
            openGraphLightbox();
        });

        svgArea.addEventListener('click', (ev) => {
            if (ev.target.closest('.ds-graph-action-bar')) return;
            if (ev.target.closest('.ds-graph-error-area')) return;
            if (ev.target.closest('.ds-graph-manual-placeholder')) return;
            openGraphLightbox();
        });

        toggleBtn.addEventListener('click', (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            visible = !visible;
            previewWrap.style.display = visible ? 'block' : 'none';
            const span = toggleBtn.querySelector('.code-info-button-text');
            if (span) span.textContent = visible ? '隐藏图' : '显示图';
        });

        async function doRender() {
            if (rendered) return;
            try {
                const engine = await getEngine(name);
                const svgString = await renderer.render(engine, source);
                if (!svgString) throw new Error('渲染结果为空');
                svgArea.innerHTML = prepareSvg(svgString);
                svgArea.style.cursor = 'zoom-in';
                rendered = true;
                errorArea.style.display = 'none';
                actionBar.style.display = 'flex';
                touchRenderHistory(block);
                enforceCacheLimit();
                updateFAB();
            } catch (e) {
                error('渲染失败 [' + name + ']:', e);
                if (currentAutoRender) {
                    svgArea.innerHTML = '';
                    errorArea.innerHTML = `
                        <div style="font-weight:bold; margin-bottom:4px;">⚠️ 渲染失败</div>
                        <div style="margin-bottom:6px;">${e.message}</div>
                        <div style="color:#888; font-size:11px;">${renderer.displayName} 语法不正确，请让 AI 重新生成。</div>
                    `;
                    errorArea.style.display = 'block';
                } else {
                    errorArea.style.display = 'none';
                    showManualPlaceholder(e.message);
                }
            } finally {
                rendering = false;
            }
        }

        toolbar.appendChild(toggleBtn);
        insertTarget.appendChild(previewWrap);

        if (currentAutoRender) {
            setTimeout(doRender, 50);
        } else {
            showManualPlaceholder();
        }
        updateFAB();
    }

    // ============================================================
    // Core: 扫描与调度
    // ============================================================
    const timers = new WeakMap();
    const adapter = pickAdapter();

    if (!adapter) {
        error('当前页面没有匹配的适配器');
        return;
    }

    function scheduleProcess(block) {
        if (block.querySelector(':scope > .ds-graph-wrap') && block.dataset.dsHash) {
            const lang = adapter.getLanguage(block);
            if (!RENDERERS[lang]) return;
            const source = adapter.getSource(block);
            if (!source) return;
            const newHash = lang + '|' + simpleHash(source);
            if (block.dataset.dsHash === newHash) return;
        }

        if (timers.has(block)) clearTimeout(timers.get(block));
        const t = setTimeout(() => {
            timers.delete(block);
            if (!block.isConnected) return;
            if (!isInViewport(block)) return;
            const lang = adapter.getLanguage(block);
            if (!RENDERERS[lang]) return;
            const source = adapter.getSource(block);
            if (!source) return;
            injectPreviewCard(block, lang, source, adapter);
        }, INJECT_DELAY);
        timers.set(block, t);
    }

    function scan() {
        const blocks = adapter.findCodeBlocks(document.body);
        let hasRelevant = false;
        for (const block of blocks) {
            if (!isInViewport(block)) continue;
            const lang = adapter.getLanguage(block);
            if (!RENDERERS[lang]) continue;
            scheduleProcess(block);
            hasRelevant = true;
        }
        if (!hasRelevant) updateFAB();
    }

    let scrollScheduled = false;
    function onScrollOrResize() {
        if (scrollScheduled) return;
        scrollScheduled = true;
        requestAnimationFrame(() => { scrollScheduled = false; scan(); });
    }
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    let scanScheduled = false;
    function scheduleScan() {
        if (scanScheduled) return;
        scanScheduled = true;
        requestAnimationFrame(() => { scanScheduled = false; scan(); });
    }

    function getBlockAncestor(target) {
        const el = target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
        if (!el || !el.closest) return null;
        return el.closest('.md-code-block');
    }

    function setupObserver() {
        const observer = new MutationObserver(mutations => {
            let needScan = false;
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) { needScan = true; break; }
                }
                if (mutation.type === 'characterData' || mutation.type === 'childList') {
                    const block = getBlockAncestor(mutation.target);
                    if (block && isInViewport(block)) {
                        const lang = adapter.getLanguage(block);
                        if (RENDERERS[lang]) scheduleProcess(block);
                    }
                }
                if (needScan) break;
            }
            if (needScan) scheduleScan();
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        scan();
    }

    if (document.body) setupObserver();
    else document.addEventListener('DOMContentLoaded', setupObserver);

    scheduleIdlePreload();

})();
