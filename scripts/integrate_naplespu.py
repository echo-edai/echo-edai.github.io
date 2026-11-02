#!/usr/bin/env python3
"""Export the local NaplesPU learning atlas to this portal, without pushing."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

PORTAL = Path(__file__).resolve().parents[1]
WORKSPACE = PORTAL.parent
WEB = WORKSPACE / "web"
TARGET = PORTAL / "projects" / "naplespu"
SLUG = "naplespu-interactive"


def assignment(path, name):
    text = path.read_text()
    return json.loads(re.search(r"window\." + name + r"\s*=\s*([\s\S]*);\s*$", text).group(1))


def content():
    program = """
const fs=require('fs'),vm=require('vm'),path=require('path'),box={window:{}};
vm.createContext(box);
for(const name of fs.readdirSync(process.argv[1]).filter(n=>n.endsWith('.js')).sort())
  new vm.Script(fs.readFileSync(path.join(process.argv[1],name),'utf8'))
    .runInContext(box,{timeout:10000});
process.stdout.write(JSON.stringify(box.window));
"""
    return json.loads(subprocess.check_output(["node", "-e", program, str(WEB / "content")], text=True))


def walk(value):
    yield value
    if isinstance(value, dict):
        for item in value.values():
            yield from walk(item)
    elif isinstance(value, list):
        for item in value:
            yield from walk(item)


def clean_report(text):
    text = text.replace(str(WORKSPACE), "<workspace>")
    text = re.sub(r"/Users/[^/\s]+", "<home>", text)
    return re.sub(r"/(?:private/)?var/folders/[^\s\"<>]+", "<temporary-path>", text)


def main():
    if not (WEB / "content/deep-memory.js").is_file():
        raise SystemExit("Place this portal beside the original web/ and source/ directories.")
    if TARGET.exists() and not (TARGET / "research/publication-manifest.json").is_file():
        raise SystemExit("Refusing to replace an exhibit without a NaplesPU publication manifest.")
    exported = content()
    deep = [exported[name] for name in ("NPU_DEEP_CORE", "NPU_DEEP_NOC", "NPU_DEEP_MEMORY")]
    chapters = exported["NPU_HARDWARE"]["chapters"] + exported["NPU_SOFTWARE"]["chapters"]
    chapters += [c for d in deep for c in d["chapters"]]
    counts = {"chapters": len(chapters), "lessons": sum(len(c["sections"]) for c in chapters),
              "concepts": sum(len(d["concepts"]) for d in deep)}
    index = assignment(WEB / "data/source-index.js", "NPU_SOURCE_INDEX")
    embedded = assignment(WEB / "data/source-code.js", "NPU_SOURCE_CODE")
    sources = set(embedded)
    for value in walk(exported):
        if isinstance(value, dict):
            path = value.get("path", value.get("file"))
            if isinstance(path, str) and path.startswith("source/"):
                sources.add(path)
    # Preserve applicable upstream license files along the copied files' ancestry.
    for relative in list(sources):
        path = (WORKSPACE / relative).resolve()
        if not path.is_relative_to((WORKSPACE / "source").resolve()) or not path.is_file():
            raise ValueError("Source is outside the collected public tree: " + relative)
        for directory in path.parents:
            if directory == WORKSPACE / "source":
                break
            if not directory.is_relative_to(WORKSPACE / "source"):
                break
            for item in directory.iterdir():
                if item.is_file() and re.match(r"(?i)^(license|copying|notice)([._-].*|)$", item.name):
                    sources.add(item.relative_to(WORKSPACE).as_posix())

    if TARGET.exists():
        shutil.rmtree(TARGET)
    TARGET.mkdir(parents=True)
    files = ["app.js", "styles.css", "logic-models.js"]
    files += ["data/" + n for n in ("source-index.js", "source-code.js", "teaching-code.js")]
    files += ["content/" + n for n in ("hardware.js", "software.js", "research.js",
                                      "deep-core.js", "deep-noc.js", "deep-memory.js")]
    files += ["assets/system-architecture.png", "assets/core-dataflow.png"]
    files += ["rtl/" + n for n in ("learn_fifo.sv", "learn_scoreboard.sv",
                                   "learn_directory.sv", "tb_learning.sv", "README.md")]
    files += ["tools/" + n for n in ("test_learning_rtl.py", "test_learning_models.cjs",
                                     "crosscheck_learning_models.cjs")]
    files += ["downloads/microarchitecture-starter.zip"]
    reports = ["learning-tools.md", "diagram-prompts.md", "diagram-audit.md",
               "learning-rtl-verification.json", "learning-model-crosscheck.json"]
    for relative in files:
        source, destination = WEB / relative, TARGET / relative
        if source.is_symlink():
            raise ValueError("Only explicit regular website assets may be exported: " + relative)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    for name in reports:
        destination = TARGET / "research" / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(clean_report((WEB / "research" / name).read_text()))
    for relative in sorted(sources):
        source, destination = WORKSPACE / relative, TARGET / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(source.read_bytes())

    config = {"scope": "Public static export; unbundled source is fetched from pinned upstream commits.",
              "localSources": sorted(sources), "counts": counts}
    (TARGET / "publication.js").write_text("window.NPU_PUBLICATION=" +
                                          json.dumps(config, ensure_ascii=False, separators=(",", ":")) + ";\n")
    html = (WEB / "index.html").read_text()
    html = html.replace('<script defer src="app.js"></script>',
                        '<script defer src="publication.js"></script><script defer src="app.js"></script>')
    html = html.replace('href="../docs/official/index.html"', 'href="https://www.naplespu.com/"')
    html = html.replace('href="../source/README.md"', 'href="source/README.md"')
    html = html.replace('href="gemmini/"', 'href="../gemmini/"')
    html = html.replace('<div class="top-actions">',
                        '<div class="top-actions"><a href="../../#explore">返回门户 ↗</a>', 1)
    html = html.replace("全部文件可检索，核心源码可离线阅读。",
                        "完整文件索引与核心源码随站点提供；其他文件按需读取固定上游。")
    html = html.replace("官方离线文档 ↗", "官方项目与文档 ↗")
    def version_asset(match):
        path = TARGET / match.group(2)
        if not path.is_file():
            return match.group(0)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()[:12]
        return f'{match.group(1)}="{match.group(2)}?v={digest}"'
    html = re.sub(r'(src|href)="([^"?#]+\.(?:js|css))"', version_asset, html)
    (TARGET / "index.html").write_text(html)

    readme = f"""# NaplesPU 交互源码教材

