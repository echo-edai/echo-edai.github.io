#!/usr/bin/env python3
"""Run only independent teaching RTL; never execute upstream build scripts."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
SOURCES = ['learn_elastic.sv', 'learn_pe.sv', 'learn_directory.sv', 'tb_learning.sv']

def main():
    for tool in ('iverilog', 'vvp'):
        if not shutil.which(tool):
            raise SystemExit(f'Required executable is missing: {tool}')
    version = subprocess.run(['iverilog', '-V'], capture_output=True, text=True, check=True).stdout.splitlines()[0]
    with tempfile.TemporaryDirectory(prefix='gemmini-teaching-') as temp:
        binary = str(Path(temp) / 'teaching.vvp')
        compile_cmd = ['iverilog', '-g2012', '-s', 'tb_learning', '-o', binary, *SOURCES]
        built = subprocess.run(compile_cmd, cwd=ROOT, capture_output=True, text=True)
        if built.returncode:
            raise SystemExit(built.stdout + built.stderr)
        executed = subprocess.run(['vvp', binary], cwd=ROOT, capture_output=True, text=True, timeout=30)
        print(executed.stdout, end='')
        if executed.returncode:
            raise SystemExit(executed.stderr or f'Simulation exit code {executed.returncode}')
        match = re.search(r'PASS (\d+) checks', executed.stdout)
        if not match:
            raise SystemExit('Simulation did not report a passing check count')
    report = {
        'generated_at_utc': datetime.now(timezone.utc).isoformat(),
        'scope': 'Independent teaching prototypes only; not Gemmini upstream simulation.',
        'passed': True,
        'checks': int(match[1]),
        'tool': version,
        'compile': ['iverilog', '-g2012', '-s', 'tb_learning', '-o', '<temporary-file>', *SOURCES],
        'run': ['vvp', '<temporary-file>'],
        'source_sha256': {name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in SOURCES},
        'random_seed_hex': '6941',
        'coverage': ['FIFO 500 randomized cycles with reference queue', 'OS 100 signed operand pairs with bubbles',
                     'WS 100 signed activation/partial vectors with fixed weight', 'Signed and overflow boundaries',
                     'Directory directed transitions, premature/wrong/duplicate ACK, same-edge probe+ACK, response stalls'],
        'limitations': ['No full Gemmini build, elaboration, simulation, synthesis or timing validation',
                        'Directory has no address, data, transaction ID, late-old-ACK handling or full cache protocol',
                        'Finite simulation is not a liveness or formal correctness proof'],
    }
    (ROOT/'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')

if __name__ == '__main__':
    main()
