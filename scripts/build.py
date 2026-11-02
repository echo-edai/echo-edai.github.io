#!/usr/bin/env python3
"""Build a dependency-free static portal; validate every local link before deploy."""
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "_site"


ICONS = {
    "home": '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
    "explore": '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    "journal": '<path d="M4 5h16v15H4zM8 2v6m8-6v6M4 11h16m-12 4h3m3 0h3"/>',
    "about": '<circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',
    "note": '<path d="M5 3h10l4 4v14H5zM14 3v5h5M8 12h8m-8 4h6"/>',
}


def sidebar(data, current="home"):
    def link(href, label, icon, key, count="", project=False):
        active = current == key
        visual = escape(icon) if project else f'<svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[icon]}</svg>'
        return f'''<a class="sidebar-link {'project-link ' if project else ''}{'active' if active else ''}" href="{escape(href, quote=True)}" title="{escape(label, quote=True)}" data-portal-page="{key}" {'aria-current="page"' if active else ''}><span class="nav-icon {'project-initial' if project else ''}" aria-hidden="true">{visual}</span><span class="nav-label">{escape(label)}</span>{f'<span class="nav-count">{escape(str(count))}</span>' if count != '' else ''}</a>'''

    overview = ''.join(link(f'/#{key}', label, key, key, count) for key, label, count in [
        ("home", "空间概览", ""), ("explore", "全部探索", len(data["projects"])),
        ("journal", "最近动态", ""), ("about", "关于我", ""),
    ])
    learning, notes = [], []
    for project in data["projects"]:
        if project["href"].startswith("projects/"):
            label = project.get("shortTitle", project["title"])
            initial = {"gemmini": "G", "coral-npu": "C", "opentpu-interactive": "O"}.get(project["id"], label[0].upper())
            learning.append(link('/' + project["href"], label, initial, project["id"], "↗", project=True))
        elif project["href"].startswith("notes/"):
            notes.append(link('/' + project["href"], project["title"], "note", project["id"]))
    return f'''<aside id="portal-sidebar" class="portal-sidebar" aria-label="门户侧边栏">
<div class="sidebar-heading"><a href="/" class="brand" aria-label="echo lab 首页"><svg viewBox="0 0 28 28" aria-hidden="true"><path d="M5 6h19l-4 5H5zm0 8h14l-4 5H5zm0 8h9l-4 5H5z"/></svg><span>echo<span class="brand-divider">/</span>lab<span class="brand-dot">.</span></span></a><button class="sidebar-close" aria-label="关闭侧边栏"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div>
<div class="sidebar-scroll"><div class="sidebar-group"><p class="sidebar-label">WORKSPACE / 我的空间</p><nav class="sidebar-nav" aria-label="空间导航">{overview}</nav></div><div class="sidebar-group"><p class="sidebar-label">LEARNING SPACES / 交互学习</p><nav class="sidebar-nav" aria-label="交互教材">{''.join(learning)}</nav></div><div class="sidebar-group"><p class="sidebar-label">NOTES & RESEARCH / 阅读与研究</p><nav class="sidebar-nav" aria-label="笔记与研究">{''.join(notes)}</nav></div></div>
<div class="sidebar-foot"><a href="/#about" class="sidebar-profile" aria-label="了解 echo"><span class="profile-avatar" aria-hidden="true">e.</span><span class="profile-copy"><strong>echo</strong><small>LEARN · BUILD · SHARE</small></span></a><p class="sidebar-status"><span class="live-dot"></span>这个空间，持续生长中</p></div></aside>
<button id="portal-backdrop" class="portal-backdrop" hidden aria-label="关闭侧边栏遮罩" tabindex="-1"></button>
<noscript><style>@media(max-width:960px){{.portal-sidebar{{position:static;transform:none;width:auto;max-height:none}}.portal-shell{{margin-left:0}}.portal-menu-button,.sidebar-close{{display:none}}}}</style></noscript>'''


def topbar(title="空间概览"):
    return f'''<header class="portal-topbar"><button class="portal-menu-button" aria-label="收起侧边栏" aria-expanded="true" aria-controls="portal-sidebar"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m4-11h5m-5 4h5"/></svg></button><div class="topbar-context"><span class="mobile-brand">echo / lab.</span><a href="/" class="context-space">个人空间</a><span class="context-slash">/</span><strong id="portal-context">{escape(title)}</strong></div><form class="portal-search" role="search" action="/#explore"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input type="search" name="q" id="project-search" placeholder="搜索学习内容…" aria-label="搜索标题、简介或标签" autocomplete="off"><kbd>/</kbd></form><a class="topbar-github" href="https://github.com/echo-edai" target="_blank" rel="noopener noreferrer" aria-label="在 GitHub 查看 echo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02A9.5 9.5 0 0 1 12 6.82a9.5 9.5 0 0 1 2.5.34c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg><span>GitHub ↗</span></a></header>'''


