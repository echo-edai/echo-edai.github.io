#!/usr/bin/env python3
"""Build a bounded, source-grounded Coral NPU browser corpus and syntax graph.

Uses actual pyslang syntax trees for SV, tree-sitter for Scala/C++, and Python's
ast for Python. This is not whole-chip elaboration and does not execute the code.
"""
from __future__ import annotations

import ast
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import faulthandler
import json
from pathlib import Path
import re
import subprocess
import sys
import shutil
from urllib.parse import quote

from tree_sitter import Language, Parser
import tree_sitter_scala
import tree_sitter_cpp

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "web/coralnpu/data"
REPOS = {
    "hardware": ROOT / "CoralNPU/hardware/coralnpu",
    "compiler": ROOT / "CoralNPU/software/coralnpu-compiler",
}
SCALA_LANGUAGE = Language(tree_sitter_scala.language())
CPP_LANGUAGE = Language(tree_sitter_cpp.language())
SCALA = Parser(SCALA_LANGUAGE)
CPP = Parser(CPP_LANGUAGE)
TEXT_EXTENSIONS = {".sv", ".v", ".svh", ".vh", ".scala", ".cc", ".cpp", ".c", ".h", ".hpp", ".py", ".mlir", ".td", ".md", ".rst", ".adoc", ".bzl", ".bazel", ".toml", ".cmake", ".sh", ".patch", ".f", ".json", ".txt", ".ld", ".lds", ".s", ".S", ".tcl", ".xdc", ".core"}
LANGUAGES = {".sv": "systemverilog", ".svh": "systemverilog-header", ".v": "verilog", ".vh": "verilog-header", ".scala": "scala", ".cc": "cpp", ".cpp": "cpp", ".h": "cpp", ".hpp": "cpp", ".c": "c", ".py": "python", ".mlir": "mlir", ".md": "markdown", ".rst": "rst", ".toml": "toml", ".bzl": "starlark", ".bazel": "starlark"}
SV_FLAGS = ["ZVT_ON", "ZVE32F_ON", "ZVFBFMIN_ON", "USE_GENERIC"]
INCLUDE_DIRS = [REPOS["hardware"] / "hdl/verilog/rvv/inc", REPOS["hardware"] / "hdl/verilog/rvv/common", REPOS["hardware"] / "hdl/verilog", REPOS["hardware"]]


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args]).decode().strip()


def symbol_id(repo, path, name, line):
    return f"{repo}:{path}#{name}:{line}"


def syntax_kind(node):
    return str(getattr(node, "kind", "")).removeprefix("SyntaxKind.")


