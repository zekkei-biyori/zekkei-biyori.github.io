#!/bin/sh
# JS のキャッシュバスターを更新する。index.html を編集したら実行してから commit する。
cd "$(dirname "$0")"
# 秒まで入れる。分単位だと連続で直したときに同じ版になり、
# 古い JS がキャッシュから使われて画面が壊れる（実際に踏んだ）。
V=$(date +%Y%m%d%H%M%S)
sed -i '' -E "s/(spots\.js\?v=)[0-9]+/\1$V/; s/(sorami-core\.js\?v=)[0-9]+/\1$V/" index.html
echo "cache buster -> $V"