def home(data):
    projects = data["projects"]
    interactive = [project for project in projects if project["href"].startswith("projects/")]
    stats = [(len(interactive), "交互学习空间", "INTERACTIVE GUIDES"),
             (sum(project.get("chapters", 0) for project in interactive), "源码课程章节", "CHAPTERS TO EXPLORE"),
             (len(projects), "学习与研究入口", "A GROWING COLLECTION")]
    metrics = '<div class="portal-metrics" aria-label="内容概览">' + ''.join(
        f'<div class="portal-metric"><strong>{count:02d}</strong><div><span>{label}</span><small>{caption}</small></div></div>'
        for count, label, caption in stats) + '</div>'
    fallback = '<noscript><div class="noscript-links">' + ''.join(
        f'<a href="{escape(project["href"], quote=True)}">{escape(project["title"])} ↗</a>' for project in projects) + '</div></noscript>'
    source = (ROOT / "index.html").read_text()
    for placeholder, value in {"PORTAL_SIDEBAR": sidebar(data), "PORTAL_TOPBAR": topbar(),
                               "PORTAL_METRICS": metrics, "PORTAL_NOSCRIPT": fallback}.items():
        source = source.replace(f'<!-- {placeholder} -->', value)
    return source


def footer():
    return '''<footer class="footer wrap"><a href="/" class="footer-brand">echo / lab.</a><span>© <span data-year>2026</span> echo · 保持好奇，持续构建。</span><a href="https://github.com/echo-edai/echo-edai.github.io" target="_blank" rel="noopener noreferrer">这个空间的源码 ↗</a><a class="back-top" href="#main" aria-label="回到顶部">↑</a></footer>'''


def document(title, description, url, body, data, current="", article=False):
    return f'''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#111412"><meta name="description" content="{escape(description, quote=True)}"><meta property="og:title" content="{escape(title, quote=True)}"><meta property="og:description" content="{escape(description, quote=True)}"><meta property="og:type" content="{'article' if article else 'website'}"><meta property="og:url" content="{url}"><link rel="canonical" href="{url}"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/style.css?v=20261102-portal"><link rel="stylesheet" href="/assets/portal.css?v=20261102-portal"><script src="/assets/app.js?v=20261102-naplespu" type="module"></script><title>{escape(title)} · echo / lab</title></head><body class="portal">{'<div class="reading-progress" aria-hidden="true"></div>' if article else ''}<a class="skip-link" href="#main">跳到主要内容</a>{sidebar(data, current)}<div class="portal-shell">{topbar(title)}{body}{footer()}</div></body></html>'''


