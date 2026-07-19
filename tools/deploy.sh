#!/bin/bash
# Stamp all module imports with a fresh version (defeats browser/CDN caching),
# then commit and push. Usage: ./tools/deploy.sh "commit message"
set -euo pipefail
cd "$(dirname "$0")/.."
V="v$(date +%s)"
python3 - "$V" <<'PY'
import re, os, sys
V = sys.argv[1]
for f in os.listdir('src'):
    if not f.endswith('.js'): continue
    p = 'src/' + f
    s = open(p).read()
    s = re.sub(r"(from '\./[\w-]+\.js)\?v\d+'", r"\1'", s)
    s = re.sub(r"(from '(\./)[\w-]+\.js)'", lambda m: m.group(1) + "?" + V + "'", s)
    s = re.sub(r"(import '\./[\w-]+\.js)(\?v\d+)?'", lambda m: m.group(1) + "?" + V + "'", s)
    open(p, 'w').write(s)
s = open('index.html').read()
s = re.sub(r'src="\./src/main\.js(\?v\d+)?"', 'src="./src/main.js?' + V + '"', s)
open('index.html', 'w').write(s)
print("stamped", V)
PY
git add -A
git -c user.name="Rachel" -c user.email="hello@rachel.design" commit -q -m "${1:-deploy}

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -q origin master
echo "deployed"
