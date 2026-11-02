#!/usr/bin/env python3
"""Copy only explicitly cited simulator files into the browser source corpus.

The main hardware/compiler index uses real syntax parsers. These extra files are
text-only lesson references; this script does not claim to parse the ISA DSL.
"""
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "web/coralnpu/data"
EXTRAS = {
    "mpact": (ROOT / "CoralNPU/software/coralnpu-mpact", "https://github.com/google-coral/coralnpu-mpact"),
    "mpact-riscv": (ROOT / "CoralNPU/software/mpact-riscv", "https://github.com/google/mpact-riscv"),
    "mpact-sim": (ROOT / "CoralNPU/software/mpact-sim", "https://github.com/google/mpact-sim"),
}


def referenced_paths(value):
    found = set()
    if isinstance(value, dict):
        if value.get("repo") in EXTRAS and isinstance(value.get("path"), str):
            found.add((value["repo"], value["path"]))
        for child in value.values():
            found.update(referenced_paths(child))
    elif isinstance(value, list):
        for child in value:
            found.update(referenced_paths(child))
    return found


def augment_index(index):
    """Idempotently refresh the extra corpus; never traverse a full MPACT repo."""
    content = ROOT / "web/coralnpu/content/software.json"
    references = referenced_paths(json.loads(content.read_text())) if content.is_file() else set()
    index["files"] = [f for f in index["files"] if f["repo"] not in EXTRAS]
    index["symbols"] = [s for s in index["symbols"] if s["repo"] not in EXTRAS]
    index["edges"] = [e for e in index["edges"] if e["repo"] not in EXTRAS]
    warnings = []
    for repo_id, (repo, url) in EXTRAS.items():
        index["commitMap"][repo_id] = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
        index["repoUrls"][repo_id] = url
        if repo_id not in index["repoIds"]:
            index["repoIds"].append(repo_id)
        destination = OUT / "sources" / repo_id
        if destination.exists():
            shutil.rmtree(destination)
    for repo_id, relative in sorted(references):
        repo, url = EXTRAS[repo_id]
        path = repo / relative
        if Path(relative).is_absolute() or ".." in Path(relative).parts or any(p in {"third_party", ".git", ".agents", "node_modules"} for p in Path(relative).parts):
            warnings.append({"repo": repo_id, "path": relative, "reason": "outside allowed first-party paths"})
            continue
        tracked = subprocess.run(["git", "-C", str(repo), "ls-files", "--error-unmatch", "--", relative], capture_output=True)
        if tracked.returncode or not path.is_file() or path.is_symlink():
            warnings.append({"repo": repo_id, "path": relative, "reason": "not a tracked regular file"})
            continue
        payload = path.read_bytes()
        row = {"repo": repo_id, "path": relative, "bytes": len(payload), "language": {".isa": "mpact-isa", ".cc": "cpp", ".h": "cpp", ".md": "markdown"}.get(path.suffix, path.suffix.lstrip(".") or "file"),
               "symbols": [], "imports": [], "diagnostics": [], "corpusScope": "explicit-lesson-reference",
               "sourceUrl": url + "/blob/" + index["commitMap"][repo_id] + "/" + quote(relative)}
        try:
            payload.decode("utf-8")
            if len(payload) > 2_000_000:
                raise ValueError("reference file exceeds 2 MB text budget")
            destination = OUT / "sources" / repo_id / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(payload)
            row.update(contentPath="data/" + str(destination.relative_to(OUT)), lines=payload.count(b"\n") + 1,
                       sha256=hashlib.sha256(payload).hexdigest(), parseMethod="text-only-reference", parseStatus="text-indexed")
        except (UnicodeDecodeError, ValueError) as error:
            row["contentOmittedReason"] = str(error)
        index["files"].append(row)
    index["method"]["referenceCorpusScope"] = "MPACT repositories: only files explicitly cited by content/software.json; copied as text, not syntax-parsed."
    index["method"]["syntaxDiagnosticsInterpretation"] = "Standalone syntax diagnostics and parser exceptions are indexing observations; no full-chip build was attempted, so they do not establish that the chip cannot be built. The initial indexer exception was repaired; its recovery is recorded separately."
    index["method"]["referenceWarnings"] = warnings
    index["method"]["referenceSupplementedAt"] = datetime.now(timezone.utc).isoformat()
    files = index["files"]
    stats = index["stats"]
    stats.update(files=len(files), exportedFiles=sum("contentPath" in f for f in files),
                 sourceBytes=sum(f["bytes"] for f in files if "contentPath" in f),
                 symbols=len(index["symbols"]), edges=len(index["edges"]),
                 hardwareModules=sum(s["kind"] == "module" for s in index["symbols"]),
                 uniqueResolvedEdges=sum(e.get("resolution") == "unique-source-symbol" for e in index["edges"]),
                 parserFailures=sum(f.get("parseStatus") == "failed" for f in files),
                 filesWithPrimarySyntaxDiagnostics=sum(any(d.get("error") and d.get("inRequestedFile") for d in f["diagnostics"]) for f in files),
                 filesWithIncludedHeaderDiagnostics=sum(any(d.get("error") and not d.get("inRequestedFile") for d in f["diagnostics"]) for f in files),
                 languages=dict(Counter(f["language"] for f in files)),
                 parserFiles=dict(Counter(f["parseMethod"] for f in files if f.get("parseMethod") and f.get("parseMethod") != "parser-exception")),
                 parserFailureFiles=[{"repo": f["repo"], "path": f["path"], "diagnostics": f["diagnostics"]} for f in files if f.get("parseStatus") == "failed"])
    directories = Counter()
    for row in files:
        for parent in Path(row["path"]).parents:
            if str(parent) != ".":
                directories[f"{row['repo']}:{parent}"] += 1
    index["directories"] = [{"id": path, "files": count} for path, count in sorted(directories.items())]
    return index


def main():
    path = OUT / "source-index.json"
    result = augment_index(json.loads(path.read_text()))
    path.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    (OUT / "analysis/index-summary.json").write_text(json.dumps({key: result[key] for key in ("commitMap", "stats", "method", "limitations")}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"referenceFiles": [f["repo"] + ":" + f["path"] for f in result["files"] if f["repo"] in EXTRAS], "warnings": result["method"]["referenceWarnings"], "parserFailureFiles": result["stats"]["parserFailureFiles"]}, indent=2))


if __name__ == "__main__":
    main()