def sv_parse(repo_id, relative, path):
    import pyslang
    sm = pyslang.SourceManager()
    for include in INCLUDE_DIRS:
        sm.addUserDirectories(str(include))
    opts = pyslang.parsing.PreprocessorOptions()
    opts.predefines = SV_FLAGS
    tree = pyslang.syntax.SyntaxTree.fromFile(str(path), sm, pyslang.Bag([opts]))
    modules, edges, imports, diagnostics = {}, [], [], []

    def location(node):
        loc = node.sourceRange.start
        origin = Path(str(sm.getFileName(loc)))
        return origin, sm.getLineNumber(loc), sm.getLineNumber(node.sourceRange.end)

    def is_original(node):
        try:
            return location(node)[0].resolve() == path.resolve()
        except Exception:
            return False

    def owner(node):
        cursor = node
        while cursor is not None:
            if syntax_kind(cursor) == "ModuleDeclaration" and is_original(cursor):
                line = sm.getLineNumber(cursor.header.name.location)
                return cursor.header.name.valueText, line
            cursor = getattr(cursor, "parent", None)
        return None

    def visit_module(node):
        if not is_original(node):
            return
        name = node.header.name.valueText
        line = sm.getLineNumber(node.header.name.location)
        modules[(name, line)] = {"id": symbol_id(repo_id, relative, name, line), "name": name, "kind": "module", "line": line,
                                 "endLine": sm.getLineNumber(node.endmodule.location), "ports": [], "parameters": [],
                                 "method": "pyslang-syntax-tree"}

    def visit_port(node):
        current = owner(node)
        if not current or not is_original(node):
            return
        module = modules.get(current)
        if not module:
            return
        decls = [node.declarator] if hasattr(node, "declarator") else list(getattr(node, "declarators", []))
        header = str(getattr(node, "header", "")).strip()
        direction_match = re.search(r"\b(input|output|inout|ref)\b", header)
        for decl in decls:
            if not hasattr(decl, "name"):
                continue
            name = decl.name.valueText
            if not any(p["name"] == name for p in module["ports"]):
                module["ports"].append({"name": name, "direction": direction_match[1] if direction_match else "inherited",
                                        "declaration": re.sub(r"//[^\n]*", "", str(node)).strip()[:1200],
                                        "line": sm.getLineNumber(decl.name.location)})

    def visit_parameter(node):
        current = owner(node)
        if not current or not is_original(node) or current not in modules:
            return
        for decl in node.declarators:
            if hasattr(decl, "name"):
                modules[current]["parameters"].append({"name": decl.name.valueText, "line": sm.getLineNumber(decl.name.location),
                                                        "declaration": str(decl).strip()[:1500], "kind": str(node.keyword).strip()})

    def visit_instance(node):
        current = owner(node)
        if not current or not is_original(node):
            return
        target = node.type.valueText
        for instance in node.instances:
            # Error-recovery nodes can lack a declaration after an undefined
            # macro (e.g. tests/vcs_sim/top.sv's build-provided DUT_MODULE).
            if not getattr(instance, "decl", None) or not getattr(instance.decl, "name", None):
                continue
            line = sm.getLineNumber(instance.decl.name.location)
            edges.append({"from": current[0], "to": target,
                          "fromId": symbol_id(repo_id, relative, current[0], current[1]),
                          "type": "sv-instantiates", "instance": instance.decl.name.valueText,
                          "repo": repo_id, "sourcePath": relative, "line": line,
                          "confidence": "syntax-reference-not-elaborated", "method": "pyslang-syntax-tree",
                          "parameterOverride": str(node.parameters).strip()[:1000] if node.parameters else None})

    lookup = {pyslang.syntax.SyntaxKind.ModuleDeclaration: visit_module,
              pyslang.syntax.SyntaxKind.HierarchyInstantiation: visit_instance,
              pyslang.syntax.SyntaxKind.ImplicitAnsiPort: visit_port,
              pyslang.syntax.SyntaxKind.PortDeclaration: visit_port,
              pyslang.syntax.SyntaxKind.ParameterDeclaration: visit_parameter}
    tree.root.visit(lookup_table=lookup)
    for diagnostic in tree.diagnostics:
        loc = diagnostic.location
        original = Path(str(sm.getFileName(loc)))
        try:
            source = str(original.relative_to(REPOS[repo_id]))
        except ValueError:
            source = original.name
        diagnostics.append({"code": str(diagnostic.code), "line": sm.getLineNumber(loc), "sourcePath": source,
                            "inRequestedFile": original.resolve() == path.resolve(), "error": diagnostic.isError()})
    return list(modules.values()), edges, imports, diagnostics


def ts_walk(root):
    stack = [root]
    while stack:
        node = stack.pop()
        yield node
        stack.extend(reversed(node.named_children))


def ts_name(node):
    name = node.child_by_field_name("name")
    if name:
        return name.text.decode(errors="replace")
    declarator = node.child_by_field_name("declarator")
    while declarator:
        if declarator.type in {"identifier", "field_identifier", "qualified_identifier", "operator_name", "destructor_name"}:
            return declarator.text.decode(errors="replace")
        name = declarator.child_by_field_name("name")
        if name:
            return name.text.decode(errors="replace")
        declarator = declarator.child_by_field_name("declarator")
    return None


