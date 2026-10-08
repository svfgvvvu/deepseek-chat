# DeepSeek Chat 增强工具集

本仓库提供两套针对 DeepSeek Chat 的增强方案，可独立使用，也可搭配使用：

| 工具 | 类型 | 作用 |
|------|------|------|
| **Tampermonkey 油猴脚本** | 用户脚本 | 在 `wireloom` 代码块工具栏注入「预览」按钮，点击后渲染为 SVG 线框图，并支持放大查看 |
| **Stylus 阅读模式** | 浏览器扩展样式 | 定制聊天气泡、输入框、代码块、滚动条等视觉元素，内置浅色/深色模式，并提供「整理模式」与「心流模式」两套阅读增强方案 |

---

## 目录结构

```
.
├── README.md
├── Stylus/
│   └── DeepSeek 阅读模式.css          # Stylus 用户样式（阅读模式主题）
└── Tampermonkey/
    └── DeepSeek Wireloom 预览按钮.js  # 油猴脚本（Wireloom 渲染）
```

---

## 一、Tampermonkey 油猴脚本 — DeepSeek Wireloom 预览按钮

### 功能说明

DeepSeek Chat 的 Markdown 渲染器无法直接渲染 SVG，因此当 AI 输出 `wireloom` DSL 时只能看到纯文本代码块。本脚本在代码块工具栏注入一个「预览」按钮，点击后在代码块下方就地渲染 SVG 线框图，并提供「⤢ 放大」入口用于全屏查看。

**版本：** 19.0.0  
**匹配范围：** `https://chat.deepseek.com/*`  
**文件位置：** `Tampermonkey/DeepSeek Wireloom 预览按钮.js`

### 主要特性

- **按需渲染**：脚本不会自动替换代码块，只有点击「预览」按钮才渲染，避免干扰正常阅读
- **视口懒加载**：仅处理进入视口（上下各 300px 余量）的代码块，长对话滚动流畅
- **400ms 防抖**：`scheduleInject` 对每个代码块单独计时，避免流式输出期间频繁重算
- **去重处理**：通过 `data-wl-uid` 和 `.wireloom-preview-btn` 双重标记，不会重复注入
- **大画布缩放**：`prepareSvg` 把 SVG 的物理尺寸放大 4 倍，配合 `viewBox` 保持清晰度，同时设置 `width:100%` 自适应容器宽度
- **放大遮罩层**：Esc 关闭、点击背景关闭、右上角 ✕ 关闭，SVG 最大宽度 1600px
- **错误兜底**：渲染失败时在代码块下方展示错误信息，提示用户让 AI 按官方语法重新生成

