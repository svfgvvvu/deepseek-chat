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

DeepSeek Chat 无法直接渲染 SVG，AI 输出的 `wireloom` 代码块只能看到纯文本。本脚本在代码块工具栏注入「预览」按钮，点击后在代码块下方就地渲染 SVG 线框图，并支持复制图片、全屏放大查看。

**版本：** 20.0.0
**匹配范围：** `https://chat.deepseek.com/*`
**文件位置：** `Tampermonkey/DeepSeek Wireloom 预览按钮.js`

### 主要特性

- **按需渲染**：点击「预览」才渲染，不干扰正常阅读
- **流式兼容**：AI 流式输出时自动防抖，内容稳定后才注入按钮
- **视口懒加载**：只处理滚动到可视区域的代码块，长对话不卡顿
- **复制图片**：一键将线框图转为 PNG（2 倍分辨率、白底）复制到剪贴板
- **全屏放大**：支持滚轮缩放、拖拽平移、键盘操作和鸟瞰图导航
- **错误提示**：语法不正确时显示引擎原始错误，提示让 DeepSeek 按官方语法重新生成

### 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)
2. 打开控制面板 → 新建脚本
3. 将 `Tampermonkey/DeepSeek Wireloom 预览按钮.js` 全部内容粘贴进去，保存
4. 打开 [chat.deepseek.com](https://chat.deepseek.com/)，脚本自动启动

### 使用方式

让 DeepSeek 按以下格式输出（语言标记为 `wireloom`）：

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

- **点击「预览」** → 代码块下方渲染 SVG，按钮变为「关闭」
- **再次点击** → 折叠预览
- **悬停预览区右上角** → 出现「⎘ 复制」「⤢ 放大」
- **「⎘ 复制」** → 线框图转为 PNG 复制到剪贴板，可直接粘贴到文档
- **「⤢ 放大」** → 进入全屏视图（见下方操作表）
- **Esc / 点击背景 / ✕** → 关闭放大视图

### 放大视图操作

| 操作 | 效果 |
|:---|:---|
| **打开时** | 自动智能倍率：优先 2x，装不下就取能放进屏幕的最大整数倍（最小 1x） |
| **滚轮** | 以光标位置为中心缩放 |
| **拖拽画布** | 按住左键平移 |
| **`+` / `-`** | 以视图中心缩放 |
| **方向键** | 微调平移 |
| **`0`** | 重置为默认倍率 |
| **`F`** | 适应屏幕 |
| **`ESC`** | 关闭 |
| **工具栏 `1x / 2x / 4x`** | 一键切换倍率 |
| **鸟瞰图** | 点击跳转、拖拽导航，工具栏可开关 |

### 常见问题

**Q：看不到「预览」按钮？**

1. 确认代码块语言标记是 `wireloom`（不是 `wl`、`wireframe`）
2. 按 F12 查看 Console 是否有 `[DeepSeek Wireloom]` 报错
3. 检查 CDN 是否可访问：`https://cdn.jsdelivr.net/npm/wireloom@0.7.0/dist/index.cjs`

**Q：点击预览后显示「渲染失败」？**

源码提取成功但 Wireloom 解析失败，通常是语法问题（比如根节点用了 `screen` 而非 `window`、缺少冒号、缩进不规范）。直接让 DeepSeek「按 Wireloom 官方语法重新生成，缩进用两个空格」。

**Q：预览的 SVG 太小 / 太模糊？**

预览区按容器宽度自适应缩放，矢量图不会模糊。需要看细节时点击「⤢ 放大」，支持滚轮缩放和拖拽平移。

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

### 常见问题

**Q：主题里的 `@when organizeMode` 不生效？**

标准 Stylus 不认识 `@when`。把它改成普通规则即可，例如把 `@when organizeMode { ... }` 内的内容直接抽出来放在文件末尾。

**Q：能否只用主题不用脚本？**

可以。两者完全独立——Stylus 改的是外观，油猴脚本改的是代码块的行为与内容。
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

## 许可证

- 油猴脚本（`Tampermonkey/DeepSeek Wireloom 预览按钮.js`）：MIT
- Stylus 主题样式（`Stylus/DeepSeek 阅读模式.css`）：MIT
- [Wireloom 引擎](https://github.com/StardockCorp/Wireloom)（Stardock 开发）：MIT
