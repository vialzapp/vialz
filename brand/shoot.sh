#!/bin/sh
# shoot.sh <html> <width> <height> <scale> <out.png>: headless Chrome, then crop to the exact size
set -e
cd "$(dirname "$0")"
W=$(( $2 * $4 )); H=$(( $3 * $4 ))
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
  --force-device-scale-factor="$4" --window-size="$(( $2 + 200 )),$(( $3 + 200 ))" --screenshot="$PWD/$5" "file://$PWD/$1" >/dev/null 2>&1
sips --cropOffset 1 1 -c "$H" "$W" "$5" >/dev/null
