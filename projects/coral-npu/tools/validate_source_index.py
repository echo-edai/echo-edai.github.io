#!/usr/bin/env python3
"""Verify exported source fidelity, source locations, and graph references."""
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
SITE = ROOT / "web/coralnpu"
REPOS = {
    "hardware": ROOT / "CoralNPU/hardware/coralnpu",
    "compiler": ROOT / "CoralNPU/software/coralnpu-compiler",
    "mpact": ROOT / "CoralNPU/software/coralnpu-mpact",
    "mpact-riscv": ROOT / "CoralNPU/software/mpact-riscv",
    "mpact-sim": ROOT / "CoralNPU/software/mpact-sim",
}


def main():
    index = json.loads((SITE / "data/source-index.json").read_text())
    failures = []
    files = {(row["repo"], row["path"]): row for row in index["files"]}
    symbols = {s["id"] for s in index["symbols"]}
    for row in index["files"]:
        relative = Path(row["path"])
        if relative.is_absolute() or ".." in relative.parts or any(p in {"third_party", ".git", ".agents", "node_modules"} for p in relative.parts):
            failures.append({"rule": "first-party-path", "repo": row["repo"], "path": row["path"]})
        if "contentPath" not in row:
            continue
        exported = SITE / row["contentPath"]
        origin = REPOS[row["repo"]] / row["path"]
        try:
            payload = exported.read_bytes()
            assert exported.resolve().is_relative_to((SITE / "data/sources").resolve())
            assert payload == origin.read_bytes()
            assert len(payload) == row["bytes"]
            assert hashlib.sha256(payload).hexdigest() == row["sha256"]
            assert row["lines"] == payload.count(b"\n") + 1
            for symbol in row["symbols"]:
                assert 1 <= symbol["line"] <= row["lines"]
                assert symbol["line"] <= symbol.get("endLine", symbol["line"]) <= row["lines"]
                for port in symbol.get("ports", []):
                    assert 1 <= port["line"] <= row["lines"]
        except (OSError, AssertionError, ValueError) as error:
            failures.append({"rule": "source-fidelity-or-location", "repo": row["repo"], "path": row["path"], "error": type(error).__name__})
    for edge in index["edges"]:
        if edge["fromId"] not in symbols or (edge.get("toId") and edge["toId"] not in symbols):
            failures.append({"rule": "edge-symbol-reference", "sourcePath": edge["sourcePath"], "line": edge["line"]})
        row = files.get((edge["repo"], edge["sourcePath"]))
        if not row or not 1 <= edge["line"] <= row.get("lines", 0):
            failures.append({"rule": "edge-source-location", "sourcePath": edge["sourcePath"], "line": edge["line"]})
    tracked_changes = {}
    for repo_id, repo in REPOS.items():
        status = subprocess.check_output(["git", "-C", str(repo), "status", "--porcelain", "--untracked-files=no"], text=True)
        tracked_changes[repo_id] = status.splitlines()
        actual_commit = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
        if actual_commit != index["commitMap"][repo_id]:
            failures.append({"rule": "checkout-commit-mismatch", "repo": repo_id})
    # Generated metadata must not embed workspace-specific paths. Original source
    # text is preserved verbatim and is separately checked against upstream files.
    generated = [SITE / "data/source-index.json", *sorted((SITE / "data/analysis").rglob("*.json"))]
    for path in generated:
        if str(ROOT) in path.read_text():
            failures.append({"rule": "generated-local-path", "path": str(path.relative_to(SITE))})
    coverage = {}
    for method in ("pyslang-syntax-tree", "tree-sitter-scala", "tree-sitter-cpp", "python-ast", "text-only", "text-only-reference"):
        rows = [r for r in files.values() if r.get("parseMethod") == method]
        coverage[method] = {"files": len(rows), "withPrimarySyntaxDiagnostics": sum(any(d.get("error") and d.get("inRequestedFile") for d in r["diagnostics"]) for r in rows),
                            "withIncludedHeaderDiagnostics": sum(any(d.get("error") and not d.get("inRequestedFile") for d in r["diagnostics"]) for r in rows)}
    result = {"schemaVersion": 1, "passed": not failures, "checkedExportedFiles": sum("contentPath" in r for r in files.values()),
              "failures": failures, "trackedCheckoutChanges": tracked_changes, "coverage": coverage,
              "edgeTypes": dict(Counter(e["type"] for e in index["edges"])),
              "edgeResolution": dict(Counter(e["resolution"] for e in index["edges"])),
              "parserFailures": index["stats"]["parserFailureFiles"],
              "interpretation": "Checks source-copy fidelity, locations, and reference integrity. Syntax coverage is not semantic elaboration, signal connectivity, timing validation, synthesis, or full-chip build success."}
    (SITE / "data/analysis/source-index-validation.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    tooling_path = SITE / "data/analysis/tooling.json"
    if tooling_path.is_file():
        tooling = json.loads(tooling_path.read_text())
        tooling.update(stats=index["stats"], coverage=coverage,
                       sourceCorpusValidation={"passed": result["passed"], "checkedExportedFiles": result["checkedExportedFiles"]})
        tooling_path.write_text(json.dumps(tooling, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["passed"] else 1)


if __name__ == "__main__":
    main()