公开入口：https://echo-edai.github.io/projects/naplespu/

{counts['chapters']}章、{counts['lessons']}节、{counts['concepts']}个实现概念；四条共25步实现路线，五个机制推演、三个逐拍状态实验及45道自测。

源码浏览器保留全部{index['total']:,}个上游文件的索引，{len(embedded)}份核心原文内嵌，{len(sources)}份核心/引用源码及适用许可文件随站点提供。其余文件按需从固定提交的公开上游读取；网络不可用时可打开GitHub原文。没有发布完整LLVM依赖树或离线Git bundle。

硬件提交：02a73a6d94d649f368aecbbc2448f287ea8c8e97。
工具链提交：0dc20431b12eccc5e73ad39e004f7dc735762ffa。
硬件原固定工具链：d2ebbc3a6de62848d397728bbcba6527b6773f30，不能自动视为与当前工具链兼容。

网页无第三方运行时。阅读、笔记、自测只保存在访问者浏览器，不上传到服务器。官方Wiki与完整文档通过官方站点访问，未将离线采集档案整体重新发布。

## 教学RTL

下载 [练习包](downloads/microarchitecture-starter.zip)，接口和修改任务见 [说明](rtl/README.md)。这些是独立编写的小原型，不能替换完整NaplesPU。目录原型没有真实数据/地址/NoC，只演示两client单行权限握手。

在本项目目录运行：

    python3 tools/test_learning_rtl.py
    node tools/test_learning_models.cjs
    node tools/crosscheck_learning_models.cjs

需要Icarus Verilog与Node.js。已有30项RTL检查、23项模型检查和三个模型各300周期对照记录，不构成完整NaplesPU仿真或形式证明。

## 更新

本门户仓库与原工作区web/、source/相邻时，运行：

    python3 scripts/integrate_naplespu.py
    python3 scripts/build.py

