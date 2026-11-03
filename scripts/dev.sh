#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_dir"

# 环境、缓存和预览统一收进 work，参考目录保持只读。
export UV_PROJECT_ENVIRONMENT="$repo_dir/work/.venv"
export UV_CACHE_DIR="$repo_dir/work/uv-cache"
export UV_DEFAULT_INDEX="https://pypi.org/simple"
unset UV_INDEX_URL
export PYTHONPYCACHEPREFIX="$repo_dir/work/python-cache"
export npm_config_cache="$repo_dir/work/npm-cache"
export npm_config_registry="https://registry.npmjs.org"
export npm_config_strict_ssl=true
export npm_config_prefer_offline=true
export NODE_TLS_REJECT_UNAUTHORIZED=1
mkdir -p work
chmod -R a-w ref

format_frontend() {
  npm exec --yes --package=prettier@3.9.10 -- prettier "$1" \
    'assets/**/*.{css,js}' 'scripts/*.cjs' 'content/*.html' 'data/*.json' \
    index.html 'docs/**/*.md' AGENTS.md '.github/**/*.yml' \
    package.json .prettierrc.json
}

case "${1:-build}" in
  setup)
    uv sync --locked --group dev
    ;;
  build)
    uv run --locked python scripts/build.py
    ;;
  serve)
    uv run --locked python -m http.server "${2:-4182}" --bind 127.0.0.1 --directory work/site
    ;;
  format)
    format_frontend --write
    uv run --locked ruff check --fix scripts
    uv run --locked ruff format scripts
    ;;
  check)
    format_frontend --check
    uv run --locked ruff check scripts
    uv run --locked ruff format --check scripts
    for entry in assets/*.js scripts/*.cjs projects/*/app.js; do node --check "$entry"; done
    ;;
  *)
    printf '用法：scripts/dev.sh {setup|build|serve [端口]|format|check}\n' >&2
    exit 2
    ;;
esac