### 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)
2. 打开控制面板 → 新建脚本
3. 将 `Tampermonkey/DeepSeek Wireloom 预览按钮.js` 全部内容粘贴进去，保存
4. 打开 [chat.deepseek.com](https://chat.deepseek.com/)，脚本在 `document-idle` 时启动

### 依赖加载方式

脚本通过 `@require` 指令加载 Wireloom 引擎，并用两行 `data:` URI 做 CommonJS 兼容垫片：

```javascript
// @require data:text/javascript,var module={exports:{}};var exports=module.exports;
// @require https://cdn.jsdelivr.net/npm/wireloom@0.7.0/dist/index.cjs
// @require data:text/javascript,window.wireloom=module.exports.default||module.exports;
```

第一行创建 `module` / `exports` 对象，第二行加载 Wireloom 的 CJS 版本，第三行把导出挂到 `window.wireloom` 上，供脚本后续调用 `wireloom.initialize()` 与 `wireloom.render()`。

### 使用方式

让 DeepSeek 按以下格式输出（注意语言标记为 `wireloom`）：

````markdown
```wireloom
window "Sign in":
  header:
    text "Welcome back"
  panel:
    input placeholder="Email"
    input placeholder="Password" type=password
    button "Sign in" primary
  footer:
    text "Forgot your password?"
```
````

代码块右上角工具栏会出现「预览」按钮：

- **点击「预览」** → 在代码块下方渲染 SVG，按钮变为「关闭」
- **再次点击** → 折叠预览
- **悬停预览区右上角** → 出现「⤢ 放大」，点击进入全屏遮罩
- **Esc / 点击背景 / ✕** → 关闭放大视图

### 源码提取逻辑

`extractWireloomSource` 按以下顺序提取源码：

1. 优先使用 `pre > span` 的行结构（DeepSeek 用 span 表示每一行）
2. 兜底用 `pre.textContent.split(/\r?\n/)` 按换行拆
3. 过滤空行与 ` ``` ` 围栏行，保留原始缩进（缩进是 Wireloom 语法的一部分）
4. 清除零宽字符（`\u200b\u200c\u200d`）和残留 `\r`，首尾 `trim`

### 关键选择器

如果 DeepSeek 更新了页面结构，可能需要调整以下选择器：

| 用途 | 选择器 |
|------|--------|
| 代码块容器 | `.md-code-block` |
| 工具栏 | `.d2a24f03._246a029` / `.d2a24f03` / `.md-code-block-banner` |
| 语言标签 | `.d813de27` / `.token.code-language` |

---

## 二、Stylus 用户样式 — DeepSeek 阅读模式

### 功能说明

一份完整的 DeepSeek Chat 配色与阅读增强方案，覆盖聊天气泡、输入框、代码块、引用、滚动条、选中高亮、加载动画等。内置浅色与深色两套基础配色，并额外提供「整理模式」与「心流模式」两套针对长文阅读的优化方案。

**文件位置：** `Stylus/DeepSeek 阅读模式.css`

### 安装

1. 从扩展商店安装 [Stylus](https://chrome.google.com/webstore/detail/stylus/clngdbkpkpeebahjckkjfobafhncgmne)（Chrome / Edge）或 [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/styl-us/)
2. 点击 Stylus 图标 → **编写新样式**
3. 「适用网址」填 `https://chat.deepseek.com/*`
4. 粘贴 `Stylus/DeepSeek 阅读模式.css` 全部内容，保存

### 配色结构

所有颜色以 CSS 变量定义在 `:root` 中，改一处即可全局生效：

```css
:root {
    --ds-bg: #FCFBFA;              /* 页面背景 */
    --ds-text-primary: #2E2C2A;    /* 主文字 */
    --ds-primary: #1877F2;         /* 品牌蓝 */
    --ds-bubble-user: #1877F2;     /* 用户气泡 */
    --ds-bubble-ai: #FFFFFF;       /* AI 气泡 */
    --ds-error: #E5484D;
}
```

### 覆盖的界面元素

- 页面与滚动区背景、顶栏
- 用户气泡（右下圆角）与 AI 气泡（左下圆角）
- 输入框：默认态、聚焦光晕、placeholder、光标色
- 代码块、行内代码、引用块
- 侧边栏、主按钮、滚动条、选中高亮
- 加载动画圆点、AI 思考光标（渐变动画）

### 深色模式

通过 `@media (prefers-color-scheme: dark)` 自动跟随系统切换，无需手动干预。深色下的主要差异：

- 页面背景 `#1C1B1A`，气泡 `#4A9EFF` / `#2A2825`
- 边框改为 `rgba(255,255,255,0.06)`
- 主色调整为更亮的 `#4A9EFF`，避免深色下蓝色发闷

### 整理模式（暖色点缀）

```css
@when organizeMode { ... }
```

在保留浅色/深色基础的前提下，把主交互色切换为琥珀色系（`#D97706` / `#F59E0B`），并附加以下阅读友好装饰：

- 用户气泡改为琥珀底 + 深色文字
- `h1` / `h2` / `h3` 下方添加暖色渐变小横线，便于快速定位标题
- `strong` / `b` 加粗文字加琥珀底高亮（模拟马克笔）
- 列表标记、引用块左边线、`hr` 分割线、行内代码、链接统一暖色
- 输入框聚焦光晕改为琥珀色

### 心流模式（全灰阶去彩）

```css
@when flowMode { ... }
```

把整页彩色元素降为中性灰，仅保留极弱的蓝灰色光标（`#A8C8E8`）作为输入位置提示。适合长时间写作或需要屏蔽视觉干扰的场景。此模式优先级最高，放在样式文件最后，会覆盖前面所有彩色规则。

> **关于 `@when`**：这是条件模式块，需要兼容的前处理器在构建时展开，或由支持模式切换的 Stylus 分支识别。若你的 Stylus 是标准版，可以手动把 `@when xxx { ... }` 的花括号内容取出，直接作为普通规则使用。

---

## 兼容性

| 项目 | 要求 |
|------|------|
| 浏览器 | Chrome 76+ / Firefox 103+ / Edge 79+ / Safari 13+ |
| 油猴脚本管理器 | Tampermonkey、Violentmonkey、Greasemonkey |
| Stylus | 任意版本（`@when` 模式需支持条件块的前处理器） |
| Wireloom 引擎 | v0.7.0（通过 jsDelivr CDN 加载） |
| DeepSeek Chat | chat.deepseek.com 最新界面 |

---

## 常见问题

**Q：脚本装了但看不到「预览」按钮？**

按顺序排查：

1. Console 是否有 `[DeepSeek Wireloom]` 相关报错
2. 代码块的语言标记是否为 `wireloom`（不是 `wl`、`wireframe` 等）
3. 页面结构是否变更：检查 `.md-code-block`、`.d813de27` 等选择器是否仍存在
4. CDN 是否可访问：直接打开 `https://cdn.jsdelivr.net/npm/wireloom@0.7.0/dist/index.cjs`

**Q：点击预览后显示「Wireloom 语法不正确」？**

说明源码提取成功但解析失败，通常是缩进不对。Wireloom 依赖缩进表达层级，建议让 DeepSeek「按 Wireloom 官方语法重新生成，注意缩进用两个空格」。

**Q：预览的 SVG 太小 / 太模糊？**

脚本已把物理尺寸放大 4 倍并用 `viewBox` 保持矢量清晰度。如果仍觉偏小，点击「⤢ 放大」进入全屏视图。

**Q：主题里的 `@when organizeMode` 不生效？**

标准 Stylus 不认识 `@when`。把它改成普通规则即可，例如把 `@when organizeMode { ... }` 内的内容直接抽出来放在文件末尾。

**Q：能否只用主题不用脚本？**

可以。两者完全独立——Stylus 改的是外观，油猴脚本改的是代码块的行为与内容。

---

## 许可证

- 油猴脚本（`Tampermonkey/DeepSeek Wireloom 预览按钮.js`）：MIT
- Stylus 主题样式（`Stylus/DeepSeek 阅读模式.css`）：MIT
- [Wireloom 引擎](https://github.com/StardockCorp/Wireloom)（Stardock 开发）：MIT