## 实施计划

### 问题 1：shiki-code-copy 的 peer 警告

在 `pnpm-workspace.yaml` 增加 `peerDependencyRules.allowedVersions`，声明 `shiki` 允许 4.x，抑制该警告。

```yaml
onlyBuiltDependencies:
  - sharp
  - swup
  - workerd
peerDependencyRules:
  allowedVersions:
    shiki: "4"
```

### 问题 2：Astro 7 markdown 配置弃用警告

将 `astro.config.ts` 里 `markdown` 下的 `remarkPlugins`/`rehypePlugins`/`remarkRehype`/`smartypants` 迁移到 `@astrojs/markdown-remark` 的 `unified({...})` processor，然后赋给 `markdown.processor`。`shikiConfig` 保留在 `markdown` 顶层（schema 确认它不进 processor）。

**改动点：**
1. 顶部导入：从 `@astrojs/markdown-remark` 导入 `unified`（替换现有的 `rehypeHeadingIds as ids` 导入行，合并到同一行）
2. `markdown` 配置块重构：
   - 新增 `processor: unified({ remarkPlugins, rehypePlugins, remarkRehype, smartypants })`
   - `shikiConfig` 留在 `markdown` 顶层
   - 删除顶层的 `remarkPlugins`/`rehypePlugins`/`remarkRehype`/`smartypants`（它们移入 unified 调用）

**目标结构（示意）：**
```ts
markdown: {
  processor: unified({
    remarkPlugins: [ /* 原 markdown.remarkPlugins 内容 */ ],
    remarkRehype: { /* 原 markdown.remarkRehype 内容 */ },
    rehypePlugins: [ /* 原 markdown.rehypePlugins 内容 */ ],
    smartypants: false,
  }),
  shikiConfig: {
    themes: { light: "github-light", dark: "dark-plus" },
    transformers: [copy({ duration: 1500 })]
  }
}
```

### 验证
迁移后重启 dev server，确认：
- 不再出现 `markdown.remarkPlugins...deprecated` 警告
- 不再出现 `markdown.smartypants is deprecated` 警告
- `pnpm install` 不再出现 shiki peer 警告
- 页面渲染正常（含代码块 copy 按钮、脚注、表格、公式、标题锚点等插件功能）

### 改动文件清单
| 文件 | 改动 |
|------|------|
| `pnpm-workspace.yaml` | 增加 `peerDependencyRules.allowedVersions` |
| `astro.config.ts` | markdown 配置迁移到 `unified()` processor |