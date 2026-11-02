#!/usr/bin/env python3
"""Build the public Gemmini source atlas from already verified local snapshots.

No networking, execution of upstream code, or HDL elaboration is performed.
All archive paths are indexed; selected first-party text is embedded verbatim.
"""
from pathlib import Path
from collections import Counter
import hashlib
import json
import re

SITE = Path(__file__).resolve().parents[1]
WORK = SITE.parents[1]
COLLECTION = WORK / 'gemmini'
SPECIAL = {'hardware/gemmini': 'gemmini', 'hardware/chipyard': 'chipyard',
           'hardware/gemmini/software/gemmini-rocc-tests': 'tests',
           'hardware/gemmini/software/gemmini-rocc-tests/rocc-software': 'rocc',
           'hardware/gemmini/software/libgemmini': 'libgemmini',
           'hardware/gemmini/software/onnxruntime-riscv': 'onnx'}
TEXT = {'.scala', '.sbt', '.c', '.cc', '.cpp', '.h', '.hpp', '.py', '.sh', '.md',
        '.rst', '.txt', '.json', '.yml', '.yaml', '.mk', '.v', '.sv', '.vh', '.svh',
        '.s', '.S', '.ld', '.in', '.conf', '.cfg', '.tcl', '.properties', '.f', '.rom'}


def js(name, value, destination):
    destination.write_text('window.' + name + '=' + json.dumps(value, ensure_ascii=False,
                           separators=(',', ':')).replace('</', '<\\/') + ';\n')


def main():
    meta = json.loads((COLLECTION / 'docs/sources.json').read_text())
    repos, lookup, files, code, symbols, edges = [], {}, [], {}, [], []
    for n, repo in enumerate(meta['repositories']):
        ident = SPECIAL.get(repo['path'], f'dep{n:02d}')
        item = dict(id=ident, path=repo['path'], commit=repo['commit'],
                    url=repo['url'].removesuffix('.git'), label=repo['url'].removesuffix('.git').split('/')[-1])
        lookup[repo['path']] = item
        repos.append(item)
    for raw in (COLLECTION / 'docs/source-manifest.jsonl').read_text().splitlines():
        entry = json.loads(raw)
        repo = lookup[entry['repository']]
        path, size = entry['path'], entry['bytes']
        file = COLLECTION / entry['local_path']
        ident = repo['id'] + ':' + path
        suffix = file.suffix
        eligible = suffix in TEXT or file.name in {'Makefile', 'LICENSE', 'LICENSE.SiFive', 'CHIPYARD.hash'}
        embed = eligible and size < 550_000 and (
            repo['id'] in {'gemmini', 'tests', 'libgemmini', 'rocc'} or
            (repo['id'] == 'chipyard' and (path.startswith(('docs/', 'generators/chipyard/', 'sims/')) or path.startswith('LICENSE'))) or
            (repo['id'] == 'onnx' and ('systolic' in path.lower() or path in {'README.md', 'LICENSE'})))
        embedded = False
        if embed:
            try:
                # Preserve CRLF in content; splitlines is used only by the viewer.
                text = file.read_bytes().decode('utf-8')
                if '\x00' not in text:
                    code[ident] = text
                    embedded = True
            except (OSError, UnicodeError):
                pass
        files.append([repo['id'], path, size, embedded, entry['sha256']])
        if embedded and repo['id'] == 'gemmini' and suffix == '.scala':
            # Mask comments (including inactive legacy controllers) but keep line numbers.
            stripped = re.sub(r'/\*.*?\*/|//[^\n]*', lambda m: '\n' * m[0].count('\n'), text, flags=re.S)
            for match in re.finditer(r'\b(class|object|trait|def)\s+([A-Za-z_]\w*)', stripped):
                symbols.append(dict(file=ident, kind=match[1], name=match[2], line=stripped[:match.start()].count('\n')+1))
            for match in re.finditer(r'\b(?:Module|LazyModule)\s*\(\s*new\s+([A-Za-z_]\w*)', stripped):
                edges.append(dict(file=ident, target=match[1], line=stripped[:match.start()].count('\n')+1))
    (SITE / 'data').mkdir(exist_ok=True)
    js('GSOURCE', dict(repos=repos, files=files, symbols=symbols, edges=edges), SITE / 'data/source-index.js')
    js('GCODE', code, SITE / 'data/source-code.js')
    licenses = []
    for repo in repos:
        if not any(key.startswith(repo['id'] + ':') for key in code):
            continue
        for name in ['LICENSE', 'LICENSE.SiFive', 'COPYING', 'ThirdPartyNotices.txt']:
            path = COLLECTION / repo['path'] / name
            if path.is_file():
                licenses.append(dict(repo=repo['id'], name=name, text=path.read_text(errors='replace'),
                                     url=repo['url']+'/blob/'+repo['commit']+'/'+name))
    js('GLICENSES', licenses, SITE / 'data/licenses.js')
    audit = dict(repositories=len(repos), indexed_files=len(files), embedded_files=len(code),
                 embedded_characters=sum(map(len, code.values())), scala_declarations=len(symbols),
                 lexical_instantiations=len(edges),
                 scope='Lexical source locations only. Module edges are not elaborated hardware hierarchy.',
                 repo_counts=dict(Counter(f[0] for f in files)),
                 sha256={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in (SITE/'data').glob('*.js')})
    (SITE / 'research/source-data-audit.json').write_text(json.dumps(audit, indent=2, ensure_ascii=False)+'\n')
    print(json.dumps({k:v for k,v in audit.items() if k not in {'sha256', 'repo_counts'}}, ensure_ascii=False))


if __name__ == '__main__':
    main()
