// ==UserScript==
// @name         DeepSeek Wireloom 预览按钮
// @namespace    https://github.com/StardockCorp/Wireloom
// @version      19.0.0
// @description  为 DeepSeek Chat 中的 wireloom 代码块添加预览按钮，支持放大查看
// @author       You
// @match        https://chat.deepseek.com/*
// @grant        none
// @run-at       document-idle
// @require      data:text/javascript,var module={exports:{}};var exports=module.exports;
// @require      https://cdn.jsdelivr.net/npm/wireloom@0.7.0/dist/index.cjs
// @require      data:text/javascript,window.wireloom=module.exports.default||module.exports;
// ==/UserScript==

(function () {
    'use strict';

    let uidCounter = 0;
    const timers = new WeakMap();

    function getWireloom() {
        if (typeof wireloom === 'undefined' || !wireloom) {
            // console.error('[DeepSeek Wireloom] wireloom 全局对象未找到');
            return null;
        }
        if (!getWireloom._initialized) {
            try {
                wireloom.initialize({ theme: 'default' });
                getWireloom._initialized = true;
                // console.log('[DeepSeek Wireloom] 引擎初始化完成');
            } catch (e) {
                // console.error('[DeepSeek Wireloom] 初始化失败:', e);
                return null;
            }
        }
        return wireloom;
    }

    function extractWireloomSource(container) {
        const pre = container.querySelector('pre');
        if (!pre) return '';

        const uid = container.dataset.wlUid || '?';

        // 1. 优先按 DeepSeek 的行结构取：直接子 span 就是一行
        let lines;
        const spans = pre.querySelectorAll(':scope > span');
        if (spans.length > 0) {
            lines = Array.from(spans).map(s => s.textContent);
        } else {
            // 2. 兜底：DOM 结构变了就直接按换行拆
            // console.warn('[DeepSeek Wireloom] uid=' + uid + ' 未找到行 span，改用 textContent 拆分');
            lines = pre.textContent.split(/\r?\n/);
        }

        // 3. 过滤空行和围栏行，保留原始缩进
        const cleaned = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith('```')) continue;
            cleaned.push(line);
        }

        // 4. 统一处理：去零宽字符、去残留 \r、trim 首尾
        const result = cleaned.join('\n')
        .replace(/[\u200b\u200c\u200d]/g, '')
        .replace(/\r/g, '')
        .trim();

        // console.log('[DeepSeek Wireloom] uid=' + uid + ' 提取 ' + cleaned.length + ' 行');
        return result;
    }

    function isWireloomBlock(container) {
        const langSpan = container.querySelector('.d813de27');
        if (langSpan && langSpan.textContent.trim().toLowerCase() === 'wireloom') return true;
        const codeLangSpan = container.querySelector('.token.code-language');
        if (codeLangSpan && codeLangSpan.textContent.trim().toLowerCase() === 'wireloom') return true;
        return false;
    }

    function isInViewport(el, margin) {
        margin = margin || 300;
        const rect = el.getBoundingClientRect();
        return rect.bottom > -margin && rect.top < window.innerHeight + margin;
    }

    // ============================================================
    // 大画布处理：确保 viewBox + 放大物理尺寸 + 响应式缩放
    // ============================================================
    function prepareSvg(svgString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        const svg = doc.documentElement;

        let vb = svg.getAttribute('viewBox');
        if (!vb) {
            const w = parseFloat(svg.getAttribute('width')) || 800;
            const h = parseFloat(svg.getAttribute('height')) || 600;
            vb = `0 0 ${w} ${h}`;
            svg.setAttribute('viewBox', vb);
        }

        const parts = vb.split(/[\s,]+/).map(Number);
        const baseW = parts[2] || 800;
        const baseH = parts[3] || 600;
        svg.setAttribute('width', baseW * 4);
        svg.setAttribute('height', baseH * 4);
        svg.style.cssText = 'width:100%; height:auto; display:block; max-width:100%;';

        return svg.outerHTML;
    }

    // ============================================================
    // 放大遮罩层
    // ============================================================
    function openLightbox(svgSource) {
        if (!svgSource) return;

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed; inset:0; z-index:2147483647; background:rgba(15,18,30,0.78); display:flex; align-items:center; justify-content:center; padding:40px; box-sizing:border-box; backdrop-filter:blur(2px);';

        const container = document.createElement('div');
        container.style.cssText = 'position:relative; background:#fff; border-radius:10px; padding:28px; max-width:95vw; max-height:92vh; overflow:auto; box-shadow:0 12px 48px rgba(0,0,0,0.35);';

        const clone = svgSource.cloneNode(true);
        clone.removeAttribute('width');
        clone.removeAttribute('height');
        clone.style.cssText = 'width:100%; max-width:1600px; height:auto; display:block;';
        container.appendChild(clone);

        const closeBtn = document.createElement('div');
        closeBtn.setAttribute('role', 'button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'position:absolute; top:-14px; right:-14px; width:32px; height:32px; line-height:32px; text-align:center; background:#fff; border-radius:50%; cursor:pointer; font-size:16px; color:#555; box-shadow:0 2px 10px rgba(0,0,0,0.25); user-select:none;';
        closeBtn.addEventListener('mouseenter', () => { closeBtn.style.background = '#f2f5ff'; closeBtn.style.color = '#4a6cf7'; });
        closeBtn.addEventListener('mouseleave', () => { closeBtn.style.background = '#fff'; closeBtn.style.color = '#555'; });

        overlay.appendChild(container);
        overlay.appendChild(closeBtn);
        document.body.appendChild(overlay);

        function close() {
            overlay.remove();
            document.removeEventListener('keydown', onKey);
        }
        function onKey(e) { if (e.key === 'Escape') close(); }

        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        closeBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
        document.addEventListener('keydown', onKey);
    }

    // ============================================================
    // 注入预览按钮
    // ============================================================
    function injectPreviewButton(container) {
        if (container.querySelector('.wireloom-preview-btn')) return;

        if (!container.dataset.wlUid) {
            container.dataset.wlUid = 'wl-' + (++uidCounter);
        }
        const uid = container.dataset.wlUid;

        const toolbar = container.querySelector('.d2a24f03._246a029')
                     || container.querySelector('.d2a24f03')
                     || container.querySelector('.md-code-block-banner');
        if (!toolbar) return;

        const old = document.querySelector('.wireloom-preview-wrap[data-wl-uid="' + uid + '"]');
        if (old) old.remove();

        const previewBtn = document.createElement('div');
        previewBtn.className = 'wireloom-preview-btn ds-button ds-button--borderlessNeutral ds-button--borderless ds-button--capsule ds-button--xs ds-button--icon-relative-m ds-button--min-width';
        previewBtn.setAttribute('role', 'button');
        previewBtn.setAttribute('tabindex', '0');
        previewBtn.dataset.wlUid = uid;
        previewBtn.style.cssText = 'cursor:pointer; margin-left:2px;';
        previewBtn.innerHTML = `
            <div class="ds-button__background"></div>
            <span class="ds-button__content">
                <span class="code-info-button-text" style="color:#4a6cf7;">预览</span>
            </span>
        `;

        const previewWrap = document.createElement('div');
        previewWrap.className = 'wireloom-preview-wrap';
        previewWrap.dataset.wlUid = uid;
        previewWrap.style.cssText = 'display:none; margin-top:8px;';

        const previewInner = document.createElement('div');
        previewInner.style.cssText = 'position:relative; padding:12px; background:#fafbfc; border:1px solid #e1e4e8; border-radius:8px; overflow-x:auto;';

        const svgArea = document.createElement('div');
        svgArea.className = 'wireloom-svg-area';
        svgArea.style.cssText = 'max-width:100%;';

        const lightboxBtn = document.createElement('div');
        lightboxBtn.className = 'wireloom-lightbox-btn';
        lightboxBtn.setAttribute('role', 'button');
        lightboxBtn.setAttribute('tabindex', '0');
        lightboxBtn.textContent = '⤢ 放大';
        lightboxBtn.style.cssText = 'position:absolute; top:8px; right:8px; cursor:pointer; font-size:11px; padding:3px 9px; background:#fff; border:1px solid #d0d5dd; border-radius:4px; color:#4a6cf7; opacity:0.65; display:none; z-index:2; user-select:none; transition:opacity .15s;';
        lightboxBtn.addEventListener('mouseenter', () => { lightboxBtn.style.opacity = '1'; });
        lightboxBtn.addEventListener('mouseleave', () => { lightboxBtn.style.opacity = '0.65'; });

        const errorArea = document.createElement('div');
        errorArea.className = 'wireloom-error-area';
        errorArea.style.cssText = 'display:none; color:#c00; font-size:12px; padding:8px; background:#fff0f0; border-radius:4px; margin-top:8px;';

        previewInner.appendChild(svgArea);
        previewInner.appendChild(lightboxBtn);
        previewInner.appendChild(errorArea);
        previewWrap.appendChild(previewInner);

        let rendered = false;
        let isOpen = false;

        lightboxBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            const svgEl = svgArea.querySelector('svg');
            if (svgEl) openLightbox(svgEl);
        });

        previewBtn.addEventListener('click', async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();

            const currentContainer = document.querySelector('.md-code-block[data-wl-uid="' + uid + '"]');
            const currentPreview = document.querySelector('.wireloom-preview-wrap[data-wl-uid="' + uid + '"]');
            if (!currentContainer || !currentPreview) return;

            const currentSvgArea = currentPreview.querySelector('.wireloom-svg-area');
            const currentErrorArea = currentPreview.querySelector('.wireloom-error-area');
            const currentLightboxBtn = currentPreview.querySelector('.wireloom-lightbox-btn');

            if (rendered) {
                isOpen = !isOpen;
                currentPreview.style.display = isOpen ? 'block' : 'none';
                updateButtonText();
                return;
            }

            previewBtn.style.opacity = '0.5';
            previewBtn.style.pointerEvents = 'none';
            updateButtonText('渲染中…');

            const source = extractWireloomSource(currentContainer);
            if (!source) {
                currentErrorArea.innerHTML = '<div style="font-weight:bold;">⚠️ 无法渲染</div><div>未提取到有效的 Wireloom 源码。</div>';
                currentErrorArea.style.display = 'block';
                currentPreview.style.display = 'block';
                isOpen = true;
                previewBtn.style.opacity = '1';
                previewBtn.style.pointerEvents = 'auto';
                updateButtonText('预览');
                return;
            }

            try {
                const wl = getWireloom();
                if (!wl) throw new Error('Wireloom 引擎未加载');
                const result = await wl.render('ds-wl-' + uid + '-' + Date.now(), source);
                if (!result || !result.svg) throw new Error('渲染结果为空');

                // ★ 大画布处理后再放入
                currentSvgArea.innerHTML = prepareSvg(result.svg);

                rendered = true;
                isOpen = true;
                currentPreview.style.display = 'block';
                currentErrorArea.style.display = 'none';
                if (currentLightboxBtn) currentLightboxBtn.style.display = 'block';
                updateButtonText();
            } catch (e) {
                console.error('[DeepSeek Wireloom] uid=' + uid + ' 渲染失败:', e);
                currentErrorArea.innerHTML = `
                    <div style="font-weight:bold; margin-bottom:4px;">⚠️ 渲染失败</div>
                    <div style="margin-bottom:6px;">${e.message}</div>
                    <div style="color:#888; font-size:11px;">Wireloom 语法不正确。请让 DeepSeek 按官方语法重新生成。</div>
                `;
                currentErrorArea.style.display = 'block';
                currentPreview.style.display = 'block';
                isOpen = true;
                if (currentLightboxBtn) currentLightboxBtn.style.display = 'none';
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
        if (container.querySelector('.wireloom-preview-btn')) return;
        if (timers.has(container)) clearTimeout(timers.get(container));
        const t = setTimeout(() => {
            timers.delete(container);
            if (!container.isConnected) return;
            if (container.querySelector('.wireloom-preview-btn')) return;
            if (!isInViewport(container)) return;
            if (!isWireloomBlock(container)) return;
            injectPreviewButton(container);
            // console.log('[DeepSeek Wireloom] 注入按钮 uid=' + (container.dataset.wlUid || '?'));
        }, 400);
        timers.set(container, t);
    }

    function scanViewport() {
        const containers = document.querySelectorAll('.md-code-block');
        for (const container of containers) {
            if (container.querySelector('.wireloom-preview-btn')) continue;
            if (!isInViewport(container)) continue;
            if (!isWireloomBlock(container)) continue;
            scheduleInject(container);
        }
    }

    let scrollScheduled = false;
    function onScrollOrResize() {
        if (scrollScheduled) return;
        scrollScheduled = true;
        requestAnimationFrame(() => {
            scrollScheduled = false;
            scanViewport();
        });
    }
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    let scanScheduled = false;
    function scheduleScan() {
        if (scanScheduled) return;
        scanScheduled = true;
        requestAnimationFrame(() => {
            scanScheduled = false;
            scanViewport();
        });
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
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        needScan = true;
                        break;
                    }
                }
                if (mutation.type === 'characterData' || mutation.type === 'childList') {
                    const block = getBlockAncestor(mutation.target);
                    if (block
                        && !block.querySelector('.wireloom-preview-btn')
                        && isInViewport(block)
                        && isWireloomBlock(block)) {
                        scheduleInject(block);
                    }
                }
                if (needScan) break;
            }
            if (needScan) scheduleScan();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        scanViewport();
        // console.log('[DeepSeek Wireloom] 脚本已启动');
    }

    if (document.body) setupObserver();
    else document.addEventListener('DOMContentLoaded', setupObserver);

})();