def ts_parse(repo_id, relative, content, language):
    parser = SCALA if language == "scala" else CPP
    tree = parser.parse(content)
    symbols, edges, imports, diagnostics = [], [], [], []
    io_fields = defaultdict(list)
    mapping = {"class_definition": "class", "object_definition": "object", "trait_definition": "trait", "function_definition": "function",
               "class_specifier": "class", "struct_specifier": "struct", "enum_specifier": "enum", "namespace_definition": "namespace"}
    for node in ts_walk(tree.root_node):
        if node.type == "ERROR" or node.is_missing:
            diagnostics.append({"code": "tree-sitter-" + node.type, "line": node.start_point.row + 1, "error": True, "inRequestedFile": True})
        if node.type in mapping:
            name = ts_name(node)
            if name:
                line = node.start_point.row + 1
                symbol = {"id": symbol_id(repo_id, relative, name, line), "name": name, "kind": mapping[node.type],
                          "line": line, "endLine": node.end_point.row + 1, "method": "tree-sitter-" + language}
                params = node.child_by_field_name("class_parameters") or node.child_by_field_name("parameters")
                if params:
                    symbol["parameters"] = [{"declaration": params.text.decode(errors="replace")[:2500], "line": params.start_point.row + 1}]
                symbols.append(symbol)
        if language == "scala" and node.type == "val_definition":
            value = node.child_by_field_name("value")
            pattern = node.child_by_field_name("pattern")
            function = value.child_by_field_name("function") if value and value.type == "call_expression" else None
            if function and pattern and function.text.decode(errors="replace") in {"Input", "Output", "Flipped"}:
                cursor = node.parent
                while cursor and cursor.type not in {"class_definition", "object_definition", "trait_definition"}:
                    cursor = cursor.parent
                if cursor:
                    key = symbol_id(repo_id, relative, ts_name(cursor), cursor.start_point.row + 1)
                    io_fields[key].append({"name": pattern.text.decode(errors="replace"),
                                           "direction": function.text.decode(errors="replace").lower(),
                                           "declaration": node.text.decode(errors="replace")[:1500],
                                           "line": node.start_point.row + 1,
                                           "confidence": "chisel-io-syntax-not-elaborated"})
        if language == "scala" and node.type == "call_expression":
            function = node.child_by_field_name("function")
            arguments = node.child_by_field_name("arguments")
            if function and arguments and function.text.decode(errors="replace") == "addResource":
                resource = next((n.text.decode(errors="replace").strip('"') for n in arguments.named_children if n.type == "string"), None)
                cursor = node.parent
                while cursor and cursor.type not in {"class_definition", "object_definition", "trait_definition"}:
                    cursor = cursor.parent
                if resource and cursor:
                    source_name = ts_name(cursor)
                    edges.append({"from": source_name, "to": Path(resource).stem,
                                  "fromId": symbol_id(repo_id, relative, source_name, cursor.start_point.row + 1),
                                  "type": "chisel-blackbox-resource", "resource": resource,
                                  "repo": repo_id, "sourcePath": relative, "line": node.start_point.row + 1,
                                  "confidence": "explicit-resource-reference-not-elaborated", "method": "tree-sitter-scala"})
        if node.type in {"import_declaration", "preproc_include"}:
            imports.append({"text": node.text.decode(errors="replace")[:1000], "line": node.start_point.row + 1})
        if language == "scala" and node.type == "instance_expression":
            typ = next((child for child in node.named_children if child.type in {"type_identifier", "generic_type", "stable_type_identifier"}), None)
            if not typ:
                continue
            cursor = node.parent
            is_module = False
            owner = None
            while cursor:
                if cursor.type == "call_expression":
                    function = cursor.child_by_field_name("function")
                    if function and function.text.decode(errors="replace") in {"Module", "Module.apply", "LazyModule"}:
                        is_module = True
                if cursor.type in {"class_definition", "object_definition", "trait_definition"}:
                    owner = cursor
                    break
                cursor = cursor.parent
            if owner and is_module:
                source_name = ts_name(owner)
                target_name = typ.text.decode(errors="replace").split("[")[0]
                edges.append({"from": source_name, "to": target_name,
                              "fromId": symbol_id(repo_id, relative, source_name, owner.start_point.row + 1),
                              "type": "chisel-module-construction", "repo": repo_id, "sourcePath": relative,
                              "line": node.start_point.row + 1, "confidence": "syntax-reference-not-elaborated", "method": "tree-sitter-scala"})
    for symbol in symbols:
        if symbol["id"] in io_fields:
            symbol["ports"] = io_fields[symbol["id"]]
    return symbols, edges, imports, diagnostics


def python_parse(repo_id, relative, content):
    try:
        tree = ast.parse(content.decode("utf-8"), filename=relative)
    except (SyntaxError, UnicodeDecodeError) as exc:
        return [], [], [], [{"code": "python-syntax-error", "line": getattr(exc, "lineno", 1), "error": True, "inRequestedFile": True}]
    symbols, imports = [], []
    for node in ast.walk(tree):
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            symbols.append({"id": symbol_id(repo_id, relative, node.name, node.lineno), "name": node.name,
                            "kind": "class" if isinstance(node, ast.ClassDef) else "function", "line": node.lineno,
                            "endLine": node.end_lineno, "method": "python-ast"})
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            imports.append({"text": ast.get_source_segment(content.decode("utf-8"), node), "line": node.lineno})
    return symbols, [], imports, []


