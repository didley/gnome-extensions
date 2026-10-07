#!/usr/bin/env bash
# Unit tests: pure logic with Node's built-in runner, storage with GJS.
set -euo pipefail
cd "$(dirname "$0")/.."
node --test tests/*.test.js
if command -v gjs >/dev/null; then
  gjs -m tests/gjs/store.js
else
  echo "skip: gjs not installed (storage tests)"
fi
