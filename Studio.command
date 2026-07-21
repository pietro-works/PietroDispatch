#!/bin/zsh
# Pietro Studio launcher — double-click to open the studio in your browser, no Claude needed.
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
exec node tools/studio-server.mjs
