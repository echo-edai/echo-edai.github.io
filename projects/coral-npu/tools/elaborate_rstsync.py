#!/usr/bin/env python3
"""Actual, deliberately small Verilator elaboration evidence for two RTL modules."""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "CoralNPU/hardware/coralnpu"
OUTPUT = ROOT / "web/coralnpu/data/analysis/verilator"


def sanitize(value):
    if isinstance(value, dict):
        return {k: sanitize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize(v) for v in value]
    if isinstance(value, str):
        value = value.replace(str(ROOT) + "/", "")
        if value.startswith("/opt/") or value.startswith("/usr/"):
            return "<tool-installation>/" + Path(value).name
    return value


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    tree_path = OUTPUT / "rstsync.tree.json"
    meta_path = OUTPUT / "rstsync.meta.json"
    inputs = ["hdl/verilog/RstSync.sv", "hdl/verilog/ClockGate.sv"]
    command = ["verilator", "--json-only", "-Wno-fatal", "--top-module", "RstSync",
               "--Mdir", str(OUTPUT), "--json-only-output", str(tree_path),
               "--json-only-meta-output", str(meta_path), *[str(SOURCE / p) for p in inputs]]
    run = subprocess.run(command, capture_output=True, text=True)
    if run.returncode:
        raise RuntimeError(run.stderr)
    tree = json.loads(tree_path.read_text())
    meta = json.loads(meta_path.read_text())
    for path, value in [(tree_path, tree), (meta_path, meta)]:
        path.write_text(json.dumps(sanitize(value), ensure_ascii=False, indent=2) + "\n")
    modules = tree.get("modulesp", [])
    names = {m["addr"]: m["name"] for m in modules}
    cells = []
    for module in modules:
        stack = [module]
        while stack:
            node = stack.pop()
            if isinstance(node, dict):
                if node.get("type") == "CELL":
                    cells.append({"from": module["name"], "to": names.get(node.get("modp"), "unknown"),
                                  "instance": node.get("name"), "ports": [p.get("name") for p in node.get("pinsp", [])],
                                  "confidence": "verilator-elaborated", "location": node.get("loc")})
                stack.extend(node.values())
            elif isinstance(node, list):
                stack.extend(node)
    summary = {"tool": subprocess.check_output(["verilator", "--version"], text=True).strip(),
               "scope": "RstSync plus ClockGate only; default generic clock-gating branch; no full-chip compile/simulation/synthesis.",
               "top": "RstSync", "inputs": inputs, "exitCode": run.returncode,
               "modules": [m["name"] for m in modules], "cells": cells,
               "treePath": "data/analysis/verilator/rstsync.tree.json", "metaPath": "data/analysis/verilator/rstsync.meta.json",
               "report": sanitize(run.stdout + run.stderr)}
    (OUTPUT.parent / "verilator-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