def main():
    faulthandler.enable()
    OUT.mkdir(parents=True, exist_ok=True)
    corpus = OUT / "sources"
    if corpus.exists():
        shutil.rmtree(corpus)
    files, edges, all_symbols = [], [], []
    commit_map = {name: git(repo, "rev-parse", "HEAD") for name, repo in REPOS.items()}
    methods = Counter()
    for repo_id, repo in REPOS.items():
        tracked = git(repo, "ls-files", "-z").split("\0")
        for relative in tracked:
            if not relative or any(part in {"third_party", ".git", ".agents", "node_modules"} for part in Path(relative).parts):
                continue
            path = repo / relative
            if not path.is_file() or path.is_symlink():
                continue
            size = path.stat().st_size
            language = LANGUAGES.get(path.suffix, path.suffix.removeprefix(".") or "file")
            row = {"repo": repo_id, "path": relative, "bytes": size, "language": language, "symbols": [], "imports": [], "diagnostics": []}
            can_export = (path.suffix in TEXT_EXTENSIONS or path.name in {"BUILD", "Makefile", "CMakeLists.txt", "LICENSE", "LICENSE.TXT", ".gitmodules"}) and size <= 2_000_000 and not path.name.startswith(".env")
            row["sourceUrl"] = ("https://github.com/google-coral/coralnpu" if repo_id == "hardware" else "https://github.com/google-coral/coralnpu-compiler") + "/blob/" + commit_map[repo_id] + "/" + quote(relative)
            if repo_id == "compiler" and path.suffix == ".mlir" and (relative.startswith("tests/models/") or size > 65536) and not relative.startswith("tests/transforms/"):
                can_export = False
                row["contentOmittedReason"] = "Generated model/test MLIR corpus; retained in metadata and fixed-commit source link instead of public-site payload."
            if can_export:
                content = path.read_bytes()
                try:
                    if language in {"systemverilog", "verilog", "scala", "cpp", "c", "python"}:
                        print("parse", repo_id, relative, flush=True)
                    content.decode("utf-8")
                except UnicodeDecodeError:
                    can_export = False
            if can_export:
                exported = OUT / "sources" / repo_id / relative
                exported.parent.mkdir(parents=True, exist_ok=True)
                exported.write_bytes(content)
                row.update(contentPath="data/" + str(exported.relative_to(OUT)), lines=content.count(b"\n") + 1, sha256=hashlib.sha256(content).hexdigest())
                try:
                    if language in {"systemverilog", "verilog"}:
                        process = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--sv-file", repo_id, relative],
                                                 capture_output=True, timeout=40, text=True)
                        if process.returncode != 0:
                            raise RuntimeError(f"Isolated SV parser exit {process.returncode}")
                        symbols, references, imports, diagnostics = json.loads(process.stdout)
                        method = "pyslang-syntax-tree"
                    elif language in {"scala", "cpp", "c"}:
                        symbols, references, imports, diagnostics = ts_parse(repo_id, relative, content, "scala" if language == "scala" else "cpp")
                        method = "tree-sitter-" + ("scala" if language == "scala" else "cpp")
                    elif language == "python":
                        symbols, references, imports, diagnostics = python_parse(repo_id, relative, content)
                        method = "python-ast"
                    else:
                        symbols, references, imports, diagnostics = [], [], [], []
                        method = "text-only"
                    row.update(symbols=symbols, imports=imports, diagnostics=diagnostics, parseMethod=method,
                               parseStatus="diagnostics" if any(d.get("error") and d.get("inRequestedFile") for d in diagnostics) else "syntax-parsed" if method != "text-only" else "text-indexed")
                    edges.extend(references)
                    all_symbols.extend({**symbol, "repo": repo_id, "path": relative} for symbol in symbols)
                    methods[method] += 1
                except Exception as exc:
                    row.update(parseMethod="parser-exception", parseStatus="failed", diagnostics=[{"code": type(exc).__name__, "message": str(exc).replace(str(ROOT), "<workspace>")[:1000], "error": True, "inRequestedFile": True}])
            files.append(row)
        print(repo_id, sum(f["repo"] == repo_id for f in files), "files indexed", flush=True)
    by_name = defaultdict(list)
    for symbol in all_symbols:
        if symbol["kind"] in {"module", "class", "object", "trait"}:
            by_name[(symbol["repo"], symbol["name"])].append(symbol)
    for edge in edges:
        candidates = by_name[(edge["repo"], edge["to"])]
        if edge["type"] in {"sv-instantiates", "chisel-blackbox-resource"}:
            candidates = [s for s in candidates if s["kind"] == "module"]
        elif edge["type"] == "chisel-module-construction":
            candidates = [s for s in candidates if s["kind"] == "class"]
        edge["targetCandidates"] = [{"id": s["id"], "path": s["path"], "line": s["line"]} for s in candidates]
        edge["resolution"] = "unique-source-symbol" if len(candidates) == 1 else "ambiguous-source-symbol" if candidates else "external-or-not-indexed"
        if len(candidates) == 1:
            edge["toId"] = candidates[0]["id"]
    directories = Counter()
    for row in files:
        for parent in Path(row["path"]).parents:
            if str(parent) != ".":
                directories[f"{row['repo']}:{parent}"] += 1
    stats = {"files": len(files), "exportedFiles": sum("contentPath" in f for f in files),
             "sourceBytes": sum(f["bytes"] for f in files if "contentPath" in f), "symbols": len(all_symbols),
             "edges": len(edges), "uniqueResolvedEdges": sum(e["resolution"] == "unique-source-symbol" for e in edges),
             "parserFailures": sum(f.get("parseStatus") == "failed" for f in files),
             "parserFiles": dict(methods), "filesWithPrimarySyntaxDiagnostics": sum(any(d.get("error") and d.get("inRequestedFile") for d in f["diagnostics"]) for f in files),
             "filesWithIncludedHeaderDiagnostics": sum(any(d.get("error") and not d.get("inRequestedFile") for d in f["diagnostics"]) for f in files),
             "languages": dict(Counter(f["language"] for f in files)), "hardwareModules": sum(s["kind"] == "module" for s in all_symbols),
             "rtlSourceFiles": sum(f["language"] in {"systemverilog", "verilog", "scala"} for f in files)}
    result = {"schemaVersion": 1, "createdAt": datetime.now(timezone.utc).isoformat(), "commit": commit_map["hardware"],
              "repoIds": list(REPOS), "commitMap": commit_map,
              "repoUrls": {"hardware": "https://github.com/google-coral/coralnpu", "compiler": "https://github.com/google-coral/coralnpu-compiler"},
              "files": files, "symbols": all_symbols, "edges": edges,
              "directories": [{"id": path, "files": count} for path, count in sorted(directories.items())], "stats": stats,
              "method": {"pyslang": importlib.metadata.version("pyslang"), "tree-sitter": importlib.metadata.version("tree-sitter"),
                         "tree-sitter-scala": importlib.metadata.version("tree-sitter-scala"), "tree-sitter-cpp": importlib.metadata.version("tree-sitter-cpp"),
                         "svPredefines": SV_FLAGS, "svMode": "one isolated parser process and syntax tree per source file; included-header and primary-file diagnostics distinguished",
                         "graph": "Module/class source references extracted from actual syntax nodes; target names resolved only when unique in the indexed snapshot."},
              "limitations": ["This is a syntax reference graph, not a whole-chip elaborated netlist, timing graph or signal-level dataflow.",
                               "SV analysis uses explicit teaching-index feature flags, not a claim that every build configuration enables Zvt or RVV.",
                               "Generate conditions, Chisel configuration-dependent construction, compiler macros and external packages require the original build for authoritative elaboration.",
                               "The index excludes third_party, .agents, package caches, Git metadata, symlinks and binaries; text over 2 MB and the generated model/test MLIR corpus remain metadata-only with fixed-commit links. No LLVM source tree is exported.",
                               "Some standalone UVM/header-dependent files have recoverable syntax diagnostics; their declarations are not counted as a successful hardware compile.",
                               "Only RstSync plus ClockGate has separate actual Verilator elaboration evidence; no full-core RTL simulation or synthesis was run."]}
    from supplement_referenced_sources import augment_index
    result = augment_index(result)
    (OUT / "source-index.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    (OUT / "analysis").mkdir(exist_ok=True)
    (OUT / "analysis/index-summary.json").write_text(json.dumps({"commitMap": result["commitMap"], "stats": result["stats"], "method": result["method"], "limitations": result["limitations"]}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result["stats"], indent=2), flush=True)


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--sv-file":
        repo, relative = sys.argv[2:]
        print(json.dumps(sv_parse(repo, relative, REPOS[repo] / relative)))
    else:
        main()
