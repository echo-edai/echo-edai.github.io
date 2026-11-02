# echo / lab

已接入 [NaplesPU 交互源码教材](projects/naplespu/index.html)：25章119节、44个实现概念、四条共25步动手路线、8个机制/状态实验，以及核心源码与可运行RTL练习。源版本在 `../web/`；运行 `python3 scripts/integrate_naplespu.py` 同步，再运行本站构建。公开副本保留54,961个文件索引、340份内嵌源码，其余文件按需读取固定上游提交。

已接入 [Coral NPU 交互源码手册](projects/coral-npu/index.html)：21章95节、8种机制实验、1,408份源码正文与可运行RTL练习。源版本在 `../web/coralnpu/`；运行 `python3 ../web/coralnpu/tools/publish_to_portal.py` 同步，再运行本站构建。同步只集成本地目录，不执行远程发布。

已接入 [Gemmini 交互架构教材](projects/gemmini/index.html)：22章90节、40概念、源码全文与微架构实验。源版本保留在 `../web/gemmini/`；运行其 `tools/publish.py` 同步静态文件与门户元数据，再运行本站构建。该同步不会执行 Git push 或远程部署。

个人学习与研究门户，发布地址：**https://echo-edai.github.io/**。

固定侧边栏、置顶工具栏、深色与荧光绿视觉、可暂停的计算网络动效、分类与关键词筛选、响应式布局、独立阅读页与自动发布。没有框架、第三方运行依赖、外部字体或访问统计。

## 门户导航

- 桌面侧栏包含空间导航、四个交互教材及阅读与研究入口，可以折叠为图标栏；折叠偏好仅保存在当前浏览器。
- 手机侧栏为抽屉，支持关闭按钮、遮罩和 Escape，打开时背景不可操作，键盘焦点保留在抽屉内。
- 顶部搜索匹配标题、简介与标签；按 `/` 聚焦，按 Escape 清空。从阅读页提交搜索会回到首页显示结果。
- 交互学习、学习笔记、研究手记分别筛选。首页、笔记和四份教材共用门户侧栏与顶部栏；教材的学习索引和 96 章课程并入侧栏，各项目目录、章节列表均可收拢或展开。
- 点击章节后支持锚点定位、刷新恢复及自动展开正文。文章右侧目录也有独立收拢按钮。
- 教材内搜索和学习笔记位于统一工具栏，原有源码浏览器、实验与学习进度继续工作。
- 侧栏目录、无脚本入口及内容统计由构建脚本读取 `data/site.json` 生成，新增内容后重新构建即可同步。

四个交互教材共 96 章、445 节：NaplesPU 25/119、openTPU 28/141、Coral NPU 21/95、Gemmini 22/90。此处是教材内容规模，不代表对上游硬件进行过完整验证。

## 本地预览

需要 Python 3.10+ 和 Node.js，无需安装 Python 或 npm 包。Node 仅用于读取网站自编的课程数据并生成统一索引。

```sh
cd public-web
python3 scripts/build.py
python3 -m http.server 4173 --directory _site
```

浏览器打开 http://localhost:4173 。修改后重新运行构建命令并刷新。

## 添加学习笔记或研究进展

1. 在 `content/` 写一份 HTML 正文片段，如 `my-note.html`。直接沿用已有正文结构，用 `<h2 id="question">` 标识小节。
2. 在 `data/site.json` 的 `projects` 数组增加条目。复制已有笔记，修改 `id`、标题、描述、标签、日期与目录；`href` 填 `notes/my-note/`，`id` 填 `my-note`。`category` 可用 `learning` 或 `research`，`featured` 设为 `false`。
3. 在 `updates` 数组开头添加一条动态，`href` 指向新页面。
4. 运行 `python3 scripts/build.py`。脚本生成阅读页、404、sitemap，并检查所有本地页面链接与锚点。
5. 提交并推送。Actions 会自动构建并发布：

```sh
git add content data
git commit -m "Add a new learning note"
git push origin main
gh run list --limit 3
```

`readingTime` 是大致阅读时间；`sections` 是 `[小节id, 目录标题]` 的数组。首页及侧栏内容排序遵循数组顺序；`projects/` 下的页面自动归为交互学习，其他学习条目归为笔记，`category: research` 归为研究手记。

