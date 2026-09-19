#!/bin/zsh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo '请先安装 Node.js 22 或以上版本，再打开此文件。'
  read '?按回车退出。'
  exit 1
fi
if [ ! -f dist/index.html ]; then
  npm ci || exit 1
  npm run build || exit 1
fi
echo '在浏览器打开 http://127.0.0.1:4177'
node server/index.mjs
