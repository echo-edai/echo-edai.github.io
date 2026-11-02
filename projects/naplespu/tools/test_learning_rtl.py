#!/usr/bin/env python3
"""Compile and execute independently authored teaching RTL, not NaplesPU itself."""
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

web = Path(__file__).resolve().parents[1]
if not shutil.which('iverilog') or not shutil.which('vvp'):
    raise SystemExit('Install Icarus Verilog (iverilog and vvp) to run these teaching tests.')
names = ['learn_fifo.sv', 'learn_scoreboard.sv', 'learn_directory.sv', 'tb_learning.sv']
(web/'research').mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='naplespu-learning-rtl-') as tmp:
    output = Path(tmp) / 'teaching.vvp'
    compile_result = subprocess.run(['iverilog','-g2012','-s','tb_learning','-o',str(output),
                                    *(str(web/'rtl'/name) for name in names)],
                                    text=True,capture_output=True,check=True)
    result = subprocess.run(['vvp',str(output)],text=True,capture_output=True,check=True,timeout=15)
    print(result.stdout.strip())
    report = {'status':'pass','checked_at_utc':datetime.now(timezone.utc).isoformat(),
              'scope':'Only the three independently authored minimal teaching modules and their directed testbench. No upstream NaplesPU build/simulation.',
              'files':['rtl/'+name for name in names], 'stdout':result.stdout.strip(),
              'compiler_stderr':compile_result.stderr,'simulator_stderr':result.stderr}
    (web/'research'/'learning-rtl-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
