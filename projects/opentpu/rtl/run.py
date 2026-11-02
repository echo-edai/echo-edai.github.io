#!/usr/bin/env python3
"""Compile/run independent teaching RTL; never invokes upstream builds."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

base = Path(__file__).resolve().parent
files = [base / f for f in ("learn_elastic.sv", "learn_xy_route.sv", "learn_scoreboard.sv", "learn_directory.sv", "tb_learning.sv")]
assert shutil.which("iverilog") and shutil.which("vvp"), "Install Icarus Verilog (iverilog + vvp) first"
with tempfile.TemporaryDirectory(prefix="opentpu-teaching-") as tmp:
    output = Path(tmp) / "teaching.vvp"
    compile_cmd = ["iverilog", "-g2012", "-Wall", "-s", "tb_learning", "-o", str(output), *[p.name for p in files]]
    compiled = subprocess.run(compile_cmd, cwd=base, text=True, capture_output=True)
    assert compiled.returncode == 0, compiled.stderr
    ran = subprocess.run(["vvp", str(output)], cwd=base, text=True, capture_output=True, timeout=30)
    assert ran.returncode == 0 and "ALL_PASS" in ran.stdout, ran.stdout + ran.stderr
    version = subprocess.run(["iverilog", "-V"], text=True, capture_output=True).stdout.splitlines()[0]
    result = {
        "scope": "Original pedagogical RTL only; not upstream openTPU verification",
        "simulator": version,
        "compile": "iverilog -g2012 -Wall -s tb_learning -o teaching.vvp learn_elastic.sv learn_xy_route.sv learn_scoreboard.sv learn_directory.sv tb_learning.sv",
        "run": "vvp teaching.vvp",
        "passed": True,
        "sources": [{"path": p.name, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in files],
        "compile_stderr": compiled.stderr,
        "stdout": ran.stdout,
        "limitations": ["No full openTPU simulation, synthesis or timing analysis", "FIFO uses 512 deterministic pseudorandom cycles plus directed cases", "XY checks all 256 coordinate pairs on 4x4 but is not a packet router", "Directory checks one implicit line and two clients only; no data plane, evictions or network ordering", "Scoreboard is a simple register busy mask, not openTPU range-dependency logic"],
    }
    report = base.parent / "research" / "rtl-validation.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(ran.stdout, end="")
    print("Report:", report)