class Links(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links, self.ids = [], set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            if attrs["id"] in self.ids:
                raise ValueError(f'Duplicate HTML id: {attrs["id"]}')
            self.ids.add(attrs["id"])
        for attr in ("href", "src"):
            if attrs.get(attr):
                self.links.append(attrs[attr])


def validate_links():
    documents = {}
    for file in OUT.rglob("*.html"):
        parser = Links()
        parser.feed(file.read_text())
        documents[file] = parser
    failures = []
    for file, parser in documents.items():
        for href in parser.links:
            parts = urlsplit(href)
            if parts.scheme or parts.netloc:
                continue
            path = unquote(parts.path)
            target = ((OUT / path.lstrip("/")) if path.startswith("/") else (file.parent / path)) if path else file
            target = target.resolve()
            if not target.is_relative_to(OUT):
                failures.append(f"{file.relative_to(OUT)}: link escapes output: {href}")
                continue
            if target.is_dir():
                target = target / "index.html"
            if not target.is_file():
                failures.append(f"{file.relative_to(OUT)}: missing {href}")
            elif parts.fragment and target in documents and unquote(parts.fragment) not in documents[target].ids:
                failures.append(f"{file.relative_to(OUT)}: missing anchor {href}")
    if failures:
        raise ValueError("Broken links:\n" + "\n".join(failures))
    return len(documents)


def main():
    data = json.loads((ROOT / "data/site.json").read_text())
    projects = data["projects"]
    seen = set()
    for item in projects:
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", item["id"]) or item["id"] in seen:
            raise ValueError("Project IDs must be unique lowercase slugs")
        seen.add(item["id"])
        if item["category"] not in {"learning", "research"}:
            raise ValueError(f'Unknown category: {item["category"]}')
        if item.get('image'):
            picture = (ROOT / item['image']).resolve()
            if not picture.is_relative_to(ROOT) or not picture.is_file():
                raise ValueError(f'Project image must be an existing local file: {item["image"]}')
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    # Only this explicit list is published. The parent workspace is never copied.
    for name in ("assets", "data", "projects"):
        source = ROOT / name
        if source.exists():
            if any(path.is_symlink() for path in [source, *source.rglob("*")]):
                raise ValueError(f"Symlinks are not allowed in public assets: {name}")
            shutil.copytree(source, OUT / name)
    (OUT / "index.html").write_text(home(data))
    paths = ["/"]
    for item in projects:
        if not item["href"].startswith("notes/"):
            if item["href"].startswith("projects/"):
                paths.append('/' + item['href'])
            continue  # Standalone projects are copied from projects/ or externally linked.
        if item["href"] != f'notes/{item["id"]}/':
            raise ValueError("Notes must use notes/<id>/ paths")
        fragment = (ROOT / "content" / f'{item["id"]}.html').read_text()
        toc = ''.join(f'<a href="#{escape(anchor)}">{escape(label)}</a>' for anchor, label in item["sections"])
        body = f'''<main id="main" class="article-shell"><a class="article-back" href="/#explore">← <span>返回探索空间</span></a><div class="article-heading"><p class="eyebrow"><span class="live-dot"></span>{escape(item["eyebrow"])}</p><h1>{escape(item["title"])}</h1><p class="lead">{escape(item["lead"])}</p><div class="article-meta"><time datetime="{escape(item["date"])}">{escape(item["date"].replace('-', '.'))}</time><span>{escape(item["categoryLabel"])}</span><span>约 {escape(item["readingTime"])}</span></div></div><div class="article-layout"><article class="prose">{fragment}<div class="article-end"><a href="/#explore">← 回到探索列表</a><span>保持好奇，持续构建。</span></div></article><aside class="article-toc" aria-label="本页目录"><p>ON THIS PAGE / 目录</p>{toc}</aside></div></main>'''
        destination = OUT / item["href"] / "index.html"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(document(item["title"], item["description"], data["url"] + '/' + item["href"], body, data, current=item["id"], article=True))
        paths.append('/' + item["href"])
    error_body = '<main id="main" class="error-page wrap"><span>404<span class="accent">.</span></span><h1>这条线索，暂时没有着落。</h1><p>页面可能移动了。回到探索空间，寻找下一个入口。</p><a href="/" class="button button-primary">回到首页 <span aria-hidden="true">↗</span></a></main>'
    (OUT / "404.html").write_text(document("页面未找到", "回到 echo 的个人探索空间", data["url"] + '/404.html', error_body, data))
    (OUT / ".nojekyll").touch()
    (OUT / "robots.txt").write_text(f'User-agent: *\nAllow: /\nSitemap: {data["url"]}/sitemap.xml\n')
    sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + ''.join(f'<url><loc>{escape(data["url"] + path)}</loc></url>' for path in paths) + '</urlset>\n'
    (OUT / "sitemap.xml").write_text(sitemap)
    # JSON-driven navigation is checked too; those links aren't in the source HTML.
    for item in [*projects, *data["updates"]]:
        parts = urlsplit(item["href"])
        if parts.scheme in {"http", "https"}:
            continue
        if parts.scheme or parts.netloc or parts.query or parts.fragment:
            raise ValueError(f'Use a local page path or https URL: {item["href"]}')
        destination = (OUT / parts.path).resolve()
        if not destination.is_relative_to(OUT):
            raise ValueError("Content link escapes the public site")
        if destination.is_dir():
            destination /= "index.html"
        if not destination.is_file():
            raise ValueError(f'Content points to a missing page: {item["href"]}')
    count = validate_links()
    size = sum(file.stat().st_size for file in OUT.rglob("*") if file.is_file())
    print(f"Built {count} pages in {OUT}")
    print(f"All local links and anchors valid. Published size: {size / 1024:.1f} KiB")


if __name__ == "__main__":
    main()
