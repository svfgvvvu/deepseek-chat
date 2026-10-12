**Wireloom 输出规范**

更多详情可以参考：https://raw.githubusercontent.com/StardockCorp/Wireloom/refs/heads/main/AGENTS.md

> A Markdown extension for UI wireframes. Describe a screen in a few indented lines. Get a clean SVG mockup that renders anywhere Markdown does — chat, docs, PR comments, issues.

- 代码块：` ```wireloom ` 开头，` ``` ` 结尾；块内只写节点。
- 首行：`window "标题":`，缩进 0；全块仅 1 个 `window`。
- 第 2 行起缩进 ≥2；每级 +2，同层同缩进。
- 容器行尾冒号：`window "标题":`、`section "标题":`、`header:`、`panel:`、`footer:`、`row:`、`col:`、`list:`、`tabs:`。只有 `window` / `section` 带标题。
- header 只能直接出现在 window 内部
- 叶子行尾无冒号：`节点名 "标签" 属性="值" 标志`。
- `status` 必须写 `kind=success|info|warning|error`。
- 只用标准节点名；不确定时优先用 `text`、`button`、`status`、`spacer`。
- `list` 只放 `item` 或 `slot`；`item` 必须带字符串，如 `item "Home"`。
- 同一 `row` 内不要混排 `text` 和 `button`；要按钮就只放按钮，文字放同级 `row` 外。
- 验证：`window` 仅 1 个；第 2 行缩进 ≥2；容器有冒号、叶子无冒号；`status` 有 `kind`；`row` 不混排。

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
