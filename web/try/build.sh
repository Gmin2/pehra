#!/bin/zsh
# the web try page: the real app built for the browser, opened on a read only demo account.
# builds into web/try/dist, then `vercel deploy --prod` from web/try/dist
set -e
here=$(cd "$(dirname $0)" && pwd)
cd "$here/../../apps/mobile"
EXPO_PUBLIC_API=${EXPO_PUBLIC_API:-https://40-80-86-31.sslip.io} npx expo export -p web --output-dir "$here/dist"
python3 "$here/fix-assets.py" "$here/dist"
cp "$here/vercel.json" "$here/dist/"
# expo clears the output folder, keep the vercel project link across builds
cp -r "$here/.vercel" "$here/dist/" 2>/dev/null || true
