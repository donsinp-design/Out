#!/bin/sh
# Re-bundle the current game build into the app. Run this after any change to the game itself,
# then build in Xcode. The app loads this one file from its bundle and needs no network.
set -e
cd "$(dirname "$0")/.."
python3 build.py
cp dist/app/index.html ios/ICEMAN/Resources/index.html
echo "bundled $(du -h ios/ICEMAN/Resources/index.html | cut -f1) into the app"
