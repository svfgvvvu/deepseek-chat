# DeepSeek Chat 增强工具集

本仓库提供针对 DeepSeek Chat 的增强方案，可独立使用，也可搭配使用：

| 工具 | 类型 | 作用 |
|------|------|------|
| **D2 + Wireloom 图渲染** | Tampermonkey 油猴脚本 | 自动识别 `d2` / `wireloom` 代码块并就地渲染 SVG，支持多图对比、灯箱放大、复制图片 |
| **Wireloom 配套提示词** | Markdown 提示词 | 帮助 AI 生成符合 Wireloom 语法的线框图代码，提升一次渲染成功率 |
| **DeepSeek 阅读模式** | Stylus 用户样式 | 定制聊天气泡、输入框、代码块等视觉元素，内置浅色/深色模式与「整理模式」「心流模式」 |

---

## 目录结构

```
.
├── README.md
├── Stylus/
│   └── DeepSeek 阅读模式.user.css          # Stylus 用户样式（阅读模式主题）
└── Tampermonkey/
    ├── DeepSeek D2+wireloom图渲染.user.js  # 油猴脚本（图渲染框架）
    └── wireloom 配套提示词.md               # Wireloom 生成提示词
```

---

## 一、Tampermonkey 油猴脚本 — DeepSeek D2 + Wireloom 图渲染

### 功能说明

DeepSeek Chat 无法直接渲染 `d2` 和 `wireloom` 代码块，只能看到纯文本。本脚本自动识别这两类代码块，在代码块下方就地渲染 SVG，并提供多图对比、灯箱放大、复制图片等能力。

**版本：** 3.1.2
**匹配范围：** `https://chat.deepseek.com/*`
**文件位置：** `Tampermonkey/DeepSeek D2+wireloom图渲染.user.js`

### 支持的格式

