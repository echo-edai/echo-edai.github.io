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


def header():
    return '''<a class="skip-link" href="#main">跳到主要内容</a>
<header class="header wrap"><a href="/" class="brand" aria-label="echo lab 首页"><svg viewBox="0 0 28 28" aria-hidden="true"><path d="M5 6h19l-4 5H5zm0 8h14l-4 5H5zm0 8h9l-4 5H5z"/></svg><span>echo<span class="brand-divider">/</span>lab<span class="brand-dot">.</span></span></a><button class="menu-button" aria-expanded="false" aria-controls="navigation" aria-label="展开导航"><span></span><span></span></button><nav id="navigation" aria-label="主导航"><a href="/#explore">探索<span>01</span></a><a href="/#journal">动态<span>02</span></a><a href="/#about">关于<span>03</span></a><a class="github-link" href="https://github.com/echo-edai" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a></nav></header>'''


def footer():
    return '''<footer class="footer wrap"><a href="/" class="footer-brand">echo / lab.</a><span>© <span data-year>2026</span> echo · 保持好奇，持续构建。</span><a href="https://github.com/echo-edai/echo-edai.github.io" target="_blank" rel="noopener noreferrer">这个空间的源码 ↗</a><a class="back-top" href="#main" aria-label="回到顶部">↑</a></footer>'''


def document(title, description, url, body, article=False):
    return f'''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#111412"><meta name="description" content="{escape(description, quote=True)}"><meta property="og:title" content="{escape(title, quote=True)}"><meta property="og:description" content="{escape(description, quote=True)}"><meta property="og:type" content="{'article' if article else 'website'}"><meta property="og:url" content="{url}"><link rel="canonical" href="{url}"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/style.css"><script src="/assets/app.js" type="module"></script><title>{escape(title)} · echo / lab</title></head><body>{'<div class="reading-progress" aria-hidden="true"></div>' if article else ''}{header()}{body}{footer()}</body></html>'''


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
    shutil.copy2(ROOT / "index.html", OUT / "index.html")
    paths = ["/"]
    for item in projects:
        if not item["href"].startswith("notes/"):
            continue  # Standalone projects are copied from projects/ or externally linked.
        if item["href"] != f'notes/{item["id"]}/':
            raise ValueError("Notes must use notes/<id>/ paths")
        fragment = (ROOT / "content" / f'{item["id"]}.html').read_text()
        toc = ''.join(f'<a href="#{escape(anchor)}">{escape(label)}</a>' for anchor, label in item["sections"])
        body = f'''<main id="main" class="article-shell"><a class="article-back" href="/#explore">← <span>返回探索空间</span></a><div class="article-heading"><p class="eyebrow"><span class="live-dot"></span>{escape(item["eyebrow"])}</p><h1>{escape(item["title"])}</h1><p class="lead">{escape(item["lead"])}</p><div class="article-meta"><time datetime="{escape(item["date"])}">{escape(item["date"].replace('-', '.'))}</time><span>{escape(item["categoryLabel"])}</span><span>约 {escape(item["readingTime"])}</span></div></div><div class="article-layout"><article class="prose">{fragment}<div class="article-end"><a href="/#explore">← 回到探索列表</a><span>保持好奇，持续构建。</span></div></article><aside class="article-toc" aria-label="本页目录"><p>ON THIS PAGE / 目录</p>{toc}</aside></div></main>'''
        destination = OUT / item["href"] / "index.html"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(document(item["title"], item["description"], data["url"] + '/' + item["href"], body, article=True))
        paths.append('/' + item["href"])
    error_body = '<main id="main" class="error-page wrap"><span>404<span class="accent">.</span></span><h1>这条线索，暂时没有着落。</h1><p>页面可能移动了。回到探索空间，寻找下一个入口。</p><a href="/" class="button button-primary">回到首页 <span aria-hidden="true">↗</span></a></main>'
    (OUT / "404.html").write_text(document("页面未找到", "回到 echo 的个人探索空间", data["url"] + '/404.html', error_body))
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
