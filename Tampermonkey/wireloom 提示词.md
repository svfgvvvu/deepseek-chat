**Wireloom 输出规范**

完整语法：[https://raw.githubusercontent.com/StardockCorp/Wireloom/refs/heads/main/AGENTS.md](https://raw.githubusercontent.com/StardockCorp/Wireloom/refs/heads/main/AGENTS.md)

> A Markdown extension for UI wireframes. Describe a screen in a few indented lines. Get a clean SVG mockup that renders anywhere Markdown does — chat, docs, PR comments, issues.

- 代码块：` ```wireloom ` 开头，` ``` ` 结尾；块内只写节点。
- 首行：`window "标题":`，缩进 0；全块仅 1 个 `window`。
- 第 2 行起缩进 ≥2；每级 +2，同层同缩进。
- 缩进单位由第一个缩进行锁定，取 2 或 4 空格；全文统一。
- 行首使用 Tab 视为解析错误。
- 空行和 `#` 开头的行是注释，不影响嵌套。
- 容器行尾加冒号；叶子行尾无冒号。只有 `window` / `section` / `slot` / `menu` 带标题字符串。
- 叶子格式：`节点名 "标签" 属性="值" 标志`。
- 只用标准节点名；不确定时优先用 `text`、`button`、`status`、`spacer`。
- 标准容器：`window`、`header`、`footer`、`panel`、`section`、`tabs`、`row`、`col`、`list`、`slot`、`grid`、`resourcebar`、`stats`、`navbar`、`tabbar`、`sheet`、`segmented`、`tree`、`menubar`、`menu`、`breadcrumb`、`leading`、`trailing`。
- 标准叶子：`text`、`button`、`backbutton`、`input`、`combo`、`slider`、`kv`、`image`、`icon`、`divider`、`cell`、`resource`、`stat`、`progress`、`chart`、`spacer`、`tab`、`tabitem`、`segment`、`checkbox`、`radio`、`toggle`、`node`、`menuitem`、`separator`、`crumb`、`chip`、`avatar`、`spinner`、`status`、`item`。
- `header` 只能直接出现在 `window` 内部。
- `navbar` 与 `header` 二选一；`navbar` 只能直接出现在 `window` 内部。
- `tabbar` 与 `footer` 二选一；`tabbar` 只能直接出现在 `window` 内部。
- `sheet` 只能直接出现在 `window` 内部，每窗口最多一个。
- `segmented` 不能直接出现在 `window` 内部。
- `grid` 必须写 `cols=N rows=M`。
- `resourcebar` 只放 `resource`；`stats` 只放 `stat`。
- `tabs` 只放 `tab`；`tabbar` 只放 `tabitem`。
- `row` 只放行内合法子节点；`spacer` 只能直接出现在 `row` 内部。
- `col` 可选像素宽度或 `fill`；不写默认 `fill`。
- `list` 只放 `item` 或 `slot`；`item` 必须带字符串，如 `item "Home"`；`slot` 必须带标题字符串，如 `slot "Billing":`。
- `menu` 内用 `menuitem`；`separator` 用于 `menu` 内分隔。
- `breadcrumb` 只放 `crumb`；最后一个 crumb 自动加粗。
- `tree` 只放 `node`。
- `leading:` / `trailing:` 只能出现在 `navbar` 内部，至少写一个，每个最多一次。
- 同一 `row` 内放单一类型：按钮或文本，二选一；文字放同级 `row` 外。
- `status` 必须写 `kind=success|info|warning|error`（没有 `danger`，用 `error` 代替）。
- `sheet` 的 `position=bottom` 默认底部 sheet，`position=center` 居中模态；`title="…"` 可选。
- `header large:` 为裸标志，强制其 `text` 子节点加粗放大；空 `header large:` 合法。
- `backbutton "Parent"` 合法位置同 `button`；支持 `disabled`。
- `spacer` 是叶子，用于 `row` 内吃掉剩余空间；优先级高于 `justify`。
- `row justify=` 取值 `start`（默认）、`between`、`around`、`end`；没有 `center`。
- 优先级：`fill` col > `spacer` > `justify=` > `align=`。
- 属性适用限制：
  - `weight=light|regular|semibold|bold`、`size=small|regular|large`、`muted`、`bold`、`italic` 仅适用于 `text` 和 `kv` 的值，不能用于 `button`、`col`、`panel` 等。
  - `align=left|center|right` 仅适用于 `row`；`text`、`col`、`panel` 均不支持；子节点含 `fill` col 时忽略。
  - `justify=` 仅适用于 `row`，值只有 `start`、`between`、`around`、`end`，没有 `center`。
  - `col` 和 `panel` 不支持 `align`、`max-width` 等布局属性。
  - `button` 不支持任何文本样式属性（如 `weight`、`size`）。
  - `accent=research|military|industry|wealth|approval|warning|danger|success` 适用于 `slot`、`section`、`cell`、`button`、`icon`、`text`、`kv` value、`stat` value。
  - `state=locked|available|active|purchased|maxed|growing|ripe|withering|cashed` 仅适用于 `slot` 和 `cell`。
  - `badge=` 适用于 `tab`、`section`、`button`、`tabitem`。
  - `icon=` 适用于 `button`、`kv`、`stat`、`node`、`crumb`、`chip`、`tabitem`、`resource`、`image`。
  - `kind=bar|line|pie` 用于 `chart`；`kind=success|info|warning|error` 用于 `status`。
  - `position=bottom|center` 用于 `sheet`；`position=left|right|top|bottom` 用于 `annotation`，必填。
  - `row=N col=M` 仅适用于 `cell`（1-indexed 显式定位）。
  - `range=N-M` + `value=K` 仅适用于 `slider`。
  - `value=` / `max=` / `label=` 用于 `progress`。
  - `name=` / `label=` 用于 `image`。
  - `placeholder=` / `type=` / `disabled` 用于 `input`。
  - `value=` / `options=` / `disabled` 用于 `combo`。
  - `shortcut="…"` / `disabled` 用于 `menuitem`。
  - `checked` / `disabled` / `label-right` 用于 `checkbox`。
  - `selected` / `disabled` / `label-right` / `group=""` 用于 `radio`。
  - `on` / `off` / `disabled` / `label-right` 用于 `toggle`。
  - `selected` / `disabled` 用于 `segment` 和 `tabitem`。
  - `collapsed` / `selected` 用于 `node`。
  - `closable` / `selected` 用于 `chip`。
  - `size=small|medium|large`（默认 `medium`）/ `accent=` 用于 `avatar`。
  - `kv` 必须写标签 + 值两个字符串。
- `id="…"` 可用于任何节点，供 `annotation` 的 `target=` 引用；id 不校验唯一性，重复时匹配第一个。
- `annotation` 位于顶层，缩进 0，作为 `window` 的兄弟节点；格式 `annotation "body" target="id" position=left|right|top|bottom`；`body` 内换行用 `\n`；`target=` 无匹配时静默丢弃。
- `segment` 在 `segmented` 内恰好一个可带 `selected`；多个 → 解析错误；零个 → `console.warn` 但仍渲染。
- 标签字符串后不要跟括号或额外说明，如 `button "主题" (长按展开)` 会因 `(` 报错。
- 字符串值用双引号；数字值可带单位后缀（`340`、`50%`、`1fr`）；范围值 `range=0-100` 仅用于 `slider`。
- 裸标志：`primary`、`disabled`、`active`、`bold`、`italic`、`muted`、`fill`、`large`、`chevron`、`selected`、`checked`、`collapsed`、`closable`、`on`、`off`、`label-right`。
  - `primary` 仅适用于 `button`。
  - `large` 仅适用于 `header`。
  - `active` 适用于 `tab` 和 `slot`。
  - `chevron` 适用于 `slot` 和 `item`。
- 命名图标库：`credits`、`research`、`military`、`industry`、`influence`、`approval`、`faith`、`authority`、`computation`、`tech`、`policy`、`ship`、`planet`、`leader`、`gear`、`warning`、`lock`、`check`、`star`、`plus`、`minus`；未知名称回退为首字母方框。
- 验证：`window` 仅 1 个；第 2 行缩进 ≥2；容器有冒号、叶子无冒号；`status` 有 `kind`；`row` 不混排；没有给不支持的节点添加属性；标签后无多余字符；`list` 只放 `item` 或 `slot`；`menu` 内用 `menuitem`；`segmented` 内最多 1 个 `selected`；`annotation` 在顶层缩进 0；缩进单位统一，无 Tab；`grid` 有 `cols=N rows=M`。

示例：

````markdown
```wireloom
window "示例":
  header:
    row:
      button "返回"
      spacer
      button "编辑"
    text "标题"
  section "内容":
    col:
      text "正文"
      status "成功" kind=success
```
````