整合脚本只导出明确列出的NaplesPU文件并更新门户卡片，不推送远端。其他项目保持原样。发布清单见 [publication-manifest.json](research/publication-manifest.json)；上游许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
"""
    (TARGET / "README.md").write_text(readme)
    (TARGET / "source/README.md").write_text(
        "# 公开源码副本\n\n完整路径索引在网页源码浏览器中，当前随站点提供核心与引用文件及适用许可证。\n\n"
        "[官方硬件固定快照](https://github.com/AlessandroCilardo/NaplesPU/tree/02a73a6d94d649f368aecbbc2448f287ea8c8e97)\n\n"
        "[官方工具链固定快照](https://github.com/AlessandroCilardo/NaplesPU-toolchain/tree/0dc20431b12eccc5e73ad39e004f7dc735762ffa)\n\n"
        "其余文本由查看器按需读取固定上游；原始内容与许可不作修改。完整离线收录和Git历史仍位于原始本地工作区，不随此公开站整体发布。\n")
    (TARGET / "THIRD_PARTY_NOTICES.md").write_text(
        "# 来源与许可\n\nNaplesPU硬件和工具链使用BSD-3-Clause，LLVM/Clang/LLD及第三方子目录保留各自许可和文件头。\n\n"
        "随站点提供的源码按原始字节复制；相关LICENSE/COPYING/NOTICE文件一并保存，路径见publication-manifest.json。\n\n"
        "[硬件许可](source/hardware/LICENSE) · [工具链许可](source/software/toolchain/LICENSE) · "
        "[LLVM许可](source/software/toolchain/compiler/LICENSE.TXT)。\n\n"
        "中文课程、交互和独立教学RTL为本项目编写，不属于官方实现。架构图为内置image_gen生成，提示词和核验见research/。官方Wiki不套用源码BSD许可，公开站链接其官方入口。\n")
    manifests = [{"path": p.relative_to(TARGET).as_posix(), "bytes": p.stat().st_size,
                  "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
                 for p in sorted(TARGET.rglob("*")) if p.is_file()]
    (TARGET / "research/publication-manifest.json").write_text(json.dumps(
        {"scope": "Explicit NaplesPU public export; no private paths, caches, screenshots or Git bundles.",
         "counts": {**counts, "indexed_sources": index["total"], "embedded_sources": len(embedded),
                    "local_source_and_license_files": len(sources)}, "files": manifests},
        ensure_ascii=False, indent=2) + "\n")
    data_path = PORTAL / "data/site.json"
    data = json.loads(data_path.read_text())
    project = {"id": SLUG, "shortTitle": "NaplesPU", "category": "learning",
               "categoryLabel": "交互教材", "format": "Core × NoC × 缓存一致性", "featured": False,
               "chapters": counts["chapters"], "lessons": counts["lessons"],
               "title": "NaplesPU：从一条指令到多核系统",
               "description": f"{counts['chapters']}章源码课程、{counts['concepts']}个实现概念与四条动手路线。串起多线程SIMD、NoC、缓存一致性、目录控制器和LLVM工具链。",
               "tags": ["NaplesPU", "RTL", "NoC", "Coherence", "LLVM", "Interactive"],
               "href": "projects/naplespu/", "date": "2026-11-02",
               "image": "projects/naplespu/assets/system-architecture.png",
               "imageAlt": "依据NaplesPU源码核对的默认4×4 Mesh、多类tile与计算核架构图",
               "imageCaption": "SOURCE-VERIFIED ARCHITECTURE / 源码核对架构图",
               "artLabel": "NAPLESPU / SOURCE ARCHITECTURE"}
    data["projects"] = [project] + [p for p in data["projects"] if p["id"] != SLUG]
    update = {"date": "2026-11-02", "title": "把NaplesPU整合为可交互的微架构教材",
              "description": "从token、scoreboard、VC到MSHR与TSHR，连接真实RTL、源码行和可运行练习。",
              "type": "LEARNING / 交互教材", "href": project["href"]}
    data["updates"] = [update] + [u for u in data["updates"] if u["href"] != project["href"]]
    data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"integrated": "projects/naplespu", "files": len(manifests) + 1,
                      "source_and_license_files": len(sources), **counts}, ensure_ascii=False))


if __name__ == "__main__":
    main()
