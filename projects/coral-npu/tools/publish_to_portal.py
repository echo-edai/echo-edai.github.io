#!/usr/bin/env python3
"""Package this exhibit into the existing local portal; no remote publication."""
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

SITE = Path(__file__).resolve().parents[1]
WORKSPACE = SITE.parents[1]
PORTAL = WORKSPACE / 'public-web'
TARGET = PORTAL / 'projects' / 'coral-npu'
FILES = ('index.html', 'style.css', 'app.js', 'models.js', 'logic-models.js',
         'README.md', 'THIRD_PARTY_NOTICES.md')
DIRECTORIES = ('assets', 'content', 'data', 'rtl', 'research', 'downloads')


def starter():
    directory = SITE / 'downloads'
    directory.mkdir(exist_ok=True)
    names = [*sorted((SITE / 'rtl').glob('*.sv')), SITE / 'rtl' / 'README.md',
             SITE / 'logic-models.js', SITE / 'models.js']
    names += [SITE / 'tools' / name for name in ('test_learning_rtl.py',
              'test_learning_models.cjs', 'crosscheck_learning_models.cjs',
              'test_coral_models.cjs')]
    # Test scope stays in the package. The additional model test optionally checks
    # the archived upstream tree only when available in the authoring workspace.
    with zipfile.ZipFile(directory / 'microarchitecture-starter.zip', 'w',
                         zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('README.md', '# Coral NPU 微架构教学练习包\n\n'
                          '这是独立教学原型，并非上游 Coral RTL。\n\n'
                          '需要 Node.js 与 Icarus Verilog。在解压目录运行：\n\n'
                          '```sh\nnode tools/test_learning_models.cjs\n'
                          'python3 tools/test_learning_rtl.py\n'
                          'node tools/crosscheck_learning_models.cjs\n```\n\n'
                          '接口和范围见 rtl/README.md。测试记录写入 research/。\n'
                          'test_coral_models.cjs 包含额外的源码基线核对；'
                          '完整运行该项需要原始 authoring 工作区，见脚本说明。\n')
        for path in names:
            archive.write(path, path.relative_to(SITE))


def main():
    if not (PORTAL / 'data' / 'site.json').is_file():
        raise SystemExit('Run the authoring copy under web/coralnpu, alongside public-web.')
    starter()
    SOURCE_ALLOW = [SITE / name for name in FILES]
    for name in DIRECTORIES:
        SOURCE_ALLOW.extend(p for p in (SITE / name).rglob('*') if p.is_file())
    SOURCE_ALLOW.extend(p for p in (SITE / 'tools').iterdir()
                        if p.is_file() and p.suffix in {'.py', '.cjs', '.txt'})
    if any(p.is_symlink() for p in SOURCE_ALLOW):
        raise SystemExit('Exhibit publication refuses symlinks.')
    # Replace only this exhibit, never siblings or the portal shell.
    if TARGET.exists():
        shutil.rmtree(TARGET)
    TARGET.mkdir(parents=True)
    manifest = []
    for source in SOURCE_ALLOW:
        relative = source.relative_to(SITE)
        destination = TARGET / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        manifest.append({'path': relative.as_posix(), 'bytes': source.stat().st_size,
                         'sha256': hashlib.sha256(source.read_bytes()).hexdigest()})
    (TARGET / 'research' / 'publication-manifest.json').write_text(
        json.dumps({'scope': 'Local portal integration; no push or remote deploy.',
                    'files': manifest}, ensure_ascii=False, indent=2) + '\n')
    data_path = PORTAL / 'data' / 'site.json'
    data = json.loads(data_path.read_text())
    project = {'id': 'coral-npu', 'category': 'learning', 'categoryLabel': '交互教材',
               'format': 'RTL × 编译器 × 微架构', 'featured': False,
               'title': 'Coral NPU：从一条指令到一片计算',
               'description': '21章95节中文源码课程，三级架构地图、8种机制实验、1,408份源码正文与可运行RTL练习，串起标量、RVV、Zvt、TCM和编译器。',
               'tags': ['Coral NPU', 'RISC-V', 'RVV', 'Zvt', 'RTL', 'Compiler'],
               'href': 'projects/coral-npu/', 'date': '2026-11-02'}
    data['projects'] = [p for p in data['projects'] if p['id'] != project['id']]
    data['projects'].insert(1 if data['projects'] else 0, project)
    update = {'date': '2026-11-02', 'title': '把 Coral NPU 展开成一份可交互的源码手册',
              'description': '从硬件和编译器建立完整阅读路线，加入向量、分块、握手、NoC与目录教学实验。',
              'type': 'LEARNING / 交互教材', 'href': project['href']}
    data['updates'] = [u for u in data['updates'] if u['href'] != project['href']]
    data['updates'].insert(0, update)
    data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(f'Integrated {len(manifest)} exhibit files into projects/coral-npu/. No remote publication.')


if __name__ == '__main__':
    main()
