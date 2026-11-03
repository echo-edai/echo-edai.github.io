# echo / lab 维护说明

网站：[echo-edai.github.io](https://echo-edai.github.io/)。仓库：`echo-edai/echo-edai.github.io`。

首页、文章与四份交互教材共用门户导航。教材共 96 章、445 节；内容规模不代表完成了上游硬件的完整验证。设计依据见 [UI-UX.md](UI-UX.md)。

## 项目结构

```text
assets/    门户脚本、样式与图标
content/   自编文章正文
data/      卡片、动态与文章元信息
docs/      使用说明、设计规范和验证结论
projects/  导入教材，保留原路径及许可
ref/       只读参考资料
scripts/   构建、目录提取和开发入口
work/      环境、缓存、预览与截图，不入库
```

根目录仅保留入口、配置与 `AGENTS.md`。第三方教材内部的文档和原始代码保持现有路径，避免破坏引用与来源校验。

## 环境与命令

需要 uv、Node.js 和 npm。Python 环境由 uv 管理，格式化工具固定在 `uv.lock` 和 `package.json` 中。

```sh
./scripts/dev.sh setup
./scripts/dev.sh format
./scripts/dev.sh check
./scripts/dev.sh build
./scripts/dev.sh serve 4182
```

访问 `http://127.0.0.1:4182/`。修改后重新构建并刷新。

环境位于 `work/.venv/`，缓存位于 `work/uv-cache/` 与 `work/npm-cache/`，构建结果位于 `work/site/`，截图写入 `work/screenshots/`。开发入口会恢复 `ref/` 的只读属性。Prettier 处理本站 HTML/CSS/JS/JSON/Markdown，Ruff 处理 Python；两者遵循 `.editorconfig`，跳过导入教材、参考资料与运行产物。

## 添加文章

1. 在 `content/` 增加 HTML 正文，例如 `my-note.html`。
2. 在 `data/site.json` 的 `projects` 数组复制文章条目，设置 `id: my-note`、`href: notes/my-note/`、标题、简介、日期与目录。
3. `sections` 使用 `[小节id, 目录标题]`，对应正文中的 `<h2 id="...">`。
4. 在 `updates` 数组开头增加动态，指向同一篇文章。
5. 格式化、检查、构建后提交。搜索支持标题、简介与标签，关键词和分类会保存在页面地址中。

## 接入网页

网页及资源放入 `projects/<slug>/`，入口为 `index.html`。在 `projects` 数组登记卡片，使用相对资源路径。四份教材会在构建时注入统一导航，原有源码浏览、实验及学习进度继续由教材自身实现。

```json
{
  "id": "cache-playground",
  "shortTitle": "缓存实验",
  "category": "learning",
  "categoryLabel": "交互学习",
  "format": "机制实验",
  "featured": false,
  "title": "缓存交互实验",
  "description": "填写真实页面简介。",
  "tags": ["Cache", "Interactive"],
  "href": "projects/cache-playground/"
}
```

这是接入格式示例。添加新教材类型时，在 `scripts/catalog.cjs` 增加其课程数据读取规则。`shortTitle` 用于侧栏，`image`、`imageAlt` 用于封面，`chapters`、`lessons` 用于内容统计；更新教材时同步核对。

## 维护入口

- `assets/theme.css`：全站语义令牌、排版、控件尺寸和响应式优化。
- `assets/portal.css`：门户框架、侧栏与文章布局。
- `assets/reader.css`：教材展示层适配。
- `assets/app.js`：侧栏折叠、搜索、分类与动效。
- `assets/reader.js`：教材加载反馈、章节定位与索引跟随。
- `scripts/build.py`：页面外壳、目录生成、链接验证和资源内容版本。

手机侧栏支持遮罩和 Escape，打开时锁定焦点。顶部搜索按 `/` 聚焦，Escape 清空。目录支持收拢、展开和章节深链接。动效可以暂停，并遵循系统减少动态效果设置。

## 导入源版本

NaplesPU 源版本在父工作区 `web/`，同步入口为 `scripts/integrate_naplespu.py`。其他三份教材源版本分别在 `web/coralnpu/`、`web/gemmini/`、`web/opentpu/`，各自工具目录内保留同步入口。这些入口只同步本地内容；导入的源码、图像、许可证与验证资料保持来源边界。

## 发布

```sh
./scripts/dev.sh check
./scripts/dev.sh build
git add assets content data docs scripts .github AGENTS.md
git commit -m "Update the learning portal"
git push origin main
gh run list --limit 3
```

GitHub Actions 通过 uv 构建，仅上传 `work/site/`。`ref/`、环境、缓存和父工作区不进入发布包。首次修改配置时也需提交配置与锁文件。

资源地址带内容版本，避免混用新旧主题与脚本。本站使用域名根路径；迁移到项目子路径时需同步调整基础路径、canonical 和 sitemap。
