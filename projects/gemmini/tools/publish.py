#!/usr/bin/env python3
"""Copy this static lesson into the existing public portal; never push or deploy."""
from pathlib import Path
import argparse
import json
import shutil
import zipfile

SITE = Path(__file__).resolve().parents[1]
WORK = SITE.parents[1]
PORTAL = WORK / 'public-web'
TARGET = PORTAL / 'projects/gemmini'
DIRECTORIES = ('assets', 'content', 'data', 'research', 'rtl', 'downloads')
FILES = ('index.html', 'styles.css', 'app.js', 'models.js', 'README.md', 'verification.json')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package-only', action='store_true', help='Only refresh the downloadable exercise bundle')
    args = parser.parse_args()
    if not (PORTAL / 'data/site.json').is_file():
        raise SystemExit('Expected existing public-web portal not found')
    package = SITE / 'downloads/gemmini-learning-starter.zip'
    package.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED) as archive:
        for file in sorted((SITE / 'rtl').iterdir()):
            if file.is_file():
                archive.write(file, 'gemmini-learning/rtl/' + file.name)
        for name in ('models.js', 'tools/test_models.cjs', 'research/model-tests.json'):
            archive.write(SITE / name, 'gemmini-learning/' + name)
        archive.writestr('gemmini-learning/README.md', '# Gemmini independent learning prototypes\n\nRun `python3 rtl/run.py` (Icarus required) and `node tools/test_models.cjs`.\nSee rtl/README.md for interfaces, scope and MIT license. These are not upstream Gemmini RTL and the browser algorithms are not cycle-equivalent to these prototypes.\n')
    if args.package_only:
        print(f'Prepared {package}')
        return
    TARGET.mkdir(parents=True, exist_ok=True)
    for name in DIRECTORIES:
        target = TARGET / name
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(SITE / name, target)
    for name in FILES:
        shutil.copy2(SITE / name, TARGET / name)
    # Public tools contain authored reproducibility scripts, never dependency caches.
    (TARGET / 'tools').mkdir(exist_ok=True)
    for name in ('build_data.py', 'test_models.cjs', 'validate_site.cjs', 'publish.py', 'browser_checks.js'):
        shutil.copy2(SITE / 'tools' / name, TARGET / 'tools' / name)
    data_file = PORTAL / 'data/site.json'
    data = json.loads(data_file.read_text())
    project = dict(id='gemmini', category='learning', categoryLabel='交互教材', format='源码 × 微架构实验', featured=True,
                   title='Gemmini：从命令到脉动阵列',
                   description='22章90节中文源码教材：架构地图、WS/OS推演、DMA与存储、NoC与目录一致性、573份源码全文和可运行RTL练习。',
                   tags=['Gemmini', 'NPU', 'Chisel', 'Systolic Array', 'Interactive'],
                   image='projects/gemmini/assets/silicon-landscape.png',
                   imageAlt='Gemmini概念插画：规则脉动阵列与分Bank存储，非物理版图',
                   artLabel='GEMMINI / ARCHITECTURE FIELD GUIDE',
                   href='projects/gemmini/', date='2026-11-02')
    previous = [p for p in data['projects'] if p['id'] != 'gemmini']
    for item in previous:
        item['featured'] = False
    data['projects'] = [project, *previous]
    update = dict(date='2026-11-02', title='把 Gemmini 拆成可以交互的架构教材',
                  description='沿源码追踪命令、存储和计算，加入微架构推演与独立RTL练习。',
                  type='LEARNING / 交互教材', href='projects/gemmini/')
    data['updates'] = [update, *[u for u in data['updates'] if u['href'] != 'projects/gemmini/']]
    data_file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(f'Integrated static site into {TARGET}. No Git push or remote deployment performed.')


if __name__ == '__main__':
    main()
