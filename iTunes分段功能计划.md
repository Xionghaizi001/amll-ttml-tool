# 添加 iTunes 分段 (songPart) 功能

## Context

当前 AMLL TTML Tool 的解析器和写入器**完全忽略** `<div itunes:songPart="...">` 属性。解析器 (`ttml-parser.ts:738`) 直接用 `querySelectorAll("body p[begin][end]")` 抓取所有 `<p>` 元素，跳过了 `<div>` 层级的分段信息。写入器 (`ttml-writer.ts:36-51`) 按空词行拆分 `<div>`，也不写 `itunes:songPart`。

目标：让用户能在编辑模式下为选中的歌词行设置 iTunes 分段类型（Verse, Chorus, PreChorus 等），并在解析/导出时正确保留该信息。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/types/ttml.ts` | 数据模型增加 `songPart` 字段 |
| `src/modules/project/logic/ttml-parser.ts` | 解析 `itunes:songPart` |
| `src/modules/project/logic/ttml-writer.ts` | 导出时写 `itunes:songPart` |
| `src/components/RibbonBar/edit-mode.tsx` | 工具栏添加"分段"区域 |
| `locales/zh-CN/translation.json` | 中文翻译 |
| `locales/en-US/translation.json` | 英文翻译 |

## 步骤

### 1. 数据模型 — `src/types/ttml.ts`

在 `LyricLine` 接口中添加可选字段：

```typescript
songPart?: string; // "Verse" | "PreChorus" | "Chorus" | "Bridge" | "Outro" | "Intro" | 自定义
```

在 `newLyricLine()` 中不设该字段（默认 `undefined`，表示无分段）。

### 2. 解析器 — `src/modules/project/logic/ttml-parser.ts`

当前代码（第 738 行）：

```typescript
for (const lineEl of ttmlDoc.querySelectorAll("body p[begin][end]")) {
    parseLineElement(lineEl, false, false, null, null);
}
```

改为按 `<div>` 遍历，读取 `itunes:songPart`：

```typescript
for (const divEl of ttmlDoc.querySelectorAll("body div")) {
    const songPart = divEl.getAttribute("itunes:songPart") || undefined;
    for (const lineEl of divEl.querySelectorAll(":scope > p[begin][end]")) {
        parseLineElement(lineEl, false, false, null, null);
        // 将 songPart 赋给刚推入 lyricLines 的行
        if (songPart) {
            const lastLine = lyricLines[lyricLines.length - 1];
            if (lastLine) lastLine.songPart = songPart;
        }
    }
}
```

需要注意：如果存在不在 `<div>` 内的 `<p>` 元素（兼容旧格式），保持 fallback。

### 3. 写入器 — `src/modules/project/logic/ttml-writer.ts`

当前分组逻辑（第 36-51 行）按空词行分 `<div>`。改为：

- 在现有分组基础上，**再按 `songPart` 值拆分**：连续且 `songPart` 相同的行归入同一 `<div>`，`songPart` 变化时切新 `<div>`
- 创建 `<div>` 时（第 297 行附近），如果该组有 `songPart`，写入属性：

```typescript
if (songPart) {
    paramDiv.setAttribute("itunes:songPart", songPart);
}
```

### 4. 工具栏 UI — `src/components/RibbonBar/edit-mode.tsx`

在"行属性"(`lineProperties`) RibbonSection 后面增加一个新的 RibbonSection：

```tsx
<RibbonSection label={t("ribbonBar.editMode.segment", "分段")}>
    <SegmentField />
</RibbonSection>
```

`SegmentField` 组件：

- 读取当前选中行的 `songPart` 值
- 使用 Radix UI 的 `Select`（下拉菜单）展示选项：
  - **无**（清除分段）
  - Intro
  - Verse
  - PreChorus
  - Chorus
  - Bridge
  - Outro
- 选择后，通过 `useSetImmerAtom(lyricLinesAtom)` 修改所有选中行的 `songPart`
- 如果选中多行且 `songPart` 不一致，显示空/混合状态

实现参考现有 `CheckboxField` 和 `EditField` 的模式（读取 `selectedLinesAtom` → 找到对应行 → 修改 draft）。

### 5. i18n 翻译

**zh-CN:**

```json
"ribbonBar.editMode.segment": "分段",
"ribbonBar.editMode.segmentNone": "无",
"ribbonBar.editMode.segmentIntro": "前奏",
"ribbonBar.editMode.segmentVerse": "主歌",
"ribbonBar.editMode.segmentPreChorus": "预副歌",
"ribbonBar.editMode.segmentChorus": "副歌",
"ribbonBar.editMode.segmentBridge": "桥段",
"ribbonBar.editMode.segmentOutro": "尾奏"
```

**en-US:** 使用英文原名（Intro, Verse, PreChorus, Chorus, Bridge, Outro）。

## 验证

1. 打开 `周杰伦 - 七月的极光.ttml`，确认解析后各行携带正确的 `songPart` 值
2. 在工具栏选中行，切换分段下拉，确认值变更
3. 导出 TTML，用文本查看 `<div itunes:songPart="...">` 属性是否正确
4. 导出后重新导入，确认分段信息无丢失（round-trip 测试）
5. 打开不含分段的旧 TTML 文件，确认兼容（无报错，songPart 为 undefined）
