#!/bin/sh
# JS のキャッシュバスターを更新する。index.html を編集したら実行してから commit する。
cd "$(dirname "$0")"
V=$(date +%Y%m%d%H%M)
sed -i '' -E "s/(spots\.js\?v=)[0-9]+/\1$V/; s/(sorami-core\.js\?v=)[0-9]+/\1$V/" index.html
echo "cache buster -> $V"
