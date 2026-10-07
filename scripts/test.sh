#!/usr/bin/env bash
# Unit tests: pure logic with Node's built-in runner, storage with GJS.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -x node_modules/.bin/tsc ]; then node_modules/.bin/tsc --noEmit -p . && echo 'types ok'; else echo 'skip: npm install for type checking'; fi
node --test tests/*.test.js
if command -v gjs >/dev/null; then
  gjs -m tests/gjs/store.js
else
  echo "skip: gjs not installed (storage tests)"
fi