## 接入其他独立 Web 学习页面

把页面及其资源放在 `projects/<slug>/` 中，使用相对资源路径，入口为 `index.html`。在 `projects` 数组复制一条卡片，`href` 改为 `projects/<slug>/`。独立页面无需填写阅读页专用的 `sections`、`lead`、`readingTime`、`eyebrow` 字段。外部网站也可以直接填写 HTTPS 地址。

例如：

```json
{
  "id": "cache-playground",
  "category": "learning",
  "categoryLabel": "学习页面",
  "format": "交互实验",
  "featured": false,
  "title": "缓存交互实验",
  "description": "在这里写你的真实页面简介。",
  "tags": ["Cache", "Interactive"],
  "href": "projects/cache-playground/"
}
```

这是接入格式示例；当前没有声称已经完成此实验。页面目录加入后再构建、提交 `projects/` 和 `data/`。可将外部独立仓库的 GitHub Pages 地址直接作为 `href`，省去复制。

可选的 `shortTitle` 用于侧栏简写，`image` 和 `imageAlt` 用于封面，`chapters` 和 `lessons` 用于课程规模。封面必须是现有本地文件。修改课程内容后应同步这些数字。

## 个性化

- 首页标题、个人介绍、兴趣与 GitHub 链接：`index.html`。
- 侧栏、顶部栏、统计、文章外壳与页脚：`scripts/build.py`。`index.html` 中的 `PORTAL_*` 占位注释在构建时替换。
- 课程目录提取：`scripts/catalog.cjs`。目前支持 NaplesPU、openTPU、Gemmini 的课程 JS 与 Coral NPU 的课程 JSON；构建时核对章数与门户元数据。
- 卡片、动态和文章元信息：`data/site.json`。
- 基础色彩与文章组件：`assets/style.css`；门户框架、侧栏、顶部栏与移动断点：`assets/portal.css`。
- 教材统一主题及布局：`assets/reader.css`；章节定位、教材搜索与笔记按钮：`assets/reader.js`。
- 动效、搜索与筛选：`assets/app.js`。访问者可暂停动效；系统“减少动态效果”开启时默认静止。

## 发布方式与范围

仓库：`echo-edai/echo-edai.github.io`；默认分支：`main`；Pages 发布源：GitHub Actions。工作流位于 `.github/workflows/pages.yml`。

构建只复制 `public-web` 仓库内的 `assets/`、`data/`、可选 `projects/` 和首页，并将 `content/` 包装成阅读页。只上传生成的 `_site/`；父级工作区、完整上游依赖树和本地工具环境不会被收录。各学习站明确导出的源码正文、许可证、练习包和验证资料会随站点发布。

本站是域名根站点（用户站点），文章外壳使用根路径 `/assets/` 和 `/#explore`。若迁移到 `/repo/` 项目站点，需要同步调整基础路径、canonical 与 sitemap。

发布文档：[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

构建会把统一导航注入四份教材的生成页面，将原课程目录并入门户索引，并为浅色教材生成对应的深色样式。`projects/` 中的导入源文件继续作为内容维护入口；编译后的页面与样式位于 `_site/`。发布资源地址带内容版本，浏览器会同步更新主题与脚本。

首批技术笔记依据本地收录的公开项目资料编写，并链接上游。计划、源码阅读与自己完成的实验分别标明；站点未发布未经执行的性能结果。


## openTPU 交互源码手册

入口：`projects/opentpu/`。28章、141小节，含完整文件索引、Verilator实例/端口与7个微架构实验。公开副本来自父级工作区 `web/opentpu/`，可用 `python3 ../web/opentpu/tools/integrate.py` 同步；然后在本仓库运行 `python3 scripts/build.py`。该流程保留其他项目，不进行远程推送。

网页明确区分 openTPU 已实现结构与 NoC/缓存目录扩展教学。原始上游许可位于项目的 `UPSTREAM-LICENSE`，教学RTL许可在 `rtl/LICENSE`。完整原始 AST、工具缓存和个人浏览器记录不公开。
