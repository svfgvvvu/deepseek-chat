// ==UserScript==
// @name         DeepSeek D2 预览按钮
// @namespace    https://github.com/svfgvvvu/deepseek-chat
// @version      2.1.1
// @description  为 DeepSeek Chat 中的 d2 代码块添加预览、复制图片、放大查看
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

    const TAG = '[DeepSeek D2]';
    function error(...a) { console.error(TAG, ...a); }

    // ============================================================
    // 配置
    // ============================================================
    const D2_VERSION = '0.1.33';
    const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 天
    const CACHE_KEY = 'd2_esm_src_v' + D2_VERSION;
    const CACHE_TS_KEY = 'd2_esm_ts_v' + D2_VERSION;

    const CDN_URLS = [
        'https://cdn.jsdelivr.net/npm/@terrastruct/d2@' + D2_VERSION + '/+esm',
        'https://esm.sh/@terrastruct/d2@' + D2_VERSION,
    ];

    let uidCounter = 0;
    const timers = new WeakMap();

    // ============================================================
    // 引擎加载：缓存 → CDN → Blob → import
    // ============================================================
    let d2Instance = null;
    let d2ModulePromise = null;
    let preloadStarted = false;

    function fetchText(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
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
        const blobUrl = URL.createObjectURL(blob);
        try {
            return await import(blobUrl);
        } finally {
            URL.revokeObjectURL(blobUrl);
        }
    }

    function readCache() {
        try {
            const code = GM_getValue(CACHE_KEY, '');
            const ts = GM_getValue(CACHE_TS_KEY, 0);
            if (typeof code === 'string' && code.length > 0) {
                return { code, ts, fresh: Date.now() - ts < CACHE_MAX_AGE };
            }
        } catch (e) {
            error('读取缓存失败:', e.message);
        }
        return null;
    }

    function writeCache(code) {
        try {
            GM_setValue(CACHE_KEY, code);
            GM_setValue(CACHE_TS_KEY, Date.now());
        } catch (e) {
            error('缓存写入失败:', e.message);
        }
    }

    async function fetchFromCDN() {
        let lastErr = null;
        for (const url of CDN_URLS) {
            try {
                const code = await fetchText(url);
                writeCache(code);
                return await importFromSource(code);
            } catch (e) {
                lastErr = e;
            }
        }
        throw lastErr || new Error('所有 D2 CDN 都失败');
    }

    function refreshCacheInBackground() {
        (async () => {
            for (const url of CDN_URLS) {
                try {
                    const code = await fetchText(url);
                    writeCache(code);
                    return;
                } catch (e) {
                    // 静默失败
                }
            }
        })();
    }

    async function loadD2Module() {
        if (d2ModulePromise) return d2ModulePromise;
        d2ModulePromise = (async () => {
            const cached = readCache();
            if (cached) {
                try {
                    const mod = await importFromSource(cached.code);
                    if (!cached.fresh) refreshCacheInBackground();
                    return mod;
                } catch (e) {
                    error('缓存导入失败，回退网络:', e.message);
                }
            }
            return await fetchFromCDN();
        })();
        return d2ModulePromise;
    }

    async function getD2() {
        if (d2Instance) return d2Instance;
        const mod = await loadD2Module();
        const D2 = mod.D2 || mod.default || mod;
        if (typeof D2 !== 'function') {
            throw new Error('D2 导出不是构造函数，实际类型: ' + typeof D2);
        }
        d2Instance = new D2();
        return d2Instance;
    }

    function scheduleIdlePreload() {
        if (preloadStarted) return;
        preloadStarted = true;
        const start = () => {
            getD2().catch(e => {
                // 预加载失败静默，用户点击时会再试
            });
        };
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(start, { timeout: 5000 });
        } else {
            setTimeout(start, 3000);
        }
    }

    // ============================================================
    // 源码提取
    // ============================================================
    function extractD2Source(container) {
        const pre = container.querySelector('pre');
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
    }

    // ============================================================
    // 语言识别：banner 克隆 + 移除按钮
    // ============================================================
    function getCodeLanguage(container) {
        const banner = container.querySelector('.md-code-block-banner');
        if (!banner) return '';
        const clone = banner.cloneNode(true);
        clone.querySelectorAll('[role="button"]').forEach(b => b.remove());
        return clone.textContent.trim().toLowerCase();
    }

    function isD2Block(container) {
        return getCodeLanguage(container) === 'd2';
    }

    function findToolbar(container) {
        const banner = container.querySelector('.md-code-block-banner');
        if (!banner) return null;
        const buttons = Array.from(banner.querySelectorAll('[role="button"]'));
        if (buttons.length === 0) return banner;
        let el = buttons[0].parentElement;
        while (el && el !== banner) {
            if (buttons.every(b => el.contains(b))) return el;
            el = el.parentElement;
        }
        return banner;
    }

    function isInViewport(el, margin) {
        margin = margin || 300;
        const rect = el.getBoundingClientRect();
        return rect.bottom > -margin && rect.top < window.innerHeight + margin;
    }

    // ============================================================
    // SVG 处理
    // ============================================================
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

    // ============================================================
    // 放大视图
    // ============================================================
    function openLightbox(svgEl) {
        const { w, h } = getSvgNaturalSize(svgEl);
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
        const btnZoomOut = mkBtn('−', '缩小 (-)');
        const scaleLabel = document.createElement('span');
        scaleLabel.style.cssText = 'min-width:56px;text-align:center;font-variant-numeric:tabular-nums;color:#555;font-weight:500;';
        const btnZoomIn = mkBtn('+', '放大 (+)');
        const btnFit = mkBtn('适应', '适应屏幕 (F)');
        const btn1x = mkBtn('100%', '原始大小');
        const btnReset = mkBtn('重置', '重置视图 (0)');
        const btnToggleMap = mkBtn('鸟瞰图', '显示/隐藏鸟瞰图');
        btnToggleMap.style.marginLeft = 'auto';
        const closeBtn = mkBtn('✕ 关闭', '关闭 (ESC)');
        toolbar.append(btnZoomOut, scaleLabel, btnZoomIn, btnFit, btn1x, btnReset, btnToggleMap, closeBtn);
        overlay.appendChild(toolbar);
        const stage = document.createElement('div');
        stage.style.cssText = 'flex:1;position:relative;overflow:hidden;cursor:grab;user-select:none;';
        overlay.appendChild(stage);
        const svgWrap = document.createElement('div');
        svgWrap.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,0.25);';
        const clone = svgEl.cloneNode(true);
        clone.removeAttribute('width');
        clone.removeAttribute('height');
        clone.style.cssText = `width:${w}px;height:${h}px;display:block;`;
        svgWrap.appendChild(clone);
        stage.appendChild(svgWrap);
        const mmW = 180, mmH = 130;
        const minimap = document.createElement('div');
        minimap.style.cssText = `position:absolute;right:16px;bottom:16px;width:${mmW}px;height:${mmH}px;background:rgba(255,255,255,0.98);border:1px solid #d0d5dd;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.18);overflow:hidden;z-index:10;cursor:pointer;`;
        const mmSvgWrap = document.createElement('div');
        mmSvgWrap.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;';
        const mmClone = svgEl.cloneNode(true);
        mmClone.removeAttribute('width');
        mmClone.removeAttribute('height');
        mmClone.style.cssText = `width:${w}px;height:${h}px;display:block;`;
        mmSvgWrap.appendChild(mmClone);
        minimap.appendChild(mmSvgWrap);
        const mmViewport = document.createElement('div');
        mmViewport.style.cssText = 'position:absolute;border:1.5px solid #e87e04;background:rgba(232,126,4,0.14);pointer-events:none;border-radius:2px;box-sizing:border-box;';
        minimap.appendChild(mmViewport);
        overlay.appendChild(minimap);
        let scale = 1, offsetX = 0, offsetY = 0;
        const MIN_S = 0.08, MAX_S = 20;
        let mmScale = 1, mmOffX = 0, mmOffY = 0;
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
                case '+': case '=': e.preventDefault(); setScale(scale * 1.25, cx, cy); break;
                case '-': case '_': e.preventDefault(); setScale(scale / 1.25, cx, cy); break;
                case '0': e.preventDefault(); resetView(); break;
                case 'f': case 'F': e.preventDefault(); fitToScreen(); break;
                case 'ArrowLeft': e.preventDefault(); offsetX += 40; applyTransform(); break;
                case 'ArrowRight': e.preventDefault(); offsetX -= 40; applyTransform(); break;
                case 'ArrowUp': e.preventDefault(); offsetY += 40; applyTransform(); break;
                case 'ArrowDown': e.preventDefault(); offsetY -= 40; applyTransform(); break;
            }
        }
        document.addEventListener('keydown', onKey);
        btnZoomIn.addEventListener('click', () => setScale(scale * 1.25, stage.clientWidth / 2, stage.clientHeight / 2));
        btnZoomOut.addEventListener('click', () => setScale(scale / 1.25, stage.clientWidth / 2, stage.clientHeight / 2));
        btnFit.addEventListener('click', fitToScreen);
        btn1x.addEventListener('click', () => setScale(1, stage.clientWidth / 2, stage.clientHeight / 2));
        btnReset.addEventListener('click', resetView);
        let mapVisible = true;
        btnToggleMap.addEventListener('click', () => {
            mapVisible = !mapVisible;
            minimap.style.display = mapVisible ? 'block' : 'none';
            btnToggleMap.style.background = mapVisible ? '#fff' : '#fff7ed';
            btnToggleMap.style.color = mapVisible ? '#333' : '#e87e04';
            btnToggleMap.style.borderColor = mapVisible ? '#d0d5dd' : '#e87e04';
        });
        function close() {
            overlay.remove();
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
        closeBtn.addEventListener('click', close);
        document.body.appendChild(overlay);
        fitMinimap();
        resetView();
    }

    // ============================================================
    // 注入预览按钮
    // ============================================================
    function injectPreviewButton(container) {
        if (container.querySelector('.d2-preview-btn')) return;
        if (!container.dataset.d2Uid) container.dataset.d2Uid = 'd2-' + (++uidCounter);
        const uid = container.dataset.d2Uid;
        const toolbar = findToolbar(container);
        if (!toolbar) {
            error('未找到工具栏，无法注入预览按钮');
            return;
        }
        const old = document.querySelector('.d2-preview-wrap[data-d2-uid="' + uid + '"]');
        if (old) old.remove();

        const previewBtn = document.createElement('div');
        previewBtn.className = 'd2-preview-btn ds-button ds-button--borderlessNeutral ds-button--borderless ds-button--capsule ds-button--xs ds-button--icon-relative-m ds-button--min-width';
        previewBtn.setAttribute('role', 'button');
        previewBtn.setAttribute('tabindex', '0');
        previewBtn.dataset.d2Uid = uid;
        previewBtn.style.cssText = 'cursor:pointer; margin-left:2px;';
        previewBtn.innerHTML = `
            <div class="ds-button__background"></div>
            <span class="ds-button__content">
                <span class="code-info-button-text" style="color:#e87e04;">预览</span>
            </span>
        `;

        const previewWrap = document.createElement('div');
        previewWrap.className = 'd2-preview-wrap';
        previewWrap.dataset.d2Uid = uid;
        previewWrap.style.cssText = 'display:none; margin-top:8px;';

        const previewInner = document.createElement('div');
        previewInner.style.cssText = 'position:relative; padding:12px; background:#fafbfc; border:1px solid #e1e4e8; border-radius:8px; overflow-x:auto;';

        const svgArea = document.createElement('div');
        svgArea.className = 'd2-svg-area';
        svgArea.style.cssText = 'max-width:100%;';

        const actionBar = document.createElement('div');
        actionBar.className = 'd2-action-bar';
        actionBar.style.cssText = 'position:absolute; top:8px; right:8px; display:none; gap:6px; z-index:2;';

        const mkAction = (text) => {
            const b = document.createElement('div');
            b.setAttribute('role', 'button');
            b.setAttribute('tabindex', '0');
            b.textContent = text;
            b.style.cssText = 'cursor:pointer; font-size:11px; padding:3px 9px; background:#fff; border:1px solid #d0d5dd; border-radius:4px; color:#e87e04; opacity:0.75; user-select:none; transition:opacity .15s;';
            b.addEventListener('mouseenter', () => { b.style.opacity = '1'; });
            b.addEventListener('mouseleave', () => { b.style.opacity = '0.75'; });
            return b;
        };

        const copyBtn = mkAction('⎘ 复制');
        const zoomBtn = mkAction('⤢ 放大');
        actionBar.append(copyBtn, zoomBtn);

        const errorArea = document.createElement('div');
        errorArea.className = 'd2-error-area';
        errorArea.style.cssText = 'display:none; color:#c00; font-size:12px; padding:8px; background:#fff0f0; border-radius:4px; margin-top:8px;';

        previewInner.append(svgArea, actionBar, errorArea);
        previewWrap.appendChild(previewInner);

        let rendered = false;
        let isOpen = false;

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
                setTimeout(() => { copyBtn.textContent = original; copyBtn.style.color = '#e87e04'; }, 1400);
            } catch (e) {
                error('复制失败:', e);
                copyBtn.textContent = '✗ 失败';
                copyBtn.style.color = '#c00';
                setTimeout(() => { copyBtn.textContent = original; copyBtn.style.color = '#e87e04'; }, 1400);
            } finally {
                copyBtn.style.pointerEvents = 'auto';
            }
        });

        zoomBtn.addEventListener('click', (ev) => {
            ev.stopPropagation(); ev.preventDefault();
            const svgEl = svgArea.querySelector('svg');
            if (svgEl) openLightbox(svgEl);
        });

        previewBtn.addEventListener('click', async (ev) => {
            ev.preventDefault(); ev.stopPropagation();

            const currentContainer = document.querySelector('.md-code-block[data-d2-uid="' + uid + '"]');
            const currentPreview = document.querySelector('.d2-preview-wrap[data-d2-uid="' + uid + '"]');
            if (!currentContainer || !currentPreview) return;
            const currentSvgArea = currentPreview.querySelector('.d2-svg-area');
            const currentErrorArea = currentPreview.querySelector('.d2-error-area');
            const currentActionBar = currentPreview.querySelector('.d2-action-bar');

            if (rendered) {
                isOpen = !isOpen;
                currentPreview.style.display = isOpen ? 'block' : 'none';
                updateButtonText();
                return;
            }

            previewBtn.style.opacity = '0.5';
            previewBtn.style.pointerEvents = 'none';
            updateButtonText('渲染中…');

            const source = extractD2Source(currentContainer);
            if (!source) {
                currentErrorArea.innerHTML = '<div style="font-weight:bold;">⚠️ 无法渲染</div><div>未提取到有效的 D2 源码。</div>';
                currentErrorArea.style.display = 'block';
                currentPreview.style.display = 'block';
                isOpen = true;
                previewBtn.style.opacity = '1';
                previewBtn.style.pointerEvents = 'auto';
                updateButtonText('预览');
                return;
            }

            try {
                const d2 = await getD2();
                const compileResult = await d2.compile(source);
                const svgString = await d2.render(compileResult.diagram, compileResult.renderOptions);
                if (!svgString) throw new Error('渲染结果为空');
                currentSvgArea.innerHTML = prepareSvg(svgString);
                rendered = true;
                isOpen = true;
                currentPreview.style.display = 'block';
                currentErrorArea.style.display = 'none';
                if (currentActionBar) currentActionBar.style.display = 'flex';
                updateButtonText();
            } catch (e) {
                error('uid=' + uid + ' 渲染失败:', e);
                currentErrorArea.innerHTML = `
                    <div style="font-weight:bold; margin-bottom:4px;">⚠️ 渲染失败</div>
                    <div style="margin-bottom:6px;">${e.message}</div>
                    <div style="color:#888; font-size:11px;">D2 语法不正确，或引擎未加载。详见 console。</div>
                `;
                currentErrorArea.style.display = 'block';
                currentPreview.style.display = 'block';
                isOpen = true;
                if (currentActionBar) currentActionBar.style.display = 'none';
                updateButtonText('预览');
            } finally {
                previewBtn.style.opacity = '1';
                previewBtn.style.pointerEvents = 'auto';
            }
        });

        function updateButtonText(text) {
            const span = previewBtn.querySelector('.code-info-button-text');
            if (!span) return;
            if (text) span.textContent = text;
            else span.textContent = isOpen ? '关闭' : '预览';
        }

        toolbar.appendChild(previewBtn);
        container.parentNode.insertBefore(previewWrap, container.nextSibling);
    }

    // ============================================================
    // 调度与扫描
    // ============================================================
    function scheduleInject(container) {
        if (container.querySelector('.d2-preview-btn')) return;
        if (timers.has(container)) clearTimeout(timers.get(container));
        const t = setTimeout(() => {
            timers.delete(container);
            if (!container.isConnected) return;
            if (container.querySelector('.d2-preview-btn')) return;
            if (!isInViewport(container)) return;
            if (!isD2Block(container)) return;
            injectPreviewButton(container);
        }, 400);
        timers.set(container, t);
    }

    function scanViewport() {
        const containers = document.querySelectorAll('.md-code-block');
        for (const container of containers) {
            if (container.querySelector('.d2-preview-btn')) continue;
            if (!isInViewport(container)) continue;
            if (!isD2Block(container)) continue;
            scheduleInject(container);
        }
    }

    let scrollScheduled = false;
    function onScrollOrResize() {
        if (scrollScheduled) return;
        scrollScheduled = true;
        requestAnimationFrame(() => { scrollScheduled = false; scanViewport(); });
    }
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    let scanScheduled = false;
    function scheduleScan() {
        if (scanScheduled) return;
        scanScheduled = true;
        requestAnimationFrame(() => { scanScheduled = false; scanViewport(); });
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
                    if (block && !block.querySelector('.d2-preview-btn') && isInViewport(block) && isD2Block(block)) {
                        scheduleInject(block);
                    }
                }
                if (needScan) break;
            }
            if (needScan) scheduleScan();
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        scanViewport();
    }

    if (document.body) setupObserver();
    else document.addEventListener('DOMContentLoaded', setupObserver);

    // 页面空闲时预加载 D2 引擎
    scheduleIdlePreload();

})();
