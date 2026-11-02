#!/usr/bin/env python3
"""Check course structure, literal excerpts and source anchors without running RTL.

This validator does not prove the accuracy of prose, hardware connections, target
configuration, numerical semantics, or performance. Those need a separate human
source review and, where appropriate, execution evidence.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import sys


DEFAULT_SITE = Path(__file__).resolve().parents[1]
DEFAULT_ROOT = DEFAULT_SITE.parents[1]
REPO_PATHS = {
    "hardware": "CoralNPU/hardware/coralnpu",
    "compiler": "CoralNPU/software/coralnpu-compiler",
    "mpact": "CoralNPU/software/coralnpu-mpact",
    "mpact-riscv": "CoralNPU/software/mpact-riscv",
    "mpact-sim": "CoralNPU/software/mpact-sim",
}
TEACHING_MARKER = re.compile(r"教学|示意|伪代码|pseudocode|teaching|illustrative", re.I)
BOUNDARY_TERMS = re.compile(r"\bNoC\b|directory[_ ]controller|缓存一致性|目录控制器", re.I)


def normalized_lines(text: str) -> str:
    """Ignore indentation and trailing spaces, while preserving token spelling."""
    return "\n".join(line.strip() for line in text.strip().splitlines())


class VisibleHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.skip = max(0, self.skip - 1)

    def handle_data(self, data):
        if not self.skip:
            self.text.append(data)


def git_commit(path):
    try:
        result = subprocess.run(
            ["git", "-C", str(path), "rev-parse", "HEAD"],
            check=True, capture_output=True, text=True,
        )
        return result.stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


class Validator:
    def __init__(self, root, site):
        self.root, self.site = root, site
        self.roots = {k: root / v for k, v in REPO_PATHS.items()}
        self.errors, self.warnings, self.pending = [], [], []
        self.anchors, self.code, self.review_targets, self.documents = [], [], [], []
        self.chapters = set()
        self.current_document = None
        self.browser_files = {}
        index = site / "data/source-index.json"
        if index.is_file():
            try:
                data = json.loads(index.read_text(encoding="utf-8"))
                self.browser_files = {(f["repo"], f["path"]): f for f in data.get("files", [])}
            except (ValueError, KeyError, OSError) as exc:
                self.warnings.append({"kind": "browser-index-unreadable", "message": str(exc)})

    def problem(self, level, kind, location, message):
        getattr(self, level).append({"kind": kind, "location": location, "message": message})

    def source(self, source, location):
        if not isinstance(source, dict):
            self.problem("errors", "source-schema", location, "source must be an object")
            return None
        # hardware.json declares one sourceRoot for its relative references.
        # software.json spans repositories and must identify them explicitly.
        repo = source.get("repo", "hardware" if self.current_document == "hardware" else None)
        path = source.get("path")
        if repo not in self.roots or not isinstance(path, str):
            self.problem("errors", "source-repository", location, "Unknown repository or missing path")
            return None
        relative = Path(path)
        if relative.is_absolute() or ".." in relative.parts:
            self.problem("errors", "source-path", location, "Source path must remain inside its repository")
            return None
        file = self.roots[repo] / relative
        if not file.is_file():
            self.problem("errors", "source-missing", location, f"{repo}:{path}")
            return None
        try:
            text = file.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            self.problem("errors", "source-unreadable", location, str(exc))
            return None
        lines = text.splitlines()
        first, last = source.get("line"), source.get("endLine", source.get("line"))
        if (type(first) is not int or type(last) is not int or not 1 <= first <= last <= len(lines)):
            self.problem("errors", "source-range", location, f"{repo}:{path} has {len(lines)} lines; requested {first}..{last}")
            return None
        browser = self.browser_files.get((repo, path))
        record = {
            "location": location, "repo": repo, "path": path,
            "line": first, "endLine": last, "fileLines": len(lines),
            "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
            "browserCoverage": "exported" if browser and browser.get("contentPath") else "upstream-link-required",
        }
        if browser and browser.get("contentPath"):
            mirror = self.site / browser["contentPath"]
            if not mirror.is_file():
                self.problem("errors", "source-mirror-missing", location, browser["contentPath"])
            elif mirror.read_bytes() != file.read_bytes():
                self.problem("errors", "source-mirror-differs", location, f"{repo}:{path}")
        self.anchors.append(record)
        return text, "\n".join(lines[first - 1:last]), first, record

    def node(self, value, location):
        if isinstance(value, dict):
            linked = self.source(value["source"], location + ".source") if "source" in value else None
            if "codeSource" in value:
                # A section may cite a broad reading range while its literal
                # excerpt separately names the exact lines.
                linked = self.source(value["codeSource"], location + ".codeSource")
            code = value.get("code")
            if code is not None:
                if not isinstance(code, str):
                    self.problem("errors", "code-schema", location, "code must be a string")
                else:
                    norm = normalized_lines(code)
                    # Labels must be visible in the code itself or immediately
                    # adjacent explanatory prose, not merely in another chapter.
                    context = "\n".join(str(value.get(k, "")) for k in ["title", "body", "implementation"])
                    label = bool(TEACHING_MARKER.search(code + "\n" + context))
                    entry = {"location": location, "teachingLabelPresent": label}
                    if linked and norm and norm in normalized_lines(linked[1]):
                        entry["classification"] = "literal-in-cited-range"
                    elif linked and norm and norm in normalized_lines(linked[0]):
                        entry["classification"] = "literal-in-file-outside-cited-range"
                        self.problem("warnings", "excerpt-outside-range", location,
                                     "Literal excerpt exists in the file but is not contained in its cited range")
                    elif label and value.get("codeOrigin") != "upstream":
                        entry["classification"] = "labeled-teaching-example-not-literal"
                    else:
                        entry["classification"] = "unmatched-unlabeled"
                        self.problem("errors", "unmatched-code", location,
                                     "Code is neither a contiguous literal source excerpt nor visibly labeled as teaching/pseudocode")
                    self.code.append(entry)
            for key, child in value.items():
                if key != "source":
                    self.node(child, location + "." + str(key))
        elif isinstance(value, list):
            for i, child in enumerate(value):
                self.node(child, f"{location}[{i}]")

    def document(self, name):
        self.current_document = name
        path = self.site / "content" / (name + ".json")
        if not path.is_file():
            self.pending.append({"kind": "course-not-generated", "path": str(path.relative_to(self.site)),
                                 "message": "Required course JSON is not available yet"})
            return
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            self.problem("errors", "json-invalid", name, str(exc))
            return
        if not isinstance(data, dict):
            self.problem("errors", "document-schema", name, "Course root must be an object")
            return
        chapters = data.get("chapters")
        if not isinstance(chapters, list) or not chapters:
            self.problem("errors", "chapters-schema", name, "Nonempty chapters list is required")
            chapters = []
        for i, chapter in enumerate(chapters):
            loc = f"{name}.chapters[{i}]"
            cid = chapter.get("id")
            if not isinstance(cid, str) or not cid or cid in self.chapters:
                self.problem("errors", "chapter-id", loc, "Chapter id is missing or not globally unique")
            self.chapters.add(cid)
            if not chapter.get("title") or not isinstance(chapter.get("sections"), list):
                self.problem("errors", "chapter-schema", loc, "Chapter needs title and sections")
            for j, section in enumerate(chapter.get("sections", [])):
                if not section.get("title") or not isinstance(section.get("body"), str):
                    self.problem("errors", "section-schema", f"{loc}.sections[{j}]", "Section needs title and string body")
                prose = json.dumps(section, ensure_ascii=False)
                if BOUNDARY_TERMS.search(prose):
                    self.review_targets.append({"location": f"{loc}.sections[{j}]", "title": section.get("title"),
                                                "reason": "NoC/coherence/directory boundary requires semantic source review"})
        for i, quiz in enumerate(data.get("quizzes", [])):
            answer = quiz.get("answer", quiz.get("correct"))
            options = quiz.get("options", [])
            if type(answer) is not int or not 0 <= answer < len(options):
                self.problem("errors", "quiz-answer", f"{name}.quizzes[{i}]", "Answer must be a zero-based valid option index")
        self.node(data, name)
        self.documents.append({
            "name": name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "chapters": len(chapters), "sections": sum(len(c.get("sections", [])) for c in chapters),
            "glossary": len(data.get("glossary", [])), "labs": len(data.get("labs", [])),
            "quizzes": len(data.get("quizzes", [])),
        })
        if name == "hardware" and data.get("upstreamCommit"):
            actual = git_commit(self.roots["hardware"])
            if actual and data["upstreamCommit"] != actual:
                self.problem("errors", "commit-mismatch", name + ".upstreamCommit", f"Declared {data['upstreamCommit']}; checked out {actual}")
        for key, repo in [("hardwareCommit", "hardware"), ("compilerCommit", "compiler")]:
            declared = data.get("basis", {}).get(key)
            actual = git_commit(self.roots[repo])
            if declared and actual and declared != actual:
                self.problem("errors", "commit-mismatch", name + ".basis." + key, f"Declared {declared}; checked out {actual}")

    def run(self):
        for course in ["hardware", "software"]:
            self.document(course)
        module = self.roots["compiler"] / "MODULE.bazel"
        patches = []
        if module.is_file():
            for relative in sorted(set(re.findall(r'"//:([^"\n]+\.patch)"', module.read_text()))):
                file = self.roots["compiler"] / relative
                patches.append({"path": relative, "exists": file.is_file(),
                                "sha256": hashlib.sha256(file.read_bytes()).hexdigest() if file.is_file() else None})
                if not file.is_file():
                    self.problem("errors", "integration-patch-missing", "compiler.MODULE.bazel", relative)
        index_html = self.site / "index.html"
        if index_html.is_file():
            parser = VisibleHTML()
            parser.feed(index_html.read_text(encoding="utf-8"))
            visible = " ".join(parser.text)
            if "每一条解释" in visible:
                self.problem("warnings", "copy-overpromise", "index.html", "Every explanation is source-backed is broader than the cited factual sections; teaching and extensions need separate provenance")
            if "先证明正确" in visible:
                self.problem("warnings", "copy-proof-language", "index.html", "Prefer validation wording; tests and reference-model comparisons do not constitute a correctness proof")
        status = "failed" if self.errors else "pending" if self.pending else "passed-with-warnings" if self.warnings else "passed"
        return {
            "schemaVersion": 1, "createdAt": datetime.now(timezone.utc).isoformat(),
            "status": status,
            "scope": "Static JSON/schema, file/line anchors, literal excerpt containment, mirror equality, quiz indices and pin/patch-file presence only.",
            "notProven": ["Correctness of natural-language claims", "Full-core RTL elaboration or simulation", "Actual target parameter overrides", "Numerical bit-equivalence", "Performance", "Patch application or successful build"],
            "summary": {"documents": len(self.documents), "chapters": sum(d["chapters"] for d in self.documents),
                        "sections": sum(d["sections"] for d in self.documents), "sourceAnchors": len(self.anchors),
                        "codeBlocks": len(self.code), "codeClasses": dict(Counter(c["classification"] for c in self.code)),
                        "errors": len(self.errors), "warnings": len(self.warnings), "pending": len(self.pending)},
            "documents": self.documents, "errors": self.errors, "warnings": self.warnings,
            "pending": self.pending, "sourceAnchors": self.anchors, "codeBlocks": self.code,
            "semanticReviewTargets": self.review_targets,
            "repositoryHeads": {repo: git_commit(path) for repo, path in self.roots.items()},
            "integrationPatchFiles": patches,
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="Workspace containing CoralNPU/")
    parser.add_argument("--site", type=Path, default=DEFAULT_SITE, help="Coral website directory")
    parser.add_argument("--output", type=Path, help="Default: SITE/research/content-validation.json")
    parser.add_argument("--allow-pending", action="store_true", help="Return zero if a required course is still missing (report remains pending)")
    args = parser.parse_args()
    report = Validator(args.root.resolve(), args.site.resolve()).run()
    output = args.output or args.site / "research/content-validation.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], **report["summary"], "report": str(output.resolve())}, ensure_ascii=False))
    if report["errors"]:
        return 1
    if report["pending"] and not args.allow_pending:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