| 格式 | 用途 | 渲染引擎 | 品牌色 |
|:---|:---|:---|:---|
| `d2` | 架构图、流程图、时序图 | [@terrastruct/d2](https://github.com/terrastruct/d2) | 橙黄 `#e87e04` |
| `wireloom` | UI 线框图、界面草图 | [wireloom](https://github.com/StardockCorp/Wireloom) | 品牌蓝 `#4a6cf7` |

### 主要特性

- **自动渲染**：代码块出现后自动渲染，无需点击
- **流式兼容**：AI 流式输出时通过 `MutationObserver` + 防抖 + 内容 hash 检测，等代码稳定后才注入
- **视口懒加载**：只处理滚动到可视区域的代码块，长对话不卡顿
- **缓存上限**：最多同时保留 10 张渲染图，超出后按「不在视口 + 最早渲染」淘汰
- **多图对比**：页面有 2 张以上图时，右下角出现对比 FAB；支持按类型分组查看
- **灯箱放大**：点击图本身或「放大」按钮进入灯箱，支持滚轮缩放、拖拽平移、键盘操作、鸟瞰图导航、多图切换
- **复制图片**：一键将 SVG 转为 PNG（2 倍分辨率、白底）复制到剪贴板
- **本地缓存**：渲染引擎的 ESM 源码缓存到本地（7 天有效期），刷新页面无需重新下载
- **闲时预加载**：页面空闲时静默加载渲染引擎，首次点击几乎无延迟

### 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)
2. 打开控制面板 → 新建脚本
3. 将 `Tampermonkey/DeepSeek D2+wireloom图渲染.user.js` 全部内容粘贴进去，保存
4. 首次安装时会请求「网络」和「存储」权限，点击允许
5. 打开 [chat.deepseek.com](https://chat.deepseek.com/)，脚本自动启动

### 使用方式

让 DeepSeek 按以下格式输出即可自动渲染。

**D2 示例（架构图）：**

````markdown
```d2
direction: right
客户端 -> 服务器: 请求
服务器 -> 数据库: 查询
数据库 -> 服务器: 结果
服务器 -> 客户端: 响应
```
````

**Wireloom 示例（线框图）：**

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

### 交互说明

**预览卡片：**

- 代码块右上角工具栏出现「隐藏图」按钮，点击可折叠/展开预览
- 悬停预览区右上角 → 出现「⎘ 复制」「⤢ 放大」
- 点击图本身 → 直接打开灯箱

**多图对比：**

- 页面有 2 张以上图时，右下角出现 FAB
- 单类型：显示 `⊞ 对比 N 张 D2 图`
- 多类型：显示 `⊞ 查看 N 张图（D2×2 · Wireloom×1）`
- 点击进入对比视图，顶部有 tab 切换：
  - **全部**：按类型分组显示，每组带彩色标题
  - **D2** / **Wireloom**：仅显示该类型，纯并排对比
- 列数支持 1 / 2 / 3 切换

**灯箱操作：**

| 操作 | 效果 |
|:---|:---|
| **点击图 / 点「⤢ 放大」** | 打开灯箱 |
| **滚轮** | 以光标位置为中心缩放 |
| **拖拽画布** | 按住左键平移 |
| **`+` / `-`** | 以视图中心缩放 |
| **`0`** | 重置为默认倍率 |
| **`F`** | 适应屏幕 |
| **`←` / `→`** | 多图时切换上一张/下一张；单图时平移 |
| **`↑` / `↓`** | 平移 |
| **`ESC`** | 关闭 |
| **工具栏 `‹ 上一张 / 下一张 ›`** | 多图导航（含循环） |
| **工具栏 `⎘ 复制图片`** | 当前图转为 PNG 复制到剪贴板 |
| **鸟瞰图** | 点击跳转、拖拽导航，工具栏可开关 |

### 架构说明

脚本采用分层设计，便于扩展：

```
┌─ Adapter 层（平台适配）──────────────────┐
│  识别代码块 / 提取源码 / 定位工具栏         │
│  新增平台只需注册一个 adapter              │
└────────────────────────────────────────┘
┌─ Renderer 层（渲染引擎）─────────────────┐
│  D2 / Wireloom / 未来 Graphviz...        │
│  新增格式只需注册一个 renderer            │
└────────────────────────────────────────┘
┌─ Core 层（调度与状态）───────────────────┐
│  hash 计算 / 扫描调度 / 缓存淘汰          │
└────────────────────────────────────────┘
┌─ UI 层（展示与交互）─────────────────────┐
│  预览卡片 / 灯箱 / 对比视图 / FAB         │
└────────────────────────────────────────┘
```

**扩展新格式（如 Graphviz）：**

```javascript
// 在 RENDERERS 里加一个条目即可
graphviz: {
    displayName: 'Graphviz',
    color: '#2e7d32',
    urls: ['https://cdn.jsdelivr.net/npm/@hpcc-js/wasm@2/+esm'],
    cacheKey: 'graphviz_esm_src_v2',
    cacheTsKey: 'graphviz_esm_ts_v2',
    getInstance(mod) { /* ... */ },
    async render(engine, source) { /* ... */ },
}
```

**扩展新平台（如 ChatGPT）：**

```javascript
// 在 ADAPTERS 里加一个条目
{
    name: 'chatgpt',
    matches: () => location.hostname === 'chat.openai.com',
    findCodeBlocks(root) { return root.querySelectorAll('...'); },
    getLanguage(block) { /* ... */ },
    getSource(block) { /* ... */ },
    getToolbar(block) { /* ... */ },
    getInsertTarget(block) { /* ... */ },
}
```

### 常见问题

**Q：看不到「隐藏图」按钮？**

1. 确认代码块语言标记是 `d2` 或 `wireloom`
2. 按 F12 查看 Console 是否有 `[DS-Graph]` 报错
3. 检查 Tampermonkey 是否已授予「网络」和「存储」权限

**Q：点击后显示「渲染失败」？**

通常是源码语法问题。让 DeepSeek「按官方语法重新生成」。渲染失败的具体错误会打印在 Console 的 `[DS-Graph]` 日志里。

**Q：图被移除了，滚动回来又出现？**

这是缓存淘汰机制。脚本最多保留 10 张已渲染的图，超出后按「不在视口 + 最早渲染」淘汰。滚回来时会自动重新渲染。

**Q：如何调整缓存上限？**

编辑脚本里的 `const MAX_CACHE = 10;` 这一行。

---

## 二、Wireloom 配套提示词

### 功能说明

一份给 AI 的提示词模板，帮助 AI 生成符合 Wireloom 官方语法的线框图代码，提升一次渲染成功率。

**文件位置：** `Tampermonkey/wireloom 配套提示词.md`

### 使用方式

在 DeepSeek 对话中先发送提示词内容，让 AI 明确 Wireloom 的语法规范，然后再描述你想要的界面草图。

**示例对话：**

```
你：[粘贴 wireloom 配套提示词.md 的内容]
你：帮我画一个电商商品详情页的线框图
AI：[生成符合语法的 wireloom 代码块，脚本自动渲染]
```

配合图渲染脚本使用时，AI 生成的 `wireloom` 代码块会被立即渲染成线框图，形成「描述 → 生成 → 预览 → 调整」的快速迭代循环。

---

## 三、Stylus 用户样式 — DeepSeek 阅读模式

### 功能说明

一份完整的 DeepSeek Chat 配色与阅读增强方案，覆盖聊天气泡、输入框、代码块、引用、滚动条、选中高亮、加载动画等。内置浅色与深色两套基础配色，并额外提供「整理模式」与「心流模式」两套针对长文阅读的优化方案。

**文件位置：** `Stylus/DeepSeek 阅读模式.user.css`

### 安装

1. 从扩展商店安装 [Stylus](https://chrome.google.com/webstore/detail/stylus/clngdbkpkpeebahjckkjfobafhncgmne)（Chrome / Edge）或 [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/styl-us/)
2. 点击 Stylus 图标 → **编写新样式**
3. 「适用网址」填 `https://chat.deepseek.com/*`
4. 粘贴 `Stylus/DeepSeek 阅读模式.user.css` 全部内容，保存

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

## 组合使用建议

三套工具可以独立使用，也可以搭配使用，形成完整的工作流：

| 场景 | 推荐组合 |
|:---|:---|
| **仅美化界面** | Stylus 阅读模式 |
| **仅渲染图表** | D2 + Wireloom 图渲染脚本 |
| **设计草图协作** | 图渲染脚本 + Wireloom 提示词 |
| **全功能工作流** | 三套全部启用 |

**典型工作流：**

1. 用 Stylus 阅读模式把界面调成「整理模式」，长时间对话不刺眼
2. 用 Wireloom 提示词让 AI 生成界面草图
3. 脚本自动渲染成 SVG 线框图，多方案时用对比视图并排查看
4. 点击放大看细节，复制 PNG 贴到设计文档

---

## 兼容性

| 项目 | 要求 |
|------|------|
| 浏览器 | Chrome 76+ / Firefox 103+ / Edge 79+ / Safari 13+ |
| 油猴脚本管理器 | Tampermonkey、Violentmonkey、Greasemonkey |
| Stylus | 任意版本（`@when` 模式需支持条件块的前处理器） |
| D2 引擎 | v0.1.33（通过 jsDelivr / esm.sh CDN 加载） |
| Wireloom 引擎 | v0.7.0（通过 jsDelivr / esm.sh CDN 加载） |
| DeepSeek Chat | chat.deepseek.com 最新界面 |

---

## 许可证

- 油猴脚本（`Tampermonkey/DeepSeek D2+wireloom图渲染.user.js`）：MIT
- Wireloom 提示词（`Tampermonkey/wireloom 配套提示词.md`）：MIT
- Stylus 主题样式（`Stylus/DeepSeek 阅读模式.user.css`）：MIT
- [D2 引擎](https://github.com/terrastruct/d2)（Terrastruct 开发）：MPL-2.0
- [Wireloom 引擎](https://github.com/StardockCorp/Wireloom)（Stardock 开发）：MIT
