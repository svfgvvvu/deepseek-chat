**Wireloom 输出规范**

[Wireloom](https://raw.githubusercontent.com/StardockCorp/Wireloom/refs/heads/main/AGENTS.md)

> A Markdown extension for UI wireframes. Describe a screen in a few indented lines. Get a clean SVG mockup that renders anywhere Markdown does — chat, docs, PR comments, issues.
这版删解释句，只留规则映射。

输出 ` ```wireloom ` 块。首行 `window "标题":`，无缩进，全块唯一。缩进 2 空格。容器尾 `:`，叶子尾结束。叶子 `名 "标签" 属性="值" 标志`，标签后直接结束。字符串双引号；数字可带单位。空行/`#` 注释。`id="x"` 任意节点，供 `annotation target=`，重复取首个。

**容器**：window header footer panel section tabs row col list slot grid resourcebar stats navbar tabbar sheet segmented tree menubar menu breadcrumb leading trailing  
**叶子**：text button backbutton input combo slider kv image icon divider cell resource stat progress chart spacer tab tabitem segment checkbox radio toggle node menuitem separator crumb chip avatar spinner status item

**嵌套**
- window 顶层唯一；互斥 header|navbar、tabbar|footer；直属 sheet≤1，`position=bottom|center`，`title` 可选
- navbar: leading:/trailing: 各≤1 共≥1
- tabs: tab｜tabbar: tabitem｜resourcebar: resource｜stats: stat
- list: item "…" | slot "…":｜menu: menuitem|separator｜breadcrumb: crumb，末项加粗｜tree: node
- segmented: segment，非 window 直属，selected≤1；多个报错，零个警告
- grid: cols=N rows=M
- row: 按钮或文本二选一；spacer 仅 row
- col: 像素|fill，默认 fill；无 align/max-width
- header large: 可空，text 加粗放大
- backbutton 同 button + disabled
- 优先级：fill col > spacer > justify > align

**属性**
- text/kv值: weight=light|regular|semibold|bold size=small|regular|large muted bold italic
- row: align=left|center|right justify=start|between|around|end；fill col 时忽略 align
- status: kind=success|info|warning|error
- chart: kind=bar|line|pie
- sheet: position=bottom|center
- annotation(顶层): position=left|right|top|bottom
- cell: row=N col=M
- slider: range=N-M value=K
- progress: value= max= label=
- image: name= label=
- input: placeholder= type= disabled
- combo: value= options= disabled
- menuitem: shortcut= disabled
- checkbox: checked disabled label-right
- radio: selected disabled label-right group=
- toggle: on off disabled label-right
- segment/tabitem: selected disabled
- node: collapsed selected
- chip: closable selected
- avatar: size=small|medium|large accent=
- button: primary
- icon=: button kv stat node crumb chip tabitem resource image
- badge=: tab section button tabitem
- accent=: slot section cell button icon text kv值 stat值
- state=: slot cell
- kv: 标签+值两个字符串

**裸标志**：primary→button；large→header；active→tab/slot；chevron→slot/item；disabled bold italic muted fill selected checked collapsed closable on off label-right 按节点。  
**图标**：credits research military industry influence approval faith authority computation tech policy ship planet leader gear warning lock check star plus minus；未知回退首字母方框。

**annotation**：顶层缩进 0，与 window 同级。`annotation "body" target="id" position=left|right|top|bottom`；body 换行 `\n`；target 无匹配静默丢弃。

**校验**：window 唯一 · 首行无缩进 · 2 空格 · 容器尾 `:` · status 有 kind · row 单类型 · segmented selected≤1 · annotation 顶层 · grid 有 cols/rows。  
**盲区**：Tab 解析错误；justify 无 center；status 无 danger，用 error。

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
