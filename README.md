# echo / lab

已接入 [Coral NPU 交互源码手册](projects/coral-npu/index.html)：21章95节、8种机制实验、1,408份源码正文与可运行RTL练习。源版本在 `../web/coralnpu/`；运行 `python3 ../web/coralnpu/tools/publish_to_portal.py` 同步，再运行本站构建。同步只集成本地目录，不执行远程发布。

已接入 [Gemmini 交互架构教材](projects/gemmini/index.html)：22章90节、40概念、源码全文与微架构实验。源版本保留在 `../web/gemmini/`；运行其 `tools/publish.py` 同步静态文件与门户元数据，再运行本站构建。该同步不会执行 Git push 或远程部署。

个人学习与研究门户，发布地址：**https://echo-edai.github.io/**。

深色与荧光绿的简洁视觉、可暂停的计算网络动效、分类和全文关键词筛选、响应式布局、独立阅读页与自动发布。没有框架、第三方运行依赖、外部字体或访问统计。

## 本地预览

需要 Python 3.10+，无需安装 Python 包。

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

`readingTime` 是大致阅读时间；`sections` 是 `[小节id, 目录标题]` 的数组。首页内容排序遵循数组顺序，第一项可设 `featured: true`。首页搜索匹配标题、简介和标签。

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

## 个性化

- 首页标题、个人介绍、兴趣与 GitHub 链接：`index.html`。
- 导航条、文章外壳与页脚：`scripts/build.py`。
- 卡片、动态和文章元信息：`data/site.json`。
- 色彩、间距和移动布局：`assets/style.css` 顶部变量与媒体查询。
- 动效、搜索与筛选：`assets/app.js`。访问者可暂停动效；系统“减少动态效果”开启时默认静止。

## 发布方式与范围

仓库：`echo-edai/echo-edai.github.io`；默认分支：`main`；Pages 发布源：GitHub Actions。工作流位于 `.github/workflows/pages.yml`。

构建只复制 `public-web` 仓库内的 `assets/`、`data/`、可选 `projects/` 和首页，并将 `content/` 包装成阅读页。只上传生成的 `_site/`；父级工作区、上游源码、离线资料和工具不会被收录。

本站是域名根站点（用户站点），文章外壳使用根路径 `/assets/` 和 `/#explore`。若迁移到 `/repo/` 项目站点，需要同步调整基础路径、canonical 与 sitemap。

发布文档：[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

首批技术笔记依据本地收录的公开项目资料编写，并链接上游。计划、源码阅读与自己完成的实验分别标明；站点未发布未经执行的性能结果。


## openTPU 交互源码手册

入口：`projects/opentpu/`。28章、141小节，含完整文件索引、Verilator实例/端口与7个微架构实验。公开副本来自父级工作区 `web/opentpu/`，可用 `python3 ../web/opentpu/tools/integrate.py` 同步；然后在本仓库运行 `python3 scripts/build.py`。该流程保留其他项目，不进行远程推送。

网页明确区分 openTPU 已实现结构与 NoC/缓存目录扩展教学。原始上游许可位于项目的 `UPSTREAM-LICENSE`，教学RTL许可在 `rtl/LICENSE`。完整原始 AST、工具缓存和个人浏览器记录不公开。